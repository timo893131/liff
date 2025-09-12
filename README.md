# 牧養點名與權限管理系統 (Shepherding System)

這是一個專為教會或團體設計的線上牧養點名與權限管理系統，旨在取代傳統的紙本或 Excel 表單，提供一個即時、可協作且安全的資料管理平台。

系統前端使用 HTML/CSS/JavaScript 構建，後端由 Node.js 和 Express 驅動，並以 Google Sheets 作為輕量級的資料庫。專案整合了 LINE Login 進行使用者身份驗證，並實現了基於角色的權限管理。

## ✨ 主要功能

- **多會所點名系統**:
    - 支援多個會所（例如：3會所, 62會所, 英語區）獨立的點名頁面。
    - 以照顧者為單位分組，清晰呈現名單。
    - 可自訂每週的點名選項 (例如：主日、小排、家聚會等)。
    - 手機版支援左滑刪除功能，並有動畫提示。
- **即時數據統計**:
    - 提供各會所獨立的統計頁面，計算總人數與各項出席人數。
    - 提供所有會所的數據總覽頁面 (`count.html`)。
- **代禱牆系統**:
    - 獨立的代禱牆頁面，用於追踪邀約狀態 (可前來, 無法前來, 未回覆, 未邀約)。
    - 支援新增、修改、刪除代禱事項。
- **使用者認證與權限管理**:
    - 整合 **LINE Login** 進行身份驗證。
    - 實現三級權限管理 (`admin`, `editor`, `guest`)。
    - 提供僅限管理員 (`admin`) 存取的**使用者管理後台**，可線上修改使用者權限。
- **高效能後端**:
    - 使用 **Node-Cache** 建立快取機制，大幅降低對 Google Sheets API 的讀取次數，提升回應速度。
    - 使用 **Express Rate Limit** 防止惡意請求，保護伺服器穩定性。

## 🛠️ 技術棧

- **前端**:
    - HTML5
    - CSS3
    - JavaScript (ES6+)
    - Bootstrap 5
- **後端**:
    - Node.js
    - Express.js
    - `googleapis` (用於 Google Sheets API)
    - `passport.js` (搭配 `passport-line`) 進行 LINE 登入驗證
    - `express-session` (用於 Session 管理)
- **資料庫**:
    - Google Sheets
- **部署**:
    - Render (或任何支援 Node.js 的平台)

## 🚀 專案設定與啟動 (本機開發)

1.  **Clone 專案**:
    ```bash
    git clone <your-repository-url>
    cd <repository-folder>
    ```

2.  **安裝依賴**:
    ```bash
    npm install
    ```

3.  **設定 Google Cloud & Sheets**:
    - 前往 Google Cloud Console 建立一個服務帳號 (Service Account)。
    - 為該服務帳號建立金鑰，並將下載的 JSON 金鑰檔案重新命名為 `credentials.json`，放置在專案的根目錄下。
    - 將 `credentials.json` 中的 `client_email` 分享到您的 Google Sheets 文件中，並給予「編輯者」權限。
    - 在 Google Sheets 中建立一個名為 `Users` 的工作表，並設定 A, B, C 欄分別為 `lineUserId`, `role`, `name`。

4.  **設定 LINE Login Channel**:
    - 前往 LINE Developers Console 建立一個 LINE Login Channel。
    - 記下 **Channel ID** 和 **Channel Secret**。
    - 在 "LINE Login" 標籤頁設定 Callback URL 為 `http://localhost:3000/auth/line/callback`。

5.  **設定環境變數**:
    - 在專案根目錄下建立一個 `.env` 檔案。
    - 填入以下內容：
      ```env
      SPREADSHEET_ID=YOUR_GOOGLE_SHEET_ID
      LINE_CHANNEL_ID=YOUR_LINE_CHANNEL_ID
      LINE_CHANNEL_SECRET=YOUR_LINE_CHANNEL_SECRET
      SESSION_SECRET=a_very_long_and_random_secure_string
      ```

6.  **啟動專案**:
    ```bash
    npm run dev
    ```
    伺服器將會運行在 `http://localhost:3000`。

## ⚙️ 可用指令

- `npm start`: 以生產模式啟動伺服器。
- `npm run dev`: 使用 `nodemon` 啟動開發伺服器，檔案變動時會自動重啟。

## 🌐 API 端點

### 認證
- `GET /auth/line`: 重新導向至 LINE 登入頁面。
- `GET /auth/line/callback`: LINE 登入後的回呼 URL。
- `GET /auth/logout`: 登出並清除 session。
- `GET /api/user`: 獲取當前登入的使用者資訊。

### 使用者管理 (僅限 Admin)
- `GET /api/users`: 獲取所有使用者列表。
- `POST /api/users/update-role`: 更新指定使用者的權限。

### 點名系統 (需登入)
- `GET /getData`: 獲取指定會所和日期的點名資料。
- `POST /addNewData`: 新增一筆名單資料。
- `POST /deleteData`: 刪除一筆名單資料。
- `POST /updateData`: 批次更新點名狀況。
- `GET /getStats`: 獲取指定會所和日期的統計數據。

### 代禱牆 (需登入)
- `GET /getPrayerData`: 獲取指定代禱牆的資料。
- `POST /addPrayer`: 新增代禱事項。
- `POST /deletePrayer`: 刪除代禱事項。
- `POST /updatePrayerStatus`: 更新代禱事項的狀態。

## 部署至 Render

1.  **程式碼準備**: 確保 `server.js` 中的 `cookie.secure` 設定為 `process.env.NODE_ENV === 'production'`。
2.  **Render 設定**:
    - **Build Command**: `npm install`
    - **Start Command**: `node server.js`
3.  **環境變數**: 在 Render 的 Environment 頁面中，設定與 `.env` 檔案中相同的所有變數 (`SPREADSHEET_ID`, `LINE_CHANNEL_ID` 等)。
4.  **新增 `GOOGLE_CREDENTIALS`**: 額外新增一個環境變數，Key 為 `GOOGLE_CREDENTIALS`，Value 為您 `credentials.json` 檔案的**完整內容**。
5.  **更新 Callback URL**: 將您在 LINE Developers Console 中的 Callback URL 更新為 Render 提供的線上網址 (例如 `https://your-app.onrender.com/auth/line/callback`)。