// public/js/prayer-script.js (最終修正版)

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局變數 ---
    let currentGroup = 'h3-peace-brothers'; // 預設群組
    let prayerItems = [];

    // --- DOM 元素 ---
    const toastEl = document.getElementById('toast');
    const toast = new bootstrap.Toast(toastEl);
    const groupSelect = document.getElementById('group-select');
    const prayerList = document.getElementById('prayer-list');
    const modalEl = document.getElementById('prayerModal');
    const prayerModal = new bootstrap.Modal(modalEl);
    const modalTitle = document.getElementById('prayerModalLabel');
    const prayerForm = document.getElementById('prayerForm');
    const nameInput = document.getElementById('prayer-name');
    const itemInput = document.getElementById('prayer-item');
    let currentEditId = null;

    // --- 核心函式 ---
    
    // 載入導航欄並設定
    function loadNavbar() {
        fetch('navbar.html')
            .then(response => response.text())
            .then(data => {
                document.getElementById('navbar-container').innerHTML = data;
                
                // 隱藏日期範圍和搜尋框，因為代禱牆頁面用不到
                const dateRangeContainer = document.getElementById('date-range');
                if (dateRangeContainer) dateRangeContainer.style.display = 'none';

                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.style.display = 'none';

                // 檢查管理員身份以顯示「管理後台」連結
                checkAdmin();
            })
            .catch(error => console.error('Error loading navbar:', error));
    }

    // 檢查管理員權限
    function checkAdmin() {
        fetch('/api/user', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.loggedIn && data.user.role === 'admin') {
                    const adminLink = document.getElementById('admin-link');
                    if (adminLink) adminLink.style.display = 'block';
                }
            });
    }

    // 顯示 Toast 提示
    function showToast(message, type = 'info') {
        toastEl.querySelector('.toast-body').textContent = message;
        toastEl.className = 'toast';
        toastEl.classList.add(`text-bg-${type}`);
        toast.show();
    }

    // 渲染代禱事項列表
    function renderPrayerItems() {
        prayerList.innerHTML = '';
        if (prayerItems.length === 0) {
            prayerList.innerHTML = '<div class="col-12"><div class="alert alert-light">這個群組目前沒有代禱事項。</div></div>';
            return;
        }
        prayerItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'col-md-6 col-lg-4 mb-4';
            card.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${item.name}</h5>
                        <p class="card-text flex-grow-1">${item.item.replace(/\n/g, '<br>')}</p>
                        <div class="mt-auto text-end">
                            <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${item.id}">編輯</button>
                            <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${item.id}">刪除</button>
                        </div>
                    </div>
                </div>`;
            prayerList.appendChild(card);
        });
    }

    // 獲取 API 資料
    async function fetchPrayerItems() {
        try {
            const response = await fetch(`/api/prayer-items?group=${currentGroup}`, { credentials: 'include' });
            if (!response.ok) {
                if(response.status === 401) window.location.href = '/login.html';
                throw new Error('無法載入資料');
            }
            prayerItems = await response.json();
            renderPrayerItems();
        } catch (err) {
            console.error(err);
            showToast(err.message, 'danger');
        }
    }
    
    // 統一處理 API 請求
    async function handleApiRequest(url, options, successMessage) {
        options.credentials = 'include';
        try {
            const response = await fetch(url, options);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '操作失敗');
            showToast(successMessage, 'success');
            prayerModal.hide();
            fetchPrayerItems(); // 成功後刷新
        } catch (err) {
            showToast(err.message, 'danger');
        }
    }

    // --- 事件處理 ---
    groupSelect.addEventListener('change', () => {
        currentGroup = groupSelect.value;
        fetchPrayerItems();
    });

    document.getElementById('add-prayer-btn').addEventListener('click', () => {
        currentEditId = null;
        modalTitle.textContent = '新增代禱事項';
        prayerForm.reset();
        prayerModal.show();
    });

    prayerList.addEventListener('click', e => {
        const target = e.target;
        if (target.classList.contains('edit-btn')) {
            const id = target.dataset.id;
            const item = prayerItems.find(p => p.id == id);
            if (item) {
                currentEditId = id;
                modalTitle.textContent = '編輯代禱事項';
                nameInput.value = item.name;
                itemInput.value = item.item;
                prayerModal.show();
            }
        }
        if (target.classList.contains('delete-btn')) {
            const id = target.dataset.id;
            if (confirm('確定要刪除這個代禱事項嗎？')) {
                const body = JSON.stringify({ group: currentGroup });
                handleApiRequest(
                    `/api/prayer-items/${id}`, 
                    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body }, 
                    '刪除成功'
                );
            }
        }
    });

    prayerForm.addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const item = itemInput.value.trim();
        if (!name || !item) {
            showToast('姓名和代禱事項都不能為空', 'warning');
            return;
        }
        const url = currentEditId ? `/api/prayer-items/${currentEditId}` : '/api/prayer-items';
        const method = currentEditId ? 'PUT' : 'POST';
        const body = JSON.stringify({ name, item, group: currentGroup });
        const successMessage = currentEditId ? '更新成功' : '新增成功';
        handleApiRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body }, successMessage);
    });
    
    // --- 初始化 ---
    loadNavbar();
    fetchPrayerItems();
});