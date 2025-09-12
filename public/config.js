// public/config.js (優化後)

module.exports = {
  // Google 表格 ID

  // 有效的日期列範圍 (G 到 R)
  VALID_COLUMNS: Array.from({ length: 16 }, (_, i) => String.fromCharCode('G'.charCodeAt(0) + i)),

  // 點名系統的會所名稱對照
  HALLS: {
    'hall3': '3',
    'hall3e': '3E',
    'hall62': '62',
    'hall71': '71',
    'hall82': '82',
    'hall103': '103',
  },

  // 點名系統小區設定的對照表 (會所代碼 -> 設定工作表的欄位)
  REGION_COLUMNS: {
    'hall3': 'B',
    'hall3e': 'C',
    'hall62': 'D',
    'hall71': 'E',
    'hall82': 'F',
    'hall103': 'G'
  },
  
  // 代禱牆工作表名稱
  PRAYER_SHEET: '代禱牆',
  
  // 代禱牆的會所欄位對照 (hall ID -> {姓名欄位索引, 狀態欄位索引})
  PRAYER_HALL_COLUMNS: {
      'hall-h3-new': { nameCol: 0, statusCol: 1 },
      'hall-h3-peace': { nameCol: 2, statusCol: 3 },
      'hall-h3-english': { nameCol: 4, statusCol: 5 },
      'hall-h62': { nameCol: 6, statusCol: 7 },
      'hall-h71': { nameCol: 8, statusCol: 9 },
      'hall-h82': { nameCol: 10, statusCol: 11 },
      'hall-h103': { nameCol: 12, statusCol: 13 }
  }
};