// public/js/admin-script.js

document.addEventListener('DOMContentLoaded', () => {
    let allUsers = []; // 儲存所有使用者資料
    const userListBody = document.getElementById('user-list-body');
    const searchInput = document.getElementById('user-search-input');

    // Toast 提示功能
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        const toastId = `toast-${Date.now()}`;
        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
              <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
              </div>
            </div>`;
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }

    // 渲染使用者列表
    function renderUsers(usersToRender) {
        userListBody.innerHTML = '';
        if (usersToRender.length === 0) {
            userListBody.innerHTML = '<tr><td colspan="3" class="text-center">找不到使用者</td></tr>';
            return;
        }

        usersToRender.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.name}</td>
                <td>
                    <select class="form-select form-select-sm" data-userid="${user.lineUserId}">
                        <option value="guest" ${user.role === 'guest' ? 'selected' : ''}>訪客 (Guest)</option>
                        <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>編輯者 (Editor)</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理員 (Admin)</option>
                    </select>
                </td>
                <td><small class="text-muted">${user.lineUserId}</small></td>
            `;
            userListBody.appendChild(row);
        });
    }

    // 更新使用者權限
    async function updateUserRole(lineUserId, newRole) {
        try {
            const response = await fetch('/api/users/update-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineUserId, newRole }),
                credentials: 'include'
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || '更新失敗');
            }
            showToast('權限更新成功', 'success');
            // 更新本地資料，避免重新請求 API
            const user = allUsers.find(u => u.lineUserId === lineUserId);
            if (user) user.role = newRole;
        } catch (error) {
            console.error('Error updating role:', error);
            showToast(`錯誤: ${error.message}`, 'danger');
        }
    }

    // 初始載入
    async function initialize() {
        try {
            const response = await fetch('/api/users', { credentials: 'include' });
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (response.status === 403) {
                document.body.innerHTML = '<div class="alert alert-danger">權限不足，只有管理員才能存取此頁面。</div>';
                return;
            }
            allUsers = await response.json();
            renderUsers(allUsers);
        } catch (error) {
            console.error('Error fetching users:', error);
            userListBody.innerHTML = '<tr><td colspan="3" class="text-center">載入使用者列表失敗</td></tr>';
        }
    }
    
    // 事件綁定
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredUsers = allUsers.filter(user => user.name.toLowerCase().includes(searchTerm));
        renderUsers(filteredUsers);
    });

    userListBody.addEventListener('change', (e) => {
        if (e.target.tagName === 'SELECT') {
            const userId = e.target.dataset.userid;
            const newRole = e.target.value;
            updateUserRole(userId, newRole);
        }
    });
    
    initialize();
});