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

// --- Google Sheets API 設定 ---
const credentials = require('./credentials.json');
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
// 在這裡建立 sheets 客戶端，並將 auth 物件傳入
const sheets = google.sheets({ version: 'v4', auth });

// ✅ 這是唯一且正確的 getSheetData 函式
async function getSheetData(range) {
  try {
    // 直接使用已驗證的 sheets 客戶端
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: range,
    });
    return response.data.values || [];
  } catch (error) {
    console.error(`獲取範圍 ${range} 的資料時發生錯誤:`, error.message);
    // 向上拋出錯誤，讓呼叫此函式的地方可以處理它
    throw error;
  }
}

// 格式化行數據
function formatRowData(row, validColumns, selectedDate) {
  // 更新：姓名在第3欄(C欄)，索引為 2
  const name = row[2] ? row[2].trim() : '';
  // 更新：照顧者在第4欄(D欄)，索引為 3
  const caregiver = row[3] ? row[3].trim() : '';

  // 確保不是標題列，並且姓名和照顧者都有值
  if (!name || !caregiver || name === '姓名') return null;

  // 更新：每週的紀錄從第7欄(G欄)開始，共12週
  const attendance = row.slice(6, 18).map(cell => cell ? cell.trim() : '');
  const selectedColumnIndex = validColumns.indexOf(selectedDate);
  const selectedAttendance = attendance[selectedColumnIndex] || '';

  return { name, caregiver, selectedAttendance };
}


// 修改 getLastRow 函數，根據 hall 的 nameCol 計算最後一行
async function getLastRow(sheetName, nameCol) {
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
      console.error(`在 ${sheetName} 中獲取最後一行時失敗:`, error.message);
      throw error;
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

    if (!sheetData || !sheetData.length) {
      return res.status(200).json({ groupedData: {}, nameToRowIndexMap: {} });
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
    const lastRow = await getLastRow(sheetName, 1); // 檢查 B 列 (姓名)
    const newRow = [[name, identity, '', region, caregiver]];
    const range = `${sheetName}!B${lastRow}`;

    await sheets.spreadsheets.values.append({
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
  const { hall, caregiver, name } = req.body;

  try {
    const sheetName = config.HALLS[hall] || '3會所';
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.SPREADSHEET_ID });
    const sheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      return res.status(400).json({ message: `Sheet with name "${sheetName}" does not exist.` });
    }

    const sheetId = sheet.properties.sheetId;
    const RANGE = `${sheetName}!A12:F`; // 只需要讀取到照顧者欄位即可
    const sheetData = await getSheetData(RANGE);

    let rowToDelete = -1;
    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const rowName = row[1] ? row[1].trim() : '';
      const rowCaregiver = row[5] ? row[5].trim() : '';
      if (rowName === name && rowCaregiver === caregiver) {
        rowToDelete = i + 12; // 加上起始行號
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
      resource: { requests: [deleteRequest] }
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
    
    const data = [];
    for (const caregiver in updatedData) {
      if (Array.isArray(updatedData[caregiver])) {
        updatedData[caregiver].forEach(person => {
          const rowIndex = nameToRowIndexMap[person.name];
          if (rowIndex) {
            const cellValue = person.selectedOptions.join(', ');
            data.push({
                range: `${sheetName}!${String.fromCharCode(71 + columnIndex)}${rowIndex}`,
                values: [[cellValue]]
            });
          }
        });
      }
    }

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.SPREADSHEET_ID,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data: data
        }
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
    const RANGE = `${sheetName}!A12:X`;
    const sheetData = await getSheetData(RANGE);

    if (!sheetData || !sheetData.length) {
      return res.status(200).json({ '總數': 0 });
    }

    const options = ['有主日', '答應主日', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];
    const stats = { '總數': 0 };
    options.forEach(option => stats[option] = 0);

    sheetData.forEach(row => {
      const formattedData = formatRowData(row, validColumns, selectedDate);
      if (formattedData) {
        stats['總數']++;
        const attendance = formattedData.selectedAttendance.split(', ').filter(Boolean);
        attendance.forEach(att => {
            if(options.includes(att)) {
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

// 新增路由：獲取目標人數數據
app.get('/getTargetCount', async (req, res) => {
  try {
    const range = '3/29青年大會!I3';
    const sheetData = await getSheetData(range);

    if (!sheetData || !sheetData.length || !sheetData[0][0]) {
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
    const dataRange = `${sheetName}!${String.fromCharCode(65 + nameCol)}3:${String.fromCharCode(65 + statusCol)}`;
    const sheetData = await getSheetData(dataRange);

    const prayerData = {};
    if (sheetData && sheetData.length > 0) {
        sheetData.forEach((row, index) => {
          if (row[0] && row[1]) { // 確保姓名和狀態都存在
            const id = `prayer-${index + 3}`; // 行號從 3 開始
            prayerData[id] = { content: row[0].trim(), status: row[1].trim(), hall };
          }
        });
    }

    res.json(prayerData);
  } catch (err) {
    console.error('Error retrieving prayer data:', err);
    res.status(500).json({ message: 'Error retrieving prayer data', error: err.message });
  }
});

// 新增代禱事項
app.post('/addPrayer', async (req, res) => {
  const { content, status, hall } = req.body;

  try {
    const sheetName = config.PRAYER_SHEET || '代禱牆';
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

    const { nameCol } = hallColumns[hall];
    const lastRow = await getLastRow(sheetName, nameCol);
    const range = `${sheetName}!${String.fromCharCode(65 + nameCol)}${lastRow}`;
    
    await sheets.spreadsheets.values.append({
        spreadsheetId: config.SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [[content, status]]
        }
    });

    res.status(200).json({ message: 'Prayer added successfully' });
  } catch (error) {
    console.error('Error adding prayer:', error);
    res.status(500).json({ message: 'Error adding prayer', error: error.message });
  }
});


// 刪除代禱事項（僅清除欄位值）
app.post('/deletePrayer', async (req, res) => {
    const { id, hall } = req.body;

    try {
        const sheetName = config.PRAYER_SHEET || '代禱牆';
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
        const rowNum = parseInt(id.split('-')[1], 10);
        if (isNaN(rowNum)) {
            return res.status(400).json({ message: `Invalid prayer ID format.` });
        }

        const range = `${sheetName}!${String.fromCharCode(65 + nameCol)}${rowNum}:${String.fromCharCode(65 + statusCol)}${rowNum}`;

        await sheets.spreadsheets.values.clear({
            spreadsheetId: config.SPREADSHEET_ID,
            range: range,
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

        const { statusCol } = hallColumns[hall];
        const rowNum = parseInt(id.split('-')[1], 10);
        if (isNaN(rowNum)) {
            return res.status(400).json({ message: `Invalid prayer ID format.` });
        }

        const range = `${sheetName}!${String.fromCharCode(65 + statusCol)}${rowNum}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[status]]
            }
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
        const dataRange = `${sheetName}!${String.fromCharCode(65 + nameCol)}3:${String.fromCharCode(65 + statusCol)}`;
        const sheetData = await getSheetData(dataRange);

        const stats = { total: 0, '✅': 0, '❌': 0, '❓': 0, '#️⃣': 0 };
        if (sheetData && sheetData.length > 0) {
            sheetData.forEach(row => {
              if (row[0]) { // 只要有姓名就計入總數
                stats.total++;
                const status = row[1] ? row[1].trim() : '#️⃣'; // 如果狀態為空，默認為'#️⃣'
                if (stats.hasOwnProperty(status)) {
                    stats[status]++;
                }
              }
            });
        }
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