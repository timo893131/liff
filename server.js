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

// 建立 LINE Client，用於後續傳送訊息
const lineClient = new line.Client(lineConfig);

// 中間件設定
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.json());

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  message: 'Too many requests, please try again later.'
});
app.use(limiter);

// --- Webhook 路由 ---
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// --- LINE 事件處理函式 ---
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }
  const echo = { type: 'text', text: `您說了：「${event.message.text}」` };
  return lineClient.replyMessage(event.replyToken, echo);
}

// --- Google Sheets API 設定 (已修正) ---
// 直接建立一個 google auth 物件，不再需要 getAuth() 函式
const auth = new google.auth.GoogleAuth({
    credentials: require('./credentials.json'), // 確保 credentials.json 在專案根目錄
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 直接使用上面的 auth 物件來初始化 sheets
const sheets = google.sheets({ version: 'v4', auth });

// --- Google Sheets 輔助函式 ---
async function getSheetData(range) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: range,
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`讀取範圍 ${range} 失敗:`, error.message);
        throw error; // 將錯誤拋出，讓 API 路由可以捕捉到
    }
}

async function getLastRow(sheetName, nameCol) {
    const columnLetter = String.fromCharCode(65 + nameCol);
    const range = `${sheetName}!${columnLetter}3:${columnLetter}`; // 從第3行開始計算
    const rows = await getSheetData(range);
    return (rows ? rows.length : 0) + 3; // 起始行號是3
}

// --- API 路由 ---
// (保留您所有的 API 路由，此處僅為範例，請確認您所有的路由都在)

// 獲取點名資料
app.get('/getData', async (req, res) => {
  const { selectedDate, hall } = req.query;
  try {
    const validColumns = config.VALID_COLUMNS;
    if (!validColumns.includes(selectedDate)) {
      return res.status(400).json({ message: '無效的日期' });
    }
    const sheetName = config.HALLS[hall];
    if (!sheetName) {
      return res.status(400).json({ message: '無效的會所名稱' });
    }
    
    const range = `${sheetName}!A12:X`; // 從 A12 開始讀取
    const sheetData = await getSheetData(range);
    
    const groupedData = {};
    const nameToRowIndexMap = {};

    if (sheetData && sheetData.length > 0) {
        sheetData.forEach((row, rowIndex) => {
            const name = row[1] ? row[1].trim() : '';
            const caregiver = row[5] ? row[5].trim() : '';
            if (name && caregiver && name !== '序') {
                const colIndex = validColumns.indexOf(selectedDate);
                const attendance = row[colIndex + 6] || ''; // G欄是第7欄，索引為6
                
                if (!groupedData[caregiver]) {
                    groupedData[caregiver] = [];
                }
                groupedData[caregiver].push({ name, attendance: attendance.split(',').map(s => s.trim()).filter(Boolean) });
                nameToRowIndexMap[name] = rowIndex + 12; // 實際行號
            }
        });
    }
    res.json({ groupedData, nameToRowIndexMap });
  } catch (err) {
    console.error('[/getData] 錯誤:', err);
    res.status(500).json({ message: '伺服器錯誤', error: err.message });
  }
});


// 新增資料
app.post('/addNewData', async (req, res) => {
  const { hall, name, identity, region, caregiver } = req.body;
  
  try {
    if (!hall || !name || !identity || !region || !caregiver) {
      return res.status(400).json({ message: 'Missing required body parameters' });
    }

    const sheetName = config.HALLS[hall] || '3';
    const lastRow = await getLastRow(sheetName, 1); // 檢查 B 列 (姓名)
    const newRow = [['', name, identity, '', region, caregiver]]; // 保持欄位對應
    const range = `${sheetName}!A${lastRow}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId: config.SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: newRow }
    });

    res.status(200).json({ message: 'Data added successfully' });
  } catch (error) {
    console.error('Error adding data:', error);
    res.status(500).json({ message: 'Error adding data', error: error.message });
  }
});


// 刪除資料
app.post('/deleteData', async (req, res) => {
    const { hall, name } = req.body;

    try {
        const sheetName = config.HALLS[hall];
        if (!sheetName) {
            return res.status(400).json({ message: 'Invalid hall provided' });
        }

        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
        const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) {
            return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
        }
        const sheetId = sheet.properties.sheetId;

        const range = `${sheetName}!B12:B`; // 搜尋 B 列（姓名）
        const sheetData = await getSheetData(range);

        let rowToDelete = -1;
        if (sheetData) {
            for (let i = 0; i < sheetData.length; i++) {
                if (sheetData[i][0] && sheetData[i][0].trim() === name) {
                    rowToDelete = i + 12; // 因為我們從第12行開始讀取
                    break;
                }
            }
        }

        if (rowToDelete === -1) {
            return res.status(404).json({ message: 'Record not found' });
        }

        const deleteRequest = {
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: rowToDelete - 1,
                    endIndex: rowToDelete
                }
            }
        };

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: config.SPREADSHEET_ID,
            requestBody: { requests: [deleteRequest] }
        });

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Error deleting data:', error);
        res.status(500).json({ message: 'Error deleting data', error: error.message });
    }
});


// 提交修改的數據
app.post('/updateData', async (req, res) => {
    const { updatedData, nameToRowIndexMap, selectedDate, hall } = req.body;

    try {
        const validColumns = config.VALID_COLUMNS;
        const columnIndex = validColumns.indexOf(selectedDate);
        if (columnIndex === -1) {
            return res.status(400).json({ message: 'Invalid date selected' });
        }

        const sheetName = config.HALLS[hall];
        const requests = [];

        for (const caregiver in updatedData) {
            if (Array.isArray(updatedData[caregiver])) {
                updatedData[caregiver].forEach(person => {
                    const rowIndex = nameToRowIndexMap[person.name];
                    if (rowIndex) {
                        const cellValue = person.selectedOptions.join(', ');
                        const range = `${sheetName}!${String.fromCharCode(71 + columnIndex)}${rowIndex}`;
                        requests.push({
                            range: range,
                            values: [[cellValue]]
                        });
                    }
                });
            }
        }

        if (requests.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: config.SPREADSHEET_ID,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: requests
                }
            });
        }

        res.status(200).json({ message: 'Data updated successfully' });
    } catch (error) {
        console.error('Error updating data:', error);
        res.status(500).json({ message: 'Error updating data', error: error.message });
    }
});


// 獲取統計數據
app.get('/getStats', async (req, res) => {
  const { selectedDate, hall } = req.query;

  try {
    const validColumns = config.VALID_COLUMNS;
    if (!validColumns.includes(selectedDate)) {
      return res.status(400).json({ message: 'Invalid date selected' });
    }

    const sheetName = config.HALLS[hall] || '3';
    const RANGE = `${sheetName}!A12:X`;
    const sheetData = await getSheetData(RANGE);

    if (!sheetData || sheetData.length === 0) {
      return res.json({ '總數': 0 });
    }

    const options = ['有主日', '答應主日', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];
    const stats = { '總數': 0 };
    options.forEach(option => stats[option] = 0);

    const columnIndex = validColumns.indexOf(selectedDate);
    sheetData.forEach(row => {
      const name = row[1] ? row[1].trim() : '';
      if (name && name !== '序') { // 確保有姓名才計入總數
        stats['總數']++;
        const attendanceValue = row[columnIndex + 6] || '';
        const attendance = attendanceValue.split(',').map(s => s.trim()).filter(Boolean);
        attendance.forEach(att => {
            if (options.includes(att)) {
                stats[att]++;
            }
        });
      }
    });

    res.json(stats);
  } catch (err) {
    console.error('Error retrieving stats:', err);
    res.status(500).json({ message: 'Error retrieving stats', error: err.message });
  }
});


// ... 其他路由 ...
app.get('/getTargetCount', async (req, res) => {
  try {
    const range = '3/29青年大會!I3';
    const sheetData = await getSheetData(range);
    const count = (sheetData && sheetData[0] && parseInt(sheetData[0][0])) || 0;
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
    const names = sheetData ? sheetData.map(row => row[0]).filter(name => name && name.trim() && name !== '姓名') : [];
    res.status(200).json({ names });
  } catch (error) {
    console.error('Error fetching signup list:', error);
    res.status(500).json({ message: 'Error fetching signup list', error: error.message });
  }
});

app.get('/getDateRanges', async (req, res) => {
  try {
    const range = '設定!A2:A19';
    const sheetData = await getSheetData(range);
    const dateRanges = sheetData ? sheetData.map(row => row[0]).filter(date => date && date.trim()) : [];
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