module.exports = {
  // Google 表格 ID
  SPREADSHEET_ID: '1cFwGGUTBy4Sta0lvRi9_mRG6axGOyzmVdXKsyBKyXkY',
  
  // 有效的日期列范围
  VALID_COLUMNS: ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'],
  
  // Hall 的名称映射
  HALLS: {
    hall3: '3會所',
    hall62: '62會所',
    hall71: '71會所',
    hall82: '82會所',
    hall103: '103會所',
  },HALLS: {
    'hall-h3-new': 'H3（新生）',
    'hall-h3-peace': 'H3（和平）',
    'hall-h3-english': 'H3（英語）',
    'hall-h62': 'H62',
    'hall-h71': 'H71',
    'hall-h82': 'H82',
    'hall-h103': 'H103'
  },
  VALID_COLUMNS: Array.from({ length: 18 }, (_, i) => String.fromCharCode('G'.charCodeAt(0) + i)), // G 到 X
  PRAYER_SHEET: '代禱牆' // 代禱牆工作表名稱
};