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
const { google } = require('googleapis'); // 確保 googleapis 已被引用
const config = require('./public/config');
const sheetUtils = require('./utils/sheet');

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
app.set('trust proxy', 1); // ★ 0新增 ★: 信任 Render 的反向代理
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
    origin: process.env.BASE_URL || 'http://localhost:3000', // 線上環境的網址
    credentials: true
}));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 10 * 60 * 1000, max: 1000 }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // ★ 更新 ★: 在生產環境中啟用安全的 cookie
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
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
    callbackURL: process.env.CALLBACK_URL || "http://localhost:3000/auth/line/callback"
}, async (accessToken, refreshToken, profile, done) => {
    const { id: lineUserId, displayName } = profile;
    logger.info(`User attempting login: ${displayName} (ID: ${lineUserId})`);
    
    // ★ 新增日誌 ★: 檢查 SPREADSHEET_ID 是否正確載入
    logger.info(`Authenticating against SPREADSHEET_ID: ${SPREADSHEET_ID}`);

    try {
        const usersRange = "'Users'!A2:C";
        const users = await sheetUtils.getSheetData(usersRange);
        let user = users.find(u => u && u[0] === lineUserId);

        if (user) {
            logger.info(`Existing user found: ${displayName}`);
            if (user[2] !== displayName) {
                const userRowIndex = users.findIndex(u => u && u[0] === lineUserId) + 2;
                await sheetUtils.updateSheetData(`'Users'!C${userRowIndex}`, [[displayName]]);
                logger.info(`Updated user name for ${displayName}`);
            }
        } else {
            logger.info(`New user detected: ${displayName}. Adding to Users sheet.`);
            const newRowValues = [[lineUserId, 'guest', displayName]];
            const newRow = users.length + 2;
            await sheetUtils.updateSheetData(`'Users'!A${newRow}`, newRowValues);
            user = newRowValues[0];
        }
        return done(null, { id: user[0], role: user[1], name: user[2] });
    } catch (err) {
        // ★ 新增日誌 ★: 提供更詳細的錯誤情境
        logger.error(`Authentication process failed for user ${displayName}. Please check if the 'Users' sheet exists and the service account has permissions.`, err);
        return done(err);
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));


// --- 輔助函式 & 中介軟體 ---
function handleError(res, error, message, statusCode = 500) {
    logger.error(message, { 
        error: error.message, 
        stack: error.stack,
        response: error.response ? error.response.data : undefined
    });
    res.status(statusCode).json({ message, error: error.message });
}

// 補上遺漏的 validateHall 函式定義
const validateHall = (req, res, next) => {
    const hall = req.query.hall || req.body.hall;
    if (!hall) return res.status(400).json({ message: 'Missing hall parameter' });
    const sheetName = config.HALLS[hall];
    if (!sheetName) return res.status(400).json({ message: `Invalid hall: ${hall}` });
    req.sheetName = sheetName;
    next();
};

// 補上遺漏的 validatePrayerHall 函式定義
const validatePrayerHall = (req, res, next) => {
    const hall = req.query.hall || req.body.hall;
    if (!hall) return res.status(400).json({ message: 'Missing hall parameter' });
    const hallColumns = config.PRAYER_HALL_COLUMNS[hall];
    if (!hallColumns) return res.status(400).json({ message: `Invalid prayer hall: ${hall}` });
    req.hall = hall;
    req.hallColumns = hallColumns;
    next();
};

f// ★★★ 核心修正：更新 isAuthenticated 函式 ★★★
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.role) {
      // 明確地允許 admin 或 editor 角色通過
      if (req.user.role === 'admin' || req.user.role === 'editor') {
          return next();
      }
  }
  // 對於所有其他情況 (未登入、guest、或其他無效角色)，則拒絕存取
  if (req.path.startsWith('/api/') || req.path.startsWith('/get')) {
      return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/login.html');
}

// ★★★ 新增：管理員權限檢查中介軟體 ★★★
function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
      return next();
  }
  return res.status(403).json({ error: 'Forbidden: Admins only' });
}

// --- 認證路由 ---
app.get('/auth/line', passport.authenticate('line'));
app.get('/auth/line/callback', passport.authenticate('line', {
    successRedirect: '/',
    failureRedirect: '/login.html'
}));
app.get('/auth/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.redirect('/login.html');
        });
    });
});
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: req.user });
    } else {
        res.json({ loggedIn: false });
    }
});
// --- ★★★ 新增：使用者管理 API ★★★ ---
// 獲取所有使用者列表
app.get('/api/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
      const range = "'Users'!A2:C";
      const sheetData = await sheetUtils.getSheetData(range);
      const users = (sheetData || []).map(row => ({
          lineUserId: row[0],
          role: row[1],
          name: row[2]
      })).filter(user => user.lineUserId); // 過濾掉空行
      res.json(users);
  } catch (error) {
      handleError(res, error, 'Error fetching user list');
  }
});

// 更新使用者權限
app.post('/api/users/update-role', isAuthenticated, isAdmin, async (req, res) => {
  const { lineUserId, newRole } = req.body;
  if (!lineUserId || !newRole) {
      return res.status(400).json({ message: 'Missing lineUserId or newRole' });
  }
  if (!['admin', 'editor', 'guest'].includes(newRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
  }

  try {
      const idColumnRange = "'Users'!A2:A";
      const idColumnData = await sheetUtils.getSheetData(idColumnRange);
      const userRowIndex = idColumnData.findIndex(row => row[0] === lineUserId);

      if (userRowIndex === -1) {
          return res.status(404).json({ message: 'User not found' });
      }
      
      const targetRow = userRowIndex + 2; // +2 因為資料從 A2 開始且 findIndex 是 0-based
      const targetCell = `'Users'!B${targetRow}`;
      await sheetUtils.updateSheetData(targetCell, [[newRole]]);
      
      res.json({ message: 'User role updated successfully' });
  } catch (error) {
      handleError(res, error, 'Error updating user role');
  }
});


// --- API 路由 (確保所有需要保護的路由都加上 isAuthenticated) ---
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


app.get('/getData',  isAuthenticated, validateHall, async (req, res) => {
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

app.post('/addNewData', isAuthenticated, validateHall, async (req, res) => {
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

app.post('/deleteData', isAuthenticated, validateHall, async (req, res) => {
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

app.post('/updateData', isAuthenticated, validateHall, async (req, res) => {
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
app.get('/getRegions', isAuthenticated, validateHall, async (req, res) => {
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

app.get('/getStats', isAuthenticated, validateHall, async (req, res) => {
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

app.get('/getPrayerData', isAuthenticated, validateHall, async (req, res) => {
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

app.post('/addPrayer', isAuthenticated, validateHall, async (req, res) => {
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

app.post('/deletePrayer', isAuthenticated, validateHall, async (req, res) => {
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

app.post('/updatePrayerStatus', isAuthenticated, validateHall, async (req, res) => {
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

app.get('/getPrayerStats', isAuthenticated, validateHall, async (req, res) => {
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