// server.js (最終完整版)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LineStrategy = require('passport-line').Strategy;
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { google } = require('googleapis');
const config = require('./public/config');
const sheetUtils = require('./utils/sheet');

// --- 環境變數設定 ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- Winston Logger 設定 ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
  ],
});

const app = express();
const port = process.env.PORT || 3000;

// --- 中介軟體設定 ---
app.set('trust proxy', 1); // 信任 Render 的反向代理
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
    origin: process.env.BASE_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 10 * 60 * 1000, max: 1000 }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_secret_key_for_development',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: IS_PRODUCTION, // 線上環境使用安全 cookie
        httpOnly: true,
        sameSite: 'lax'
    } 
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Google Sheets API 設定 ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = process.env.GOOGLE_CREDENTIALS 
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require('./credentials.json');
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Passport 與 LINE Login 設定 ---
passport.use(new LineStrategy({
    channelID: process.env.LINE_CHANNEL_ID,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    callbackURL: IS_PRODUCTION ? process.env.CALLBACK_URL : "http://localhost:3000/auth/line/callback"
}, async (accessToken, refreshToken, profile, done) => {
    const { id: lineUserId, displayName } = profile;
    logger.info(`User attempting login: ${displayName} (ID: ${lineUserId})`);
    try {
        const usersRange = "'Users'!A2:C";
        const users = await sheetUtils.getSheetData(usersRange);
        let user = users.find(u => u && u[0] === lineUserId);

        if (user) {
            if (user[2] !== displayName) {
                const userRowIndex = users.findIndex(u => u && u[0] === lineUserId) + 2;
                await sheetUtils.updateSheetData(`'Users'!C${userRowIndex}`, [[displayName]]);
            }
        } else {
            const newRowValues = [[lineUserId, 'guest', displayName]];
            await sheetUtils.updateSheetData(`'Users'!A${users.length + 2}`, newRowValues);
            user = newRowValues[0];
        }
        return done(null, { id: user[0], role: user[1], name: user[2] });
    } catch (err) {
        logger.error("Authentication process error", err);
        return done(err);
    }
}));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// --- 輔助函式 & 權限中介軟體 ---
function handleError(res, error, message, statusCode = 500) {
    logger.error(message, { error: error.message, stack: error.stack });
    res.status(statusCode).json({ message, error: error.message });
}

const validateHall = (req, res, next) => {
    const hall = req.query.hall || req.body.hall;
    if (!hall) return res.status(400).json({ message: 'Missing hall parameter' });
    const sheetName = config.HALLS[hall];
    if (!sheetName) return res.status(400).json({ message: `Invalid hall: ${hall}` });
    req.sheetName = sheetName;
    next();
};

const validatePrayerHall = (req, res, next) => {
    const group = req.query.group || req.body.group;
    if (!group) return res.status(400).json({ message: 'Missing group parameter' });
    const groupInfo = config.PRAYER_GROUPS[group];
    if (!groupInfo) return res.status(400).json({ message: `Invalid prayer group: ${group}` });
    req.group = group;
    req.groupInfo = groupInfo;
    next();
};

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated() && req.user && (req.user.role === 'admin' || req.user.role === 'editor')) {
        return next();
    }
    if (req.path.startsWith('/api/') || req.path.startsWith('/get')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login.html');
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
      return next();
  }
  return res.status(403).json({ error: 'Forbidden: Admins only' });
}

// --- 認證 & 使用者管理 API ---
app.get('/auth/line', passport.authenticate('line'));
app.get('/auth/line/callback', passport.authenticate('line', { successRedirect: '/', failureRedirect: '/login.html' }));
app.get('/auth/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        req.session.destroy(() => res.redirect('/login.html'));
    });
});
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: req.user });
    } else {
        res.json({ loggedIn: false });
    }
});
app.get('/api/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const range = "'Users'!A2:C";
        const sheetData = await sheetUtils.getSheetData(range);
        const users = (sheetData || []).map(row => ({
            lineUserId: row[0], role: row[1], name: row[2]
        })).filter(user => user.lineUserId);
        res.json(users);
    } catch (error) {
        handleError(res, error, 'Error fetching user list');
    }
});
app.post('/api/users/update-role', isAuthenticated, isAdmin, async (req, res) => {
    const { lineUserId, newRole } = req.body;
    if (!lineUserId || !newRole || !['admin', 'editor', 'guest'].includes(newRole)) {
        return res.status(400).json({ message: 'Invalid parameters' });
    }
    try {
        const idColumnData = await sheetUtils.getSheetData("'Users'!A2:A");
        const userRowIndex = idColumnData.findIndex(row => row[0] === lineUserId);
        if (userRowIndex === -1) return res.status(404).json({ message: 'User not found' });
        const targetCell = `'Users'!B${userRowIndex + 2}`;
        await sheetUtils.updateSheetData(targetCell, [[newRole]]);
        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        handleError(res, error, 'Error updating user role');
    }
});

// --- 點名系統 API ---
app.get('/getDateRanges', isAuthenticated, async (req, res) => {
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
app.get('/getData', isAuthenticated, validateHall, async (req, res) => {
    const { selectedDate } = req.query;
    try {
        if (!config.VALID_COLUMNS.includes(selectedDate)) return res.status(400).json({ message: 'Invalid date selected' });
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
app.post('/addNewData', isAuthenticated, validateHall, async (req, res) => {
    const { name, identity, region, caregiver, department } = req.body;
    try {
        if (!name || !identity || !region || !caregiver) return res.status(400).json({ message: 'Missing required parameters' });
        const rangeData = await sheetUtils.getSheetData(`'${req.sheetName}'!C12:C`);
        const targetRow = 12 + (rangeData ? rangeData.length : 0);
        const serialNumber = `=row()-12`;
        const newRow = [[serialNumber, region, name, caregiver, identity, department || '']];
        const range = `'${req.sheetName}'!A${targetRow}`;
        await sheetUtils.updateSheetData(range, newRow);
        res.status(200).json({ message: 'Data added successfully' });
    } catch (error) {
        handleError(res, error, 'Error adding new data');
    }
});
app.post('/deleteData', isAuthenticated, validateHall, async (req, res) => {
    const { caregiver, name } = req.body;
    try {
        const sheetInfo = await sheetUtils.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheet = sheetInfo.data.sheets.find(s => s.properties.title === req.sheetName);
        if (!sheet) return res.status(404).json({ message: `Sheet not found: ${req.sheetName}` });
        const RANGE = `'${req.sheetName}'!A12:D`;
        const sheetData = await sheetUtils.getSheetData(RANGE);
        const rowToDelete = sheetData.findIndex(row => (row[2] && row[2].trim() === name) && (row[3] && row[3].trim() === caregiver));
        if (rowToDelete === -1) return res.status(404).json({ message: 'Record not found' });
        const rowIndexToDelete = rowToDelete + 11;
        await sheetUtils.deleteSheetRows(sheet.properties.sheetId, rowIndexToDelete, rowIndexToDelete + 1);
        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Error deleting data');
    }
});
app.post('/updateData', isAuthenticated, validateHall, async (req, res) => {
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
app.get('/getRegions', isAuthenticated, validateHall, async (req, res) => {
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
app.get('/getStats', isAuthenticated, validateHall, async (req, res) => {
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

// --- 3/29 青年大會 API (公開) ---
app.get('/getTargetCount', async (req, res) => {
    try {
        const range = "'3/29青年大會'!I3";
        const sheetData = await sheetUtils.getSheetData(range);
        const count = (sheetData && sheetData.length > 0 && sheetData[0][0]) ? parseInt(sheetData[0][0], 10) : 0;
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

// --- 代禱牆 API (全新修正版) ---
const PRAYER_SHEET_NAME = config.PRAYER_SHEET || '代禱牆';

// 獲取指定群組的代禱事項
app.get('/api/prayer-items', isAuthenticated, validatePrayerHall, async (req, res) => {
    try {
        const { nameCol, itemCol } = req.groupInfo;
        // ★ 修正 ★: 從第 3 列開始讀取
        const range = `'${PRAYER_SHEET_NAME}'!${String.fromCharCode(65 + nameCol)}3:${String.fromCharCode(65 + itemCol)}`;
        const sheetData = await sheetUtils.getSheetData(range);
        
        const items = (sheetData || []).map((row, index) => ({
            // ★ 修正 ★: id 現在是索引值 + 3
            id: index + 3,
            name: row[0] || '',
            item: row[1] || ''
        })).filter(d => d.name && d.name.trim() !== ''); // 只回傳有名字的項目

        res.json(items);
    } catch (err) {
        handleError(res, err, 'Error retrieving prayer items');
    }
});

// ★★★ 核心修正：更新「新增代禱事項」的邏輯 ★★★
app.post('/api/prayer-items', isAuthenticated, validatePrayerHall, async (req, res) => {
    const { name, item } = req.body;
    if (!name || !item) {
        return res.status(400).json({ message: '姓名和代禱事項為必填' });
    }
    
    try {
        const { nameCol } = req.groupInfo;
        const nameColLetter = String.fromCharCode(65 + nameCol);
        
        // 1. 讀取整個姓名欄位的資料，以找出空行
        const allNamesInRange = await sheetUtils.getSheetData(`'${PRAYER_SHEET_NAME}'!${nameColLetter}3:1000`); // 假設最多1000筆
        
        let targetRow;
        // 2. 尋找第一個空行
        const firstEmptyRowIndex = allNamesInRange.findIndex(row => !row || !row[0] || row[0].trim() === '');
        
        if (firstEmptyRowIndex !== -1) {
            // 如果找到了空行，就使用那個空行的行號
            targetRow = 3 + firstEmptyRowIndex;
        } else {
            // 如果沒有找到任何空行，則在列表末尾新增
            targetRow = 3 + (allNamesInRange.length || 0);
        }
        
        const range = `'${PRAYER_SHEET_NAME}'!${nameColLetter}${targetRow}`;
        await sheetUtils.updateSheetData(range, [[name, item]]);
        
        res.status(201).json({ message: '代禱事項新增成功' });
    } catch (error) {
        handleError(res, error, 'Error adding prayer item');
    }
});

// 更新代禱事項
app.put('/api/prayer-items/:id', isAuthenticated, validatePrayerHall, async (req, res) => {
    const { id } = req.params;
    const { name, item } = req.body;
    const rowNum = parseInt(id, 10);

    if (isNaN(rowNum) || !name || !item) {
        return res.status(400).json({ message: '無效的 ID 或缺少姓名/代禱事項' });
    }

    try {
        const { nameCol } = req.groupInfo;
        const nameColLetter = String.fromCharCode(65 + nameCol);
        const range = `'${PRAYER_SHEET_NAME}'!${nameColLetter}${rowNum}`;
        await sheetUtils.updateSheetData(range, [[name, item]]);

        res.json({ message: '代禱事項更新成功' });
    } catch (error) {
        handleError(res, error, 'Error updating prayer item');
    }
});

// 刪除代禱事項
app.delete('/api/prayer-items/:id', isAuthenticated, validatePrayerHall, async (req, res) => {
    const { id } = req.params;
    const rowNum = parseInt(id, 10);

    if (isNaN(rowNum)) {
        return res.status(400).json({ message: '無效的 ID' });
    }

    try {
        const { nameCol, itemCol } = req.groupInfo;
        const range = `'${PRAYER_SHEET_NAME}'!${String.fromCharCode(65 + nameCol)}${rowNum}:${String.fromCharCode(65 + itemCol)}${rowNum}`;
        
        // ★ 修正 ★: 刪除操作現在是將該行的內容清空
        // 這樣做不會影響其他事項的行號 (ID)，前端體驗會更好。
        // 前後端的讀取和新增邏輯已能正確處理空行。
        await sheetUtils.clearSheetData(range);

        res.json({ message: '代禱事項刪除成功' });
    } catch (error) {
        handleError(res, error, 'Error deleting prayer item');
    }
});


// --- 啟動伺服器 ---
app.listen(port, () => {
  logger.info(`Server is running in ${IS_PRODUCTION ? 'production' : 'development'} mode on port ${port}`);
});