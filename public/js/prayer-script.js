// public/js/prayer-script.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局變數 ---
    let currentHall = 'hall-h3-new'; // 預設會所
    let prayerData = {};

    // --- DOM 元素 ---
    const toastEl = document.getElementById('submit-toast');
    const toast = new bootstrap.Toast(toastEl);
    const mainButton = document.getElementById('main-floating-button');
    const subButtons = document.getElementById('sub-buttons');
    const prayerContainer = document.getElementById('prayer-container');
    const currentHallSpan = document.getElementById('current-hall');
    const prayerModal = new bootstrap.Modal(document.getElementById('prayerModal'));
    const statsModal = new bootstrap.Modal(document.getElementById('statsModal'));

    let isSubButtonsVisible = false;

    // --- 會所名稱對照 ---
    const hallNameMap = {
        'hall-h3-new': 'H3（新生）',
        'hall-h3-peace': 'H3（和平）',
        'hall-h3-english': 'H3（英語）',
        'hall-h62': 'H62',
        'hall-h71': 'H71',
        'hall-h82': 'H82',
        'hall-h103': 'H103'
    };

    // --- 核心函式 ---

    // 顯示 Toast 提示
    function showToast(message, type = 'info') {
        const toastBody = toastEl.querySelector('.toast-body');
        toastBody.textContent = message;
        toastEl.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning', 'text-bg-info');
        toastEl.classList.add(`text-bg-${type}`);
        toast.show();
    }

    // 載入導航欄
    function loadNavbar() {
        fetch('navbar.html')
            .then(response => response.text())
            .then(data => {
                document.getElementById('navbar-container').innerHTML = data;
                // 在此頁面隱藏日期選單和搜尋框
                const dateRangeContainer = document.getElementById('date-range-container');
                if (dateRangeContainer) dateRangeContainer.style.display = 'none';
            })
            .catch(error => console.error('Error loading navbar:', error));
    }

    // 選擇並載入會所資料
    function selectHall(hallId) {
        currentHall = hallId;
        currentHallSpan.textContent = hallNameMap[hallId] || '未知會所';
        // 更新按鈕的選中狀態
        document.querySelectorAll('.hall-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(hallId).classList.add('active');

        fetchPrayerData();
    }

    // 獲取代禱數據
    async function fetchPrayerData() {
        try {
            const response = await fetch(`/getPrayerData?hall=${currentHall}`);
            if (!response.ok) throw new Error(`伺服器錯誤: ${response.status}`);
            prayerData = await response.json();
            renderPrayerData();
        } catch (err) {
            console.error('獲取代禱數據時出錯:', err);
            prayerContainer.innerHTML = '<div class="alert alert-danger">無法載入資料，請稍後再試。</div>';
            showToast('獲取數據時出錯，請稍後再試', 'danger');
        }
    }
    
    // 獲取統計數據
    async function fetchPrayerStats() {
        try {
            const response = await fetch(`/getPrayerStats?hall=${currentHall}`);
            if (!response.ok) throw new Error(`伺服器錯誤: ${response.status}`);
            const stats = await response.json();
            renderModalStats(stats);
            statsModal.show();
        } catch (err) {
            console.error('獲取統計數據時出錯:', err);
            showToast('獲取統計數據時出錯，請稍後再試', 'danger');
        }
    }

    // 渲染代禱事項列表
    function renderPrayerData() {
        prayerContainer.innerHTML = '';
        if (Object.keys(prayerData).length === 0) {
            prayerContainer.innerHTML = '<div class="alert alert-info">目前沒有代禱事項。</div>';
            return;
        }

        for (let id in prayerData) {
            const prayer = prayerData[id];
            const prayerDiv = document.createElement('div');
            prayerDiv.classList.add('prayer-item');
            prayerDiv.innerHTML = `
              <div class="d-flex justify-content-between align-items-center">
                <span>${prayer.content}</span>
                <div class="d-flex align-items-center">
                    <select class="form-select status-select me-2" data-id="${id}" style="width: auto;">
                        <option value="#️⃣" ${prayer.status === '#️⃣' ? 'selected' : ''}>#️⃣</option>
                        <option value="✅" ${prayer.status === '✅' ? 'selected' : ''}>✅</option>
                        <option value="❌" ${prayer.status === '❌' ? 'selected' : ''}>❌</option>
                        <option value="❓" ${prayer.status === '❓' ? 'selected' : ''}>❓</option>
                    </select>
                    <button class="btn btn-sm btn-outline-danger delete-prayer" data-id="${id}">×</button>
                </div>
              </div>
            `;
            prayerContainer.appendChild(prayerDiv);
        }
    }

    // 渲染統計數據 Modal
    function renderModalStats(stats) {
        const statsModalBody = document.getElementById('stats-modal-body');
        statsModalBody.innerHTML = '';
        const order = ['✅', '❌', '❓', '#️⃣'];
        order.forEach(status => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${status}</td><td>${stats[status] || 0}</td>`;
            statsModalBody.appendChild(row);
        });
        const totalRow = document.createElement('tr');
        totalRow.innerHTML = `<td><strong>總數</strong></td><td><strong>${stats.total || 0}</strong></td>`;
        statsModalBody.appendChild(totalRow);
    }
    
    // 隱藏次級按鈕
    function hideSubButtons() {
        subButtons.style.display = 'none';
        mainButton.style.display = 'flex';
        isSubButtonsVisible = false;
    }

    // --- 事件處理 ---

    // 處理 API 請求
    async function handleApiRequest(url, options, successMessage) {
        try {
            const response = await fetch(url, options);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || `伺服器錯誤: ${response.status}`);
            }
            showToast(successMessage, 'success');
            fetchPrayerData(); // 成功後刷新列表
        } catch (error) {
            console.error('API 請求失敗:', error);
            showToast(error.message, 'danger');
        }
    }
    
    // 動態綁定事件 (使用事件委派)
    prayerContainer.addEventListener('change', e => {
        if (e.target.classList.contains('status-select')) {
            const id = e.target.dataset.id;
            const status = e.target.value;
            handleApiRequest('/updatePrayerStatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status, hall: currentHall }),
            }, '狀態更新成功');
        }
    });

    prayerContainer.addEventListener('click', e => {
        if (e.target.classList.contains('delete-prayer')) {
            if (confirm('確定要清除此代禱事項嗎？')) {
                const id = e.target.dataset.id;
                handleApiRequest('/deletePrayer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, hall: currentHall }),
                }, '代禱事項清除成功');
            }
        }
    });
    
    // 新增代禱事項表單提交
    document.getElementById('prayerForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const content = document.getElementById('prayer-content').value;
        const status = document.getElementById('prayer-status').value;
        if (!content.trim()) {
            showToast('姓名不能為空', 'warning');
            return;
        }
        handleApiRequest('/addPrayer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, status, hall: currentHall }),
        }, '新增成功');
        prayerModal.hide();
        this.reset();
    });

    // --- 頁面初始化 ---

    // 綁定會所按鈕事件
    document.querySelectorAll('.hall-btn').forEach(button => {
        button.addEventListener('click', () => selectHall(button.id));
    });

    // 綁定浮動按鈕事件
    mainButton.addEventListener('click', (e) => {
        e.stopPropagation();
        isSubButtonsVisible = !isSubButtonsVisible;
        subButtons.style.display = isSubButtonsVisible ? 'flex' : 'none';
        mainButton.style.display = isSubButtonsVisible ? 'none' : 'flex';
    });

    document.getElementById('sub-add-button').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('prayerForm').reset();
        document.getElementById('prayer-status').value = '#️⃣'; // 預設為'尚未邀約'
        prayerModal.show();
        hideSubButtons();
    });

    document.getElementById('sub-stats-button').addEventListener('click', (e) => {
        e.stopPropagation();
        fetchPrayerStats();
        hideSubButtons();
    });

    document.addEventListener('click', (e) => {
        if (isSubButtonsVisible && !subButtons.contains(e.target) && e.target !== mainButton) {
            hideSubButtons();
        }
    });

    // 初始載入
    loadNavbar();
    selectHall(currentHall); // 載入預設會所的資料
});