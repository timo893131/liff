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
  
  // --- 代禱牆新設定 ---
  PRAYER_SHEET: '代禱牆',
  
  // ★ 更新 ★: 全新的代禱牆群組設定
  // 格式: '群組ID': { name: '顯示名稱', nameCol: 姓名欄位索引, itemCol: 代禱事項欄位索引 }
  PRAYER_GROUPS: {
    'h3-peace-brothers': { name: 'H3（和平弟兄）', nameCol: 0,  itemCol: 1 },
    'h3-peace-sisters':  { name: 'H3（和平姊妹）', nameCol: 2,  itemCol: 3 },
    'h3-new-brothers':   { name: 'H3（新生弟兄）', nameCol: 4,  itemCol: 5 },
    'h3-new-sisters':    { name: 'H3（新生姊妹）', nameCol: 6,  itemCol: 7 },
    'h3-english':        { name: 'H3（英語）',      nameCol: 8,  itemCol: 9 },
    'h62-sisters':       { name: 'H62（姊妹）',      nameCol: 10, itemCol: 11 },
    'h71-brothers':      { name: 'H71（弟兄）',      nameCol: 12, itemCol: 13 },
    'h71-sisters':       { name: 'H71（姊妹）',      nameCol: 14, itemCol: 15 },
    'h82-brothers':      { name: 'H82（弟兄）',      nameCol: 16, itemCol: 17 },
    'h82-sisters':       { name: 'H82（姊妹）',      nameCol: 18, itemCol: 19 },
    'h103-brothers':     { name: 'H103（弟兄）',     nameCol: 20, itemCol: 21 },
    'h103-sisters':      { name: 'H103（姊妹）',     nameCol: 22, itemCol: 23 }
  }

};