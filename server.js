// server.js (最終重構版 - 整合快取與代禱牆 API 優化)
require('dotenv').config(); // 將 .env 檔案中的變數載入到 process.env
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./public/config');
const sheetUtils = require('./utils/sheet'); // 引入重構後的 sheet 工具

const app = express();
const port = process.env.PORT || 3000;

// 中介軟體設定
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.json());

// 速率限制
app.use(rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 1000,
    message: 'Too many requests, please try again later.'
}));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || config.SPREADSHEET_ID;

// --- 輔助函式 ---
function handleError(res, error, message, statusCode = 500) {
    console.error(message, error.response ? error.response.data.error : error);
    res.status(statusCode).json({ message, error: error.message });
}

// --- 中介軟體 ---
const validateHall = (req, res, next) => {
    const hall = req.query.hall || req.body.hall;
    if (!hall) return res.status(400).json({ message: 'Missing hall parameter' });
    const sheetName = config.HALLS[hall];
    if (!sheetName) return res.status(400).json({ message: `Invalid hall: ${hall}` });
    req.sheetName = sheetName;
    next();
};

// --- API 路由 ---

// 點名系統相關 API
app.get('/getDateRanges', async (req, res) => {
    try {
        const range = "'設定'!A2:A";
        const sheetData = await sheetUtils.getSheetData(range);
        const dateRanges = (sheetData || []).map((row, index) => ({
            code: String.fromCharCode('G'.charCodeAt(0) + index),
            range: row[0]
        })).filter(item => item.range && item.range.trim());
        res.status(200).json({ dateRanges });
    } catch (error) {
        handleError(res, error, 'Error fetching date ranges');
    }
});

app.get('/getData', validateHall, async (req, res) => {
    // ... 此路由邏輯不變，只是呼叫的函式改變
    const { selectedDate } = req.query;
    try {
        if (!config.VALID_COLUMNS.includes(selectedDate)) {
            return res.status(400).json({ message: 'Invalid date selected' });
        }
        const RANGE = `'${req.sheetName}'!A12:R`;
        const sheetData = await sheetUtils.getSheetData(RANGE);
        const groupedData = {};
        const nameToRowIndexMap = {};
        sheetData.forEach((row, rowIndex) => {
            if (!Array.isArray(row) || row.length < 4) return;
            const name = row[2] ? row[2].trim() : '';
            const caregiver = row[3] ? row[3].trim() : '';
            if (!name || !caregiver || name === '姓名' || caregiver === '照顧者') return;
            const selectedColumnIndex = config.VALID_COLUMNS.indexOf(selectedDate);
            const attendance = (row[6 + selectedColumnIndex] || '').split(',').map(s => s.trim());
            if (!groupedData[caregiver]) groupedData[caregiver] = [];
            groupedData[caregiver].push({ name, attendance });
            nameToRowIndexMap[name] = rowIndex + 12;
        });
        res.json({ groupedData, nameToRowIndexMap });
    } catch (err) {
        handleError(res, err, 'Error retrieving sheet data');
    }
});

app.post('/addNewData', validateHall, async (req, res) => {
    const { name, identity, region, caregiver, department } = req.body;
    try {
        if (!name || !identity || !region || !caregiver) {
            return res.status(400).json({ message: 'Missing required body parameters' });
        }
        const rangeData = await sheetUtils.getSheetData(`'${req.sheetName}'!C12:C`);
        const targetRow = 12 + rangeData.length;
        const serialNumber = `=row()-12`;
        const newRow = [[serialNumber, region, name, caregiver, identity, department || '']];
        const range = `'${req.sheetName}'!A${targetRow}`;
        await sheetUtils.updateSheetData(range, newRow);
        res.status(200).json({ message: 'Data added successfully' });
    } catch (error) {
        handleError(res, error, 'Error adding new data');
    }
});

app.post('/deleteData', validateHall, async (req, res) => {
    // ... 此路由邏輯不變
    const { caregiver, name } = req.body;
    try {
        const sheetInfo = await sheetUtils.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheet = sheetInfo.data.sheets.find(s => s.properties.title === req.sheetName);
        if (!sheet) return res.status(404).json({ message: `Sheet not found: ${req.sheetName}` });
        
        const RANGE = `'${req.sheetName}'!A12:D`;
        const sheetData = await sheetUtils.getSheetData(RANGE);
        const rowToDelete = sheetData.findIndex(row => (row[2] && row[2].trim() === name) && (row[3] && row[3].trim() === caregiver));
        if (rowToDelete === -1) return res.status(404).json({ message: 'Record not found' });
        
        const rowIndexToDelete = rowToDelete + 11; // 轉換為 0-based 索引
        await sheetUtils.deleteSheetRows(sheet.properties.sheetId, rowIndexToDelete, rowIndexToDelete + 1);
        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Error deleting data');
    }
});

app.post('/updateData', validateHall, async (req, res) => {
    // ... 此路由邏輯不變
    const { updatedData, nameToRowIndexMap, selectedDate } = req.body;
    try {
        const columnIndex = config.VALID_COLUMNS.indexOf(selectedDate);
        if (columnIndex === -1) return res.status(400).json({ message: 'Invalid date selected' });
        const data = [];
        for (const caregiver in updatedData) {
            if (Array.isArray(updatedData[caregiver])) {
                updatedData[caregiver].forEach(person => {
                    const rowIndex = nameToRowIndexMap[person.name];
                    if (rowIndex) {
                        data.push({
                            range: `'${req.sheetName}'!${String.fromCharCode(71 + columnIndex)}${rowIndex}`,
                            values: [[person.selectedOptions.join(',')]]
                        });
                    }
                });
            }
        }
        if (data.length > 0) await sheetUtils.batchUpdateSheetData(data);
        res.status(200).json({ message: 'Data updated successfully' });
    } catch (error) {
        handleError(res, error, 'Error updating data');
    }
});

// 其他相關 API
app.get('/getRegions', validateHall, async (req, res) => {
    // ... 此路由邏輯不變
    const { hall } = req.query;
    try {
        const regionColumn = config.REGION_COLUMNS[hall];
        if (!regionColumn) return res.status(400).json({ message: `No region column configured for hall: ${hall}` });
        const range = `'設定'!${regionColumn}2:${regionColumn}`;
        const sheetData = await sheetUtils.getSheetData(range);
        const regions = sheetData.map(row => row[0]).filter(Boolean);
        res.json(regions);
    } catch (err) {
        handleError(res, err, 'Error retrieving regions');
    }
});

app.get('/getStats', validateHall, async (req, res) => {
    // ... 此路由邏輯不變
    const { selectedDate } = req.query;
    try {
        if (!config.VALID_COLUMNS.includes(selectedDate)) return res.status(400).json({ message: 'Invalid date selected' });
        const RANGE = `'${req.sheetName}'!A12:R`;
        const sheetData = await sheetUtils.getSheetData(RANGE);
        const options = ['有主日(早上)', '聖經講座(晚上)', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];
        const stats = { '總數': 0 };
        options.forEach(option => stats[option] = 0);
        const selectedColumnIndex = config.VALID_COLUMNS.indexOf(selectedDate);
        sheetData.forEach(row => {
            if (!Array.isArray(row) || row.length < 4) return;
            const name = row[2] ? row[2].trim() : '';
            const caregiver = row[3] ? row[3].trim() : '';
            if (!name || !caregiver || name === '姓名' || caregiver === '照顧者') return;
            stats['總數']++;
            const attendanceString = row[6 + selectedColumnIndex] || '';
            const attendance = attendanceString.split(',').map(s => s.trim()).filter(Boolean);
            attendance.forEach(att => { if(options.includes(att)) stats[att]++; });
        });
        res.json(stats);
    } catch (err) {
        handleError(res, err, 'Error retrieving stats');
    }
});

// 3/29 青年大會相關 API
app.get('/getTargetCount', async (req, res) => {
    try {
        const range = "'3/29青年大會'!I3";
        const sheetData = await sheetUtils.getSheetData(range);
        const count = (sheetData.length > 0 && sheetData[0][0]) ? parseInt(sheetData[0][0], 10) : 0;
        res.status(200).json({ count });
    } catch (error) {
        handleError(res, error, 'Error fetching target count');
    }
});

app.get('/getSignupList', async (req, res) => {
    try {
        const range = "'3/29青年大會'!B2:B";
        const sheetData = await sheetUtils.getSheetData(range);
        const names = sheetData.map(row => row[0]).filter(name => name && name.trim() && name !== '姓名');
        res.status(200).json({ names });
    } catch (error) {
        handleError(res, error, 'Error fetching signup list');
    }
});

// --- 代禱牆 API (已重構) ---
const PRAYER_SHEET_NAME = config.PRAYER_SHEET || '代禱牆';

app.get('/getPrayerData', validateHall, async (req, res) => {
    const hallColumns = config.PRAYER_HALL_COLUMNS[req.body.hall || req.query.hall];
    if (!hallColumns) return res.status(400).json({ message: "Invalid prayer hall" });
    
    try {
        const { nameCol, statusCol } = hallColumns;
        const range = `'${PRAYER_SHEET_NAME}'!${String.fromCharCode(65 + nameCol)}3:${String.fromCharCode(65 + statusCol)}`;
        const sheetData = await sheetUtils.getSheetData(range);
        
        const prayerData = {};
        if (sheetData) {
            sheetData.forEach((row, index) => {
                if (row[0] && row[1]) {
                    prayerData[`prayer-${index + 3}`] = { content: row[0].trim(), status: row[1].trim() };
                }
            });
        }
        res.json(prayerData);
    } catch (err) {
        handleError(res, err, 'Error retrieving prayer data');
    }
});

app.post('/addPrayer', validateHall, async (req, res) => {
    const { content, status } = req.body;
    const hallColumns = config.PRAYER_HALL_COLUMNS[req.body.hall];
    if (!hallColumns) return res.status(400).json({ message: "Invalid prayer hall" });
    
    try {
        const { nameCol, statusCol } = hallColumns;
        const colLetter = String.fromCharCode(65 + nameCol);
        const rangeData = await sheetUtils.getSheetData(`'${PRAYER_SHEET_NAME}'!${colLetter}3:${colLetter}`);
        const targetRow = 3 + rangeData.length;
        const range = `'${PRAYER_SHEET_NAME}'!${colLetter}${targetRow}`;
        await sheetUtils.updateSheetData(range, [[content, status]]);
        res.status(200).json({ message: 'Prayer added successfully' });
    } catch (error) {
        handleError(res, error, 'Error adding prayer');
    }
});

app.post('/deletePrayer', validateHall, async (req, res) => {
    const { id } = req.body;
    const hallColumns = config.PRAYER_HALL_COLUMNS[req.body.hall];
    if (!hallColumns) return res.status(400).json({ message: "Invalid prayer hall" });

    try {
        const rowNum = parseInt(id.split('-')[1], 10);
        if (isNaN(rowNum)) return res.status(400).json({ message: `Invalid prayer ID format.` });
        
        const { nameCol, statusCol } = hallColumns;
        const range = `'${PRAYER_SHEET_NAME}'!${String.fromCharCode(65 + nameCol)}${rowNum}:${String.fromCharCode(65 + statusCol)}${rowNum}`;
        await sheetUtils.clearSheetData(range);
        res.status(200).json({ message: 'Prayer cleared successfully' });
    } catch (error) {
        handleError(res, error, 'Error clearing prayer');
    }
});

app.post('/updatePrayerStatus', validateHall, async (req, res) => {
    const { id, status } = req.body;
    const hallColumns = config.PRAYER_HALL_COLUMNS[req.body.hall];
    if (!hallColumns) return res.status(400).json({ message: "Invalid prayer hall" });

    try {
        const rowNum = parseInt(id.split('-')[1], 10);
        if (isNaN(rowNum)) return res.status(400).json({ message: `Invalid prayer ID format.` });

        const { statusCol } = hallColumns;
        const range = `'${PRAYER_SHEET_NAME}'!${String.fromCharCode(65 + statusCol)}${rowNum}`;
        await sheetUtils.updateSheetData(range, [[status]]);
        res.status(200).json({ message: 'Status updated successfully' });
    } catch (error) {
        handleError(res, error, 'Error updating status');
    }
});

app.get('/getPrayerStats', validateHall, async (req, res) => {
    const hallColumns = config.PRAYER_HALL_COLUMNS[req.query.hall];
    if (!hallColumns) return res.status(400).json({ message: "Invalid prayer hall" });

    try {
        const { nameCol, statusCol } = hallColumns;
        const range = `'${PRAYER_SHEET_NAME}'!${String.fromCharCode(65 + nameCol)}3:${String.fromCharCode(65 + statusCol)}`;
        const sheetData = await sheetUtils.getSheetData(range);
        
        const stats = { total: 0, '✅': 0, '❌': 0, '❓': 0, '#️⃣': 0 };
        if (sheetData) {
            sheetData.forEach(row => {
              if (row[0]) { // 只要有名字就算一筆
                stats.total++;
                const status = row[1] ? row[1].trim() : '#️⃣'; // 如果狀態為空，預設為'#️⃣'
                if (stats.hasOwnProperty(status)) {
                    stats[status]++;
                }
              }
            });
        }
        res.json(stats);
    } catch (err) {
        handleError(res, err, 'Error retrieving prayer stats');
    }
});


// 啟動伺服器
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});