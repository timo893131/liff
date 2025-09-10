const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const config = require('./public/config');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;

// 中間件設置
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(bodyParser.json());

// 速率限制配置（每 IP 每 10 分鐘最多 1000 個請求）
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  message: 'Too many requests, please try again later.'
});
app.use(limiter);

// 多服務帳戶配置
const credentialsList = [
  require('./credentials.json'),
  require('./credentials2.json'),
];
let authIndex = 0; // 用於輪流切換服務帳戶
function getAuth() {
  authIndex = (authIndex + 1) % credentialsList.length; // 簡單輪詢
  return new google.auth.GoogleAuth({
    credentials: credentialsList[authIndex],
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const sheets = google.sheets({ version: 'v4', auth: getAuth() });

async function getSheetData(range) {
  let attempt = 0;
  const maxAttempts = credentialsList.length; // 根據服務帳戶數量設定嘗試次數

  while (attempt < maxAttempts) {
    try {
      const auth = getAuth(); // 切換到下一個服務帳戶
      console.log(`Attempt ${attempt + 1} using auth index ${authIndex} for range ${range}`);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: range,
        auth: auth,
      });
      return response.data.values || [];
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed for range ${range}:`, error.message);
      attempt++;
      if (attempt === maxAttempts) {
        throw new Error(`All attempts failed: ${error.message}`);
      }
    }
  }
}

// 格式化行數據
function formatRowData(row, validColumns, selectedDate) {
  const name = row[1] ? row[1].trim() : '';
  const caregiver = row[5] ? row[5].trim() : '';

  if (!name || !caregiver || name === '序') return null;

  const attendance = row.slice(6, 24).map(cell => cell ? cell.trim() : '');
  const selectedColumnIndex = validColumns.indexOf(selectedDate);
  const selectedAttendance = attendance[selectedColumnIndex] || '';

  return { name, caregiver, selectedAttendance };
}

// 修改 getLastRow 函數，根據 hall 的 nameCol 計算最後一行
async function getLastRow(sheetName, nameCol) {
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    try {
      const columnLetter = String.fromCharCode(65 + nameCol);
      const range = `${sheetName}!${columnLetter}:${columnLetter}`;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: range,
      });
      const rows = response.data.values || [];
      let lastRow = 2; // 從第 3 行開始（A3）
      for (let i = 2; i < rows.length; i++) {
        if (rows[i] && rows[i][0] && rows[i][0].trim()) {
          lastRow = i + 1;
        }
      }
      return lastRow + 1;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed for getLastRow ${sheetName}:`, error.message);
      attempt++;
      if (attempt === maxAttempts) {
        throw new Error(`All attempts failed: ${error.message}`);
      }
    }
  }
}

// 路由：獲取 Google Sheets 數據
app.get('/getData', async (req, res) => {
  const { selectedDate, hall } = req.query;

  try {
    const validColumns = config.VALID_COLUMNS;
    if (!validColumns.includes(selectedDate)) {
      return res.status(400).json({ message: 'Invalid date selected' });
    }

    const sheetName = config.HALLS[hall] || '3會所';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const totalRows = sheet.properties.gridProperties.rowCount;
    const RANGE = `${sheetName}!A12:X${totalRows}`;
    const sheetData = await getSheetData(RANGE);

    if (!sheetData.length) {
      return res.status(400).json({ message: 'No data found in the sheet.' });
    }

    const groupedData = {};
    const nameToRowIndexMap = {};

    sheetData.forEach((row, rowIndex) => {
      const formattedData = formatRowData(row, validColumns, selectedDate);
      if (formattedData) {
        const { name, caregiver, selectedAttendance } = formattedData;
        if (!groupedData[caregiver]) groupedData[caregiver] = [];
        groupedData[caregiver].push({ name, attendance: selectedAttendance });
        nameToRowIndexMap[name] = rowIndex + 12;
      }
    });

    res.json({ groupedData, nameToRowIndexMap });
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ message: 'Error retrieving data', error: err.message });
  }
});

// 新增資料
app.post('/addNewData', async (req, res) => {
  const { hall, name, identity, region, caregiver } = req.body;

  try {
    if (!hall || !name || !identity || !region || !caregiver) {
      return res.status(400).json({ message: 'Missing required body parameters' });
    }

    const sheetName = config.HALLS[hall] || '3會所';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const lastRow = await getLastRow(sheetName, 1); // 檢查 B 列 (姓名)
    const newRow = [[name, identity, '', region, caregiver]];
    const range = `${sheetName}!B${lastRow}`;

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
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
  const { hall, caregiver, name, selectedDate } = req.body;

  try {
    const sheetName = config.HALLS[hall] || '3會所';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const sheetId = sheet.properties.sheetId;
    const validColumns = config.VALID_COLUMNS;
    const columnIndex = validColumns.indexOf(selectedDate);
    if (columnIndex === -1) {
      return res.status(400).json({ message: 'Invalid date selected' });
    }

    const RANGE = `${sheetName}!A12:X`;
    const sheetData = await getSheetData(RANGE);

    let rowToDelete = -1;
    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const rowName = row[1] ? row[1].trim() : '';
      const rowCaregiver = row[5] ? row[5].trim() : '';
      if (rowName === name && rowCaregiver === caregiver) {
        rowToDelete = i + 12;
        break;
      }
    }

    if (rowToDelete === -1) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const deleteRequest = {
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowToDelete - 1, endIndex: rowToDelete }
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

    const sheetName = config.HALLS[hall] || '3會所';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    const sheetId = sheet.properties.sheetId;

    const requests = [];
    for (const caregiver in updatedData) {
      if (Array.isArray(updatedData[caregiver])) {
        updatedData[caregiver].forEach(person => {
          const rowIndex = nameToRowIndexMap[person.name];
          if (rowIndex) {
            const cellValue = person.selectedOptions.join(', ');
            requests.push({
              updateCells: {
                rows: [{ values: [{ userEnteredValue: { stringValue: cellValue } }] }],
                fields: 'userEnteredValue',
                start: { sheetId, rowIndex: rowIndex - 1, columnIndex: columnIndex + 6 }
              }
            });
          }
        });
      } else {
        console.error(`Expected array for caregiver ${caregiver}, but got:`, updatedData[caregiver]);
      }
    }

    const batchUpdateRequest = { requests };
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.SPREADSHEET_ID,
      requestBody: batchUpdateRequest
    });

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

    const sheetName = config.HALLS[hall] || '3會所';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const totalRows = sheet.properties.gridProperties.rowCount;
    const RANGE = `${sheetName}!A12:X${totalRows}`;
    const sheetData = await getSheetData(RANGE);

    if (!sheetData.length) {
      return res.status(400).json({ message: 'No data found in the sheet.' });
    }

    const options = ['有主日', '答應主日', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];
    const stats = { '總數': 0 };
    options.forEach(option => stats[option] = 0);

    const columnIndex = validColumns.indexOf(selectedDate);
    sheetData.forEach(row => {
      const formattedData = formatRowData(row, validColumns, selectedDate);
      if (formattedData) {
        stats['總數']++;
        const attendance = formattedData.selectedAttendance.split(', ').filter(Boolean);
        attendance.forEach(att => options.includes(att) && stats[att]++);
      }
    });

    res.json(stats);
  } catch (err) {
    console.error('Error retrieving stats:', err);
    res.status(500).json({ message: 'Error retrieving stats', error: err.message });
  }
});

// 新增路由：獲取目標人數數據
app.get('/getTargetCount', async (req, res) => {
  try {
    const range = '3/29青年大會!I3';
    const sheetData = await getSheetData(range);

    if (!sheetData.length || !sheetData[0][0]) {
      return res.status(200).json({ count: 0 });
    }

    const count = parseInt(sheetData[0][0]) || 0;
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching target count:', error);
    res.status(500).json({ message: 'Error fetching target count', error: error.message });
  }
});

// 獲取報名名單
app.get('/getSignupList', async (req, res) => {
  try {
    const range = '3/29青年大會!B2:B';
    const sheetData = await getSheetData(range);

    const names = sheetData
      .map(row => row[0])
      .filter(name => name && name.trim() && name !== '姓名');

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
    const dateRanges = sheetData
      .map(row => row[0])
      .filter(date => date && date.trim());

    console.log('Fetched date ranges:', dateRanges);
    res.status(200).json({ dateRanges });
  } catch (error) {
    console.error('Error fetching date ranges:', error);
    res.status(500).json({ message: 'Error fetching date ranges', error: error.message });
  }
});

// 獲取代禱數據
app.get('/getPrayerData', async (req, res) => {
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

    const prayerData = {};
    sheetData.forEach((row, index) => {
      if (row.length > Math.max(nameCol, statusCol) && row[nameCol] && row[statusCol]) {
        const id = `prayer-${index + 3}`;
        prayerData[id] = { content: row[nameCol].trim(), status: row[statusCol].trim(), hall };
      }
    });

    if (Object.keys(prayerData).length === 0) {
      return res.status(404).json({ message: `No prayer data found for hall "${hall}".` });
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