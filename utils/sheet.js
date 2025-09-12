// utils/sheet.js (優化後，包含快取和完整的 CRUD 操作)
require('dotenv').config(); // 將 .env 檔案中的變數載入到 process.env
const { google } = require('googleapis');
const NodeCache = require('node-cache');
const config = require('../public/config');

// 初始化快取，快取時間設定為 5 分鐘
// stdTTL: 標準存留時間(秒)。 checkperiod: 定期檢查過期快取的間隔時間(秒)。
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const credentials = require('../credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || config.SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

/**
 * 從 Google Sheets 獲取資料，並使用快取
 * @param {string} range - A1 標記法範圍
 * @returns {Promise<Array<Array<string>>>}
 */
async function getSheetData(range) {
    const cacheKey = `sheetData_${range}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        console.log(`[Cache] Hit for key: ${cacheKey}`);
        return cachedData;
    }

    console.log(`[Cache] Miss for key: ${cacheKey}. Fetching from API...`);
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });
        const values = response.data.values || [];
        cache.set(cacheKey, values); // 將結果存入快取
        return values;
    } catch (error) {
        console.error(`獲取範圍 '${range}' 的資料時發生錯誤:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * 更新 Google Sheets 中的儲存格
 * @param {string} range - A1 標記法範圍
 * @param {Array<Array<string>>} values - 要寫入的值
 */
async function updateSheetData(range, values) {
    // 任何寫入操作都應該清除相關快取，以確保資料一致性
    cache.flushAll(); 
    console.log(`[Cache] Flushed all cache due to update operation.`);
    
    return sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });
}

/**
 * 批次更新 Google Sheets 中的多個儲存格
 * @param {Array<object>} data - 包含 range 和 values 的物件陣列
 */
async function batchUpdateSheetData(data) {
    cache.flushAll();
    console.log(`[Cache] Flushed all cache due to batch update operation.`);

    return sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data,
        }
    });
}

/**
 * 刪除 Google Sheets 中的行
 * @param {number} sheetId - 工作表的 ID
 * @param {number} startIndex - 開始的行索引 (從 0 開始)
 * @param {number} endIndex - 結束的行索引
 */
async function deleteSheetRows(sheetId, startIndex, endIndex) {
    cache.flushAll();
    console.log(`[Cache] Flushed all cache due to delete operation.`);

    return sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            requests: [{
                deleteDimension: {
                    range: { sheetId, dimension: 'ROWS', startIndex, endIndex }
                }
            }]
        }
    });
}

/**
 * 清除 Google Sheets 中指定範圍的內容
 * @param {string} range - A1 標記法範圍
 */
async function clearSheetData(range) {
    cache.flushAll();
    console.log(`[Cache] Flushed all cache due to clear operation.`);

    return sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range,
    });
}


module.exports = {
    sheets, // 匯出 sheets 物件以獲取 sheetId
    getSheetData,
    updateSheetData,
    batchUpdateSheetData,
    deleteSheetRows,
    clearSheetData,
};