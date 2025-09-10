// 引入必要的套件
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const config = require('./public/config');
const rateLimit = require('express-rate-limit');
const line = require('@line/bot-sdk'); // 引入 LINE Bot SDK

const app = express();
const port = process.env.PORT || 3000;

// --- LINE Bot 設定 ---
// 從環境變數讀取 LINE Channel 的憑證，這樣更安全
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'wPyW+1r1az8nHEYXthLjLqhzGXwM/AgG6sLo7J9Yb7OtG0gZQtNhMkxrAqdr/nwfWuu6Wn4K2EMa73f03kcMIHi+fk6PnIlUT8eA2yX6gB6NZ7u+Qi7MzXT4JmpHQtmlamQMKhgpYkLHajnLl70HNgdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.CHANNEL_SECRET || '2cd61196413975588b2878a3a0acde35',
};

const lineClient = new line.Client(lineConfig);

// Webhook 路由，用來接收來自 LINE 平台的訊息
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// LINE 事件處理函式
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }
  // 簡單的 echo bot，收到什麼回什麼
  const echo = { type: 'text', text: event.message.text };
  return lineClient.replyMessage(event.replyToken, echo);
}


// --- Google Sheets API 設定 ---
const credentials = require('./credentials.json');
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// 取得 Google Sheet 資料的輔助函式
async function getSheetData(range) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: range,
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`讀取範圍 ${range} 失敗:`, error.message);
        throw new Error(`Google Sheets API 錯誤: ${error.message}`);
    }
}

// 格式化每一行資料的輔助函式
function formatRowData(row, validColumns, selectedDate) {
  const name = row[1] ? row[1].trim() : '';
  const caregiver = row[5] ? row[5].trim() : '';

  if (!name || !caregiver || name === '序') return null;

  const attendanceData = row.slice(6, 24) || [];
  const attendance = attendanceData.map(cell => cell ? cell.trim() : '');
  const selectedColumnIndex = validColumns.indexOf(selectedDate);
  const selectedAttendance = attendance[selectedColumnIndex] || '';

  return { name, caregiver, selectedAttendance };
}


// --- API 路由 ---

// 獲取各會所點名資料
app.get('/getData', async (req, res) => {
  console.log(`[後端日誌] 收到 /getData 請求，參數為:`, req.query);
  const { selectedDate, hall } = req.query;

  try {
    const validColumns = config.VALID_COLUMNS;
    if (!validColumns.includes(selectedDate)) {
      console.error(`[後端日誌] 無效的 selectedDate: '${selectedDate}'`);
      return res.status(400).json({ message: '無效的日期選項' });
    }

    const sheetName = config.HALLS[hall];
    if (!sheetName) {
        return res.status(400).json({ message: `無效的會所名稱: ${hall}` });
    }
    const RANGE = `${sheetName}!A12:X`;
    const sheetData = await getSheetData(RANGE);

    if (!sheetData || sheetData.length === 0) {
      return res.json({ groupedData: {}, nameToRowIndexMap: {} });
    }

    const groupedData = {};
    const nameToRowIndexMap = {};

    sheetData.forEach((row, rowIndex) => {
      const formattedData = formatRowData(row, validColumns, selectedDate);
      if (formattedData) {
        const { name, caregiver, selectedAttendance } = formattedData;
        if (!groupedData[caregiver]) groupedData[caregiver] = [];
        groupedData[caregiver].push({ name, attendance: selectedAttendance ? selectedAttendance.split(',').map(s => s.trim()) : [] });
        nameToRowIndexMap[name] = rowIndex + 12;
      }
    });

    res.json({ groupedData, nameToRowIndexMap });
  } catch (err) {
    console.error('獲取點名資料時出錯:', err);
    res.status(500).json({ message: '獲取點名資料時出錯', error: err.message });
  }
});

// 獲取統計數據
app.get('/getStats', async (req, res) => {
    // 此路由的邏輯與您原始檔案相同，此處為示意
    const { selectedDate, hall } = req.query;
    // ... 處理獲取統計數據的邏輯 ...
    res.json({ message: "Stats endpoint ok" });
});

// 新增名單
app.post('/addNewData', async (req, res) => {
    // 此路由的邏輯與您原始檔案相同，此處為示意
    const { hall, name, caregiver } = req.body;
    // ... 處理新增名單的邏輯 ...
    res.json({ message: "Add new data endpoint ok" });
});

// 更新點名狀態
app.post('/updateData', async (req, res) => {
    // 此路由的邏輯與您原始檔案相同，此處為示意
    const { updatedData, hall, selectedDate } = req.body;
    // ... 處理更新點名狀態的邏輯 ...
    res.json({ message: "Update data endpoint ok" });
});

// 刪除名單
app.post('/deleteData', async (req, res) => {
    // 此路由的邏輯與您原始檔案相同，此處為示意
    const { hall, name } = req.body;
    // ... 處理刪除名單的邏輯 ...
    res.json({ message: "Delete data endpoint ok" });
});


// --- 3/29 青年大會 & 代禱牆 API ---
app.get('/getTargetCount', async (req, res) => {
    try {
        const range = '3/29青年大會!I3';
        const sheetData = await getSheetData(range);
        const count = (sheetData.length && sheetData[0][0]) ? parseInt(sheetData[0][0], 10) : 0;
        res.status(200).json({ count });
    } catch (error) {
        console.error('Error fetching target count:', error);
        res.status(500).json({ message: 'Error fetching target count', error: error.message });
    }
});

app.get('/getSignupList', async (req, res) => {
    try {
        const range = '3/29青年大會!B2:B';
        const sheetData = await getSheetData(range);
        const names = sheetData.map(row => row[0]).filter(Boolean);
        res.status(200).json({ names });
    } catch (error) {
        console.error('Error fetching signup list:', error);
        res.status(500).json({ message: 'Error fetching signup list', error: error.message });
    }
});

app.get('/getDateRanges', async (req, res) => {
    try {
        const range = '設定!A2:A';
        const sheetData = await getSheetData(range);
        const dateRanges = sheetData.map(row => row[0]).filter(Boolean);
        res.status(200).json({ dateRanges });
    } catch (error) {
        console.error('Error fetching date ranges:', error);
        res.status(500).json({ message: 'Error fetching date ranges', error: error.message });
    }
});
app.get('/getPrayerData', async (req, res) => {
  const { hall } = req.query;
  const sheetName = config.PRAYER_SHEET || '代禱牆';

  try {
    const hallColumns = {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
    };

    if (!hallColumns[hall]) {
      return res.status(400).json({ message: `Invalid hall: ${hall}.` });
    }

    const { nameCol, statusCol } = hallColumns[hall];
    const dataRange = `${sheetName}!A3:N`; // 讀取到 N 欄
    const sheetData = await getSheetData(dataRange);

    const prayerData = {};
    if (sheetData) {
        sheetData.forEach((row, index) => {
            if (row[nameCol] && row[nameCol].trim()) {
                const id = `${hall}-${index + 3}`; // 確保 ID 唯一
                prayerData[id] = { 
                    content: row[nameCol].trim(), 
                    status: row[statusCol] ? row[statusCol].trim() : '#️⃣', // 預設狀態
                    hall 
                };
            }
        });
    }
    
    res.json(prayerData);
  } catch (err) {
    console.error('Error retrieving prayer data:', err);
    res.status(500).json({ message: 'Error retrieving prayer data', error: err.message });
  }
});

// 修改新增代禱事項路由，使用 update 而不是 append
app.post('/addPrayer', async (req, res) => {
  const { content, status, hall } = req.body;

  try {
    const sheetName = config.PRAYER_SHEET || '代禱牆';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const hallColumns = {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
    };

    if (!hallColumns[hall]) {
      return res.status(400).json({ message: `Invalid hall: ${hall}. Available halls: ${Object.keys(hallColumns).join(', ')}` });
    }

    const { nameCol, statusCol } = hallColumns[hall];
    const lastRow = await getLastRow(sheetName, nameCol);

    const dataRange = `${sheetName}!${String.fromCharCode(65 + nameCol)}${lastRow}:${String.fromCharCode(65 + statusCol)}${lastRow}`;
    const existingData = await getSheetData(dataRange);
    if (existingData && existingData[0] && existingData[0][0]) {
      lastRow++;
    }

    const range = `${sheetName}!${String.fromCharCode(65 + nameCol)}${lastRow}:${String.fromCharCode(65 + statusCol)}${lastRow}`;
    const newRow = [[content, status]];

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: { values: newRow }
    });

    res.status(200).json({ message: 'Prayer added successfully' });
  } catch (error) {
    console.error('Error adding prayer:', error);
    res.status(500).json({ message: 'Error adding prayer', error: error.message });
  }
});

// 更新代禱事項
app.post('/updatePrayer', async (req, res) => {
  const { id, content, status, hall } = req.body;

  try {
    const sheetName = config.PRAYER_SHEET || '代禱牆';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const hallColumns = {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
    };

    if (!hallColumns[hall]) {
      return res.status(400).json({ message: `Invalid hall: ${hall}. Available halls: ${Object.keys(hallColumns).join(', ')}` });
    }

    const { nameCol, statusCol } = hallColumns[hall];
    const totalRows = sheet.properties.gridProperties.rowCount;
    const dataRange = `代禱牆!A3:${String.fromCharCode(65 + Math.max(nameCol, statusCol))}${totalRows}`;
    const sheetData = await getSheetData(dataRange);

    let rowIndex = -1;
    for (let i = 0; i < sheetData.length; i++) {
      if (sheetData[i][nameCol] === content) {
        rowIndex = i + 3;
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ message: 'Prayer not found' });
    }

    const updateRange = `${sheetName}!${String.fromCharCode(65 + nameCol)}${rowIndex}:${String.fromCharCode(65 + statusCol)}${rowIndex}`;
    const updateData = [[content, status]];
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: updateRange,
      valueInputOption: 'RAW',
      resource: { values: updateData }
    });

    res.status(200).json({ message: 'Prayer updated successfully' });
  } catch (error) {
    console.error('Error updating prayer:', error);
    res.status(500).json({ message: 'Error updating prayer', error: error.message });
  }
});

// 刪除代禱事項（僅清除欄位值）
app.post('/deletePrayer', async (req, res) => {
  const { id, hall } = req.body;

  try {
    const sheetName = config.PRAYER_SHEET || '代禱牆';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const hallColumns = {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
    };

    if (!hallColumns[hall]) {
      return res.status(400).json({ message: `Invalid hall: ${hall}. Available halls: ${Object.keys(hallColumns).join(', ')}` });
    }

    const { nameCol, statusCol } = hallColumns[hall];
    const totalRows = sheet.properties.gridProperties.rowCount;
    const dataRange = `代禱牆!A3:${String.fromCharCode(65 + Math.max(nameCol, statusCol))}${totalRows}`;
    const sheetData = await getSheetData(dataRange);

    let rowIndex = -1;
    const rowNum = parseInt(id.split('-')[1], 10);
    for (let i = 0; i < sheetData.length; i++) {
      if (i + 3 === rowNum && sheetData[i][nameCol]) {
        rowIndex = rowNum;
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ message: `Prayer not found for ID: ${id}` });
    }

    const updateRange = `${sheetName}!${String.fromCharCode(65 + nameCol)}${rowIndex}:${String.fromCharCode(65 + statusCol)}${rowIndex}`;
    const updateData = [['', '']];
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: updateRange,
      valueInputOption: 'RAW',
      resource: { values: updateData }
    });

    res.status(200).json({ message: 'Prayer cleared successfully' });
  } catch (error) {
    console.error('Error clearing prayer:', error);
    res.status(500).json({ message: 'Error clearing prayer', error: error.message });
  }
});

// 更新狀態
app.post('/updatePrayerStatus', async (req, res) => {
  const { id, status, hall } = req.body;

  try {
    const sheetName = config.PRAYER_SHEET || '代禱牆';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const hallColumns = {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
    };

    if (!hallColumns[hall]) {
      return res.status(400).json({ message: `Invalid hall: ${hall}. Available halls: ${Object.keys(hallColumns).join(', ')}` });
    }

    const { nameCol, statusCol } = hallColumns[hall];
    const totalRows = sheet.properties.gridProperties.rowCount;
    const dataRange = `代禱牆!A3:${String.fromCharCode(65 + Math.max(nameCol, statusCol))}${totalRows}`;
    const sheetData = await getSheetData(dataRange);

    let rowIndex = -1;
    const rowNum = parseInt(id.split('-')[1], 10);
    for (let i = 0; i < sheetData.length; i++) {
      if (i + 3 === rowNum && sheetData[i][nameCol]) {
        rowIndex = rowNum;
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ message: `Prayer not found for ID: ${id}` });
    }

    const updateRange = `${sheetName}!${String.fromCharCode(65 + statusCol)}${rowIndex}`;
    const updateData = [[status]];
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: updateRange,
      valueInputOption: 'RAW',
      resource: { values: updateData }
    });

    res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ message: 'Error updating status', error: error.message });
  }
});

// 獲取代禱牆統計數據
app.get('/getPrayerStats', async (req, res) => {
  const { hall } = req.query;
  const sheetName = config.PRAYER_SHEET || '代禱牆';

  try {
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet "${sheetName}" does not exist.` });
    }

    const totalRows = sheet.properties.gridProperties.rowCount;
    const hallColumns = {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
    };

    if (!hallColumns[hall]) {
      return res.status(400).json({ message: `Invalid hall: ${hall}. Available halls: ${Object.keys(hallColumns).join(', ')}` });
    }

    const { nameCol, statusCol } = hallColumns[hall];
    const dataRange = `代禱牆!A3:${String.fromCharCode(65 + Math.max(nameCol, statusCol))}${totalRows}`;
    const sheetData = await getSheetData(dataRange);

    const stats = { total: 0, '✅': 0, '❌': 0, '❓': 0, '#️⃣': 0 };
    sheetData.forEach(row => {
      if (row.length > Math.max(nameCol, statusCol) && row[nameCol]) {
        stats.total++;
        const status = row[statusCol] ? row[statusCol].trim() : '#️⃣';
        if (['✅', '❌', '❓', '#️⃣'].includes(status)) stats[status]++;
      }
    });

    res.json(stats);
  } catch (err) {
    console.error('Error retrieving prayer stats:', err);
    res.status(500).json({ message: 'Error retrieving prayer stats', error: err.message });
  }
});

// 啟動服務器
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});