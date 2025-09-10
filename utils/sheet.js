const { google } = require('googleapis');
const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 3600, // 默認快取 1 小時
  checkperiod: 120,
  useClones: false,
});

const auth = new google.auth.GoogleAuth({
  credentials: require('../credentials.json'),
  scopes: 'https://www.googleapis.com/auth/spreadsheets',
});

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetData(range, data = null, action = 'get', retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (action === 'get') {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID || require('../public/config').SPREADSHEET_ID,
          range,
        });
        return response.data.values || [];
      } else if (action === 'update') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID || require('../public/config').SPREADSHEET_ID,
          range,
          valueInputOption: 'RAW',
          resource: { values: data.values },
        });
        return true;
      } else if (action === 'append') {
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID || require('../public/config').SPREADSHEET_ID,
          range,
          valueInputOption: 'RAW',
          resource: { values: data.values },
        });
        return true;
      }
    } catch (error) {
      if (error.response?.status === 429 && attempt < retries) {
        console.warn(`Quota exceeded, retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // 指數退避
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Max retries reached for ${action} operation on ${range}`);
}

async function getLastRow(sheetName, col) {
  const columnLetter = String.fromCharCode(65 + col);
  const range = `${sheetName}!${columnLetter}:${columnLetter}`;
  const rows = (await getSheetData(range)) || [];
  let lastRow = 2; // 從第 3 行開始 (A3)
  for (let i = 2; i < rows.length; i++) {
    if (rows[i] && rows[i][0] && rows[i][0].trim()) {
      lastRow = i + 1;
    }
  }
  return lastRow + 1;
}

module.exports = { getSheetData, getLastRow, cache };