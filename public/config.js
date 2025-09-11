module.exports = {
  // Google 表格 ID
  SPREADSHEET_ID: '1rk5tKaj2_n2PGJAr4TGuKlmVejPfjuyT4TzuqM0JWEo',

  // 有效的日期列范围 (G 到 X)
  VALID_COLUMNS: Array.from({ length: 16 }, (_, i) => String.fromCharCode('G'.charCodeAt(0) + i)),

  // Hall 的名称映射 (合併後的版本)
  HALLS: {
    // 點名系統的會所
    'hall3': '3',
    'hall3e': '3英語區',
    'hall62': '62',
    'hall71': '71',
    'hall82': '82',
    'hall103': '103',
    // 代禱牆的會所
    'hall-h3-new': 'H3（新生）',
    'hall-h3-peace': 'H3（和平）',
    'hall-h3-english': 'H3（英語）',
    'hall-h62': 'H62',
    'hall-h71': 'H71',
    'hall-h82': 'H82',
    'hall-h103': 'H103'
  },

  // 代禱牆工作表名稱
  PRAYER_SHEET: '代禱牆'
};