// public/js/config.js (最終完美定稿版 - 使用更安全的 UMD 格式)

(function (global, factory) {
  // 這個結構會判斷當前的環境，並使用正確的方式匯出模組
  // 如果是後端 (Node.js)，使用 module.exports
  // 如果是前端，則將模組掛載到 global (也就是 window) 物件上
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.AppConfig = factory());
}(this, (function () { 'use strict';

  // 您的所有設定都安全地放在這裡
  const config = {
    // Google 表格 ID (為安全起見，建議保留在 .env 中，此處留空)
    SPREADSHEET_ID: '',

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
    
    // 代禱牆設定
    PRAYER_SHEET: '代禱牆',
    
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

  return config;

})));