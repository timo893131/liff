// public/js/hall-script.js (最終完美修復版)

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局變數 ---
    let formData = {};
    let nameToRowIndexMap = {};
    let lastFormData = null;
    let isSubButtonsVisible = false;
    let dateRanges = [];
    const options = ['有主日(早上)', '聖經講座(晚上)', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];
    const HALL_NAME_MAP = {
        'hall3': '3會所',
        'hall3e': '3會所英語區',
        'hall62': '62會所',
        'hall71': '71會所',
        'hall82': '82會所',
        'hall103': '103會所'
    };

    // --- DOM 元素 ---
    const toastEl = document.getElementById('submit-toast');
    const toast = new bootstrap.Toast(toastEl);
    const mainButton = document.getElementById('main-floating-button');
    const subButtons = document.getElementById('sub-buttons');

    // --- ★★★ 核心函式 (已整合在此作用域內) ★★★ ---

    /**
     * 從 URL 參數獲取當前的會所 ID
     */
    function getHallFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || 'hall3'; // 預設返回 'hall3'
    }

    /**
     * 根據會所 ID 更新頁面標題和 H1
     */
    function updatePageContent(hall) {
        const hallDisplayName = HALL_NAME_MAP[hall] || '點名系統';
        document.title = hallDisplayName;
        const hallTitleSpan = document.getElementById('hall-title');
        if (hallTitleSpan) {
            hallTitleSpan.textContent = hallDisplayName;
        }
    }

    /**
     * ★★★ 已修正：確保此函式在作用域內可被呼叫 ★★★
     * 顯示 Toast 提示
     */
    function showToast(message, type = 'info') {
        const toastBody = toastEl.querySelector('.toast-body');
        toastBody.textContent = message;
        toastEl.className = 'toast'; // 重設 class
        toastEl.classList.add(`text-bg-${type}`);
        toast.show();
    }

    /**
     * 從後端獲取並設定日期範圍
     */
    async function fetchAndSetDateRanges() {
        try {
            const response = await fetch('/getDateRanges', { credentials: 'include' });
            if (!response.ok) throw new Error('無法獲取日期範圍');
            const data = await response.json();
            dateRanges = data.dateRanges || [];

            const dateRangeSelect = document.getElementById('date-range');
            if (dateRangeSelect) {
                populateDateRangeSelect(dateRangeSelect);
                setDefaultDate(dateRangeSelect);
            }
        } catch (error) {
            console.error('Error fetching date ranges:', error);
            showToast('無法載入日期範圍，請檢查伺服器', 'danger');
        }
    }

    /**
     * 填充日期下拉選單
     */
    function populateDateRangeSelect(selectElement) {
        selectElement.innerHTML = '<option value="" disabled>請選擇日期</option>';
        if (dateRanges.length > 0) {
            dateRanges.forEach((date) => {
                const option = document.createElement('option');
                option.value = date.code;
                option.textContent = date.range;
                selectElement.appendChild(option);
            });
        } else {
            selectElement.innerHTML = '<option value="">無可用日期</option>';
        }
    }

    /**
     * 設定預設日期
     */
    function setDefaultDate(selectElement) {
        if (dateRanges.length === 0) return;
        const currentDate = new Date();
        let defaultCode = dateRanges[0].code;

        for (const range of dateRanges) {
            const [startStr, endStr] = range.range.split('~');
            const currentYear = new Date().getFullYear();
            const startDate = new Date(`${currentYear}/${startStr}`);
            const endDate = new Date(`${currentYear}/${endStr}`);
            endDate.setHours(23, 59, 59, 999);
            if (currentDate >= startDate && currentDate <= endDate) {
                defaultCode = range.code;
                break;
            }
        }
        selectElement.value = defaultCode;
        fetchDataAndUpdateCheckboxes(defaultCode, getHallFromURL());
    }

    /**
     * 格式化日期範圍顯示
     */
    function formatDateRange(dateCode) {
        const found = dateRanges.find(r => r.code === dateCode);
        return found ? found.range : '載入中...';
    }

    /**
     * 載入導覽列並綁定事件
     */
    function loadNavbar() {
        fetch('navbar.html')
            .then(response => response.text())
            .then(data => {
                document.getElementById('navbar-container').innerHTML = data;
                document.getElementById('date-range').addEventListener('change', function() {
                    if (this.value) {
                        const hall = getHallFromURL();
                        const isStatsVisible = document.getElementById('stats-container').style.display === 'block';
                        if (isStatsVisible) {
                            fetchStats(this.value, hall);
                        } else {
                            fetchDataAndUpdateCheckboxes(this.value, hall);
                        }
                    }
                });
                document.getElementById('search-input').addEventListener('input', function() {
                    filterCaregiverData(this.value.trim().toLowerCase());
                });
                fetchAndSetDateRanges();
                checkAdmin();
            })
            .catch(error => console.error('Error loading navbar:', error));
    }

    /**
     * 檢查管理員權限
     */
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

    /**
     * 更新小區選項
     */
    async function updateRegionOptions(hallId) {
        const regionSelect = document.getElementById('region');
        regionSelect.innerHTML = '<option value="">載入中...</option>';
        try {
            const response = await fetch(`/getRegions?hall=${hallId}`, { credentials: 'include' });
            if (!response.ok) throw new Error('無法獲取小區資料');
            const regions = await response.json();
            regionSelect.innerHTML = '<option value="" disabled selected>請選擇小區</option>';
            if (regions.length > 0) {
                regions.forEach(region => {
                    const option = document.createElement('option');
                    option.value = region;
                    option.textContent = region;
                    regionSelect.appendChild(option);
                });
            } else {
                regionSelect.innerHTML = '<option value="">此會所無小區資料</option>';
            }
        } catch (error) {
            console.error('Error fetching regions:', error);
            regionSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    /**
     * 抓取並更新 Checkbox 資料
     */
    function fetchDataAndUpdateCheckboxes(selectedDate, hall, highlightGroup = null) {
        const checkboxContainer = document.querySelector('#checkbox-container');
        checkboxContainer.innerHTML = `<div class="d-flex justify-content-center mt-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;

        fetch(`/getData?selectedDate=${selectedDate}&hall=${hall}`, { credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                formData = data.groupedData;
                nameToRowIndexMap = data.nameToRowIndexMap;
                document.getElementById('current-date').textContent = formatDateRange(selectedDate);
                renderCaregiverData(formData, highlightGroup);
            })
            .catch(err => {
                console.error('Error fetching data:', err);
                checkboxContainer.innerHTML = `<div class="alert alert-danger">資料載入失敗，請稍後再試。</div>`;
                showToast('資料載入失敗', 'danger');
            });
    }

    /**
     * 渲染牧人與名單
     */
    function renderCaregiverData(dataToRender, highlightGroup = null) {
        const checkboxContainer = document.querySelector('#checkbox-container');
        checkboxContainer.innerHTML = '';
        if (Object.keys(dataToRender).length === 0) {
            checkboxContainer.innerHTML = '<p class="text-center text-muted mt-3">此日期範圍尚無名單資料。</p>';
            return;
        }
        for (let caregiver in dataToRender) {
            const caregiverDiv = document.createElement('div');
            caregiverDiv.classList.add('caregiver-group');
            caregiverDiv.innerHTML = `<h3>${caregiver}</h3>`;
            dataToRender[caregiver].forEach(person => {
                const checkboxWrapper = createCheckboxWrapper(caregiver, person);
                caregiverDiv.appendChild(checkboxWrapper);
            });

            const submitButton = document.createElement('button');
            submitButton.classList.add('btn', 'btn-info', 'btn-sm', 'mt-2', 'submit-group-btn');
            submitButton.innerHTML = '<span>✔</span> 提交本組修改';
            submitButton.addEventListener('click', (event) => submitGroupChanges(caregiver, event.target));
            caregiverDiv.appendChild(submitButton);

            checkboxContainer.appendChild(caregiverDiv);

            if (highlightGroup === caregiver) {
                caregiverDiv.classList.add('highlight');
                setTimeout(() => caregiverDiv.classList.remove('highlight'), 2000);
            }
        }
        
        // ★★★ 已恢復：手機版滑動提示動畫 ★★★
        const firstSlider = document.querySelector('.slider-wrapper');
        if (firstSlider && window.innerWidth <= 600) {
            const checkboxWrapper = firstSlider.querySelector('.checkbox-wrapper');
            if (checkboxWrapper) {
                setTimeout(() => {
                    checkboxWrapper.style.transition = 'transform 0.5s ease-in-out';
                    checkboxWrapper.style.transform = 'translateX(-50px)';
                    setTimeout(() => {
                        checkboxWrapper.style.transform = 'translateX(0)';
                    }, 1200);
                }, 500);
            }
        }
    }
    
    /**
     * 建立 Checkbox 項目 (包含滑動刪除)
     */
    // ★★★ 核心修正：重寫滑動邏輯 ★★★
    function createCheckboxWrapper(caregiver, person) {
        const sliderWrapper = document.createElement('div');
        sliderWrapper.classList.add('slider-wrapper');

        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.classList.add('checkbox-wrapper');
        checkboxWrapper.innerHTML = `<h4>${person.name}</h4>`;

        const deleteArea = document.createElement('div');
        deleteArea.classList.add('delete-area');
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('btn', 'btn-danger', 'btn-sm');
        deleteBtn.textContent = '刪除';
        deleteArea.appendChild(deleteBtn);

        sliderWrapper.appendChild(checkboxWrapper);
        sliderWrapper.appendChild(deleteArea);

        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'checkbox-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            const id = `${caregiver}-${person.name}-${option}`.replace(/\s/g, '-');
            checkbox.id = id;
            checkbox.checked = person.attendance?.includes(option);
            const label = document.createElement('label');
            label.setAttribute('for', id);
            label.textContent = option;
            item.append(checkbox, label);
            checkboxWrapper.appendChild(item);
        });
        
        if (window.innerWidth <= 768) {
            let touchStartX = 0;
            let touchEndX = 0;

            sliderWrapper.addEventListener('touchstart', (e) => {
                touchStartX = e.targetTouches[0].clientX;
            }, { passive: true });

            sliderWrapper.addEventListener('touchmove', (e) => {
                touchEndX = e.targetTouches[0].clientX;
            }, { passive: true });

            sliderWrapper.addEventListener('touchend', () => {
                const deltaX = touchStartX - touchEndX;
                // 向左滑動超過50px，且不是從右向左滑回來
                if (deltaX > 50 && !sliderWrapper.classList.contains('is-open')) {
                    sliderWrapper.classList.add('is-open');
                }
                // 向右滑動超過50px
                if (deltaX < -50) {
                    sliderWrapper.classList.remove('is-open');
                }
            });
        }
        
        deleteBtn.addEventListener('click', () => deletePerson(caregiver, person.name));
        return sliderWrapper;
    }


    /**
     * 刪除名單
     */
    function deletePerson(caregiver, name) {
        if (confirm(`確定要刪除 ${name} 的資料嗎？`)) {
            const hall = getHallFromURL();
            fetch('/deleteData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hall, caregiver, name }),
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === 'Data deleted successfully') {
                    showToast(`${name} 的資料已刪除`, 'success');
                    fetchDataAndUpdateCheckboxes(document.getElementById('date-range').value, hall);
                } else {
                    showToast('刪除失敗', 'danger');
                }
            })
            .catch(error => {
                console.error('Error deleting data:', error);
                showToast('刪除失敗，請檢查網路連線', 'danger');
            });
        }
    }

    /**
     * 提交本組修改
     */
    async function submitGroupChanges(caregiver, button) {
        const updatedData = { [caregiver]: collectGroupData(caregiver) };
        const selectedDate = document.getElementById('date-range').value;
        const hall = getHallFromURL();

        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 提交中...';

        try {
            const response = await fetch('/updateData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updatedData, hall, selectedDate, nameToRowIndexMap }),
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || '提交失敗');

            showToast(`${caregiver} 的修改已提交`, 'success');
            fetchDataAndUpdateCheckboxes(selectedDate, hall, caregiver);
        } catch (error) {
            console.error('提交失敗:', error);
            showToast(`${caregiver} 的修改提交失敗`, 'danger');
        } finally {
            button.disabled = false;
            button.innerHTML = '<span>✔</span> 提交修改';
        }
    }
    
    /**
     * 收集本組資料
     */
    function collectGroupData(caregiver) {
        return formData[caregiver].map(person => ({
            name: person.name,
            selectedOptions: options.filter(option => {
                const id = `${caregiver}-${person.name}-${option}`.replace(/\s/g, '-');
                const checkbox = document.getElementById(id);
                return checkbox ? checkbox.checked : false;
            })
        }));
    }

    /**
     * 根據搜尋詞過濾名單
     */
    function filterCaregiverData(searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        if (!lowerCaseSearchTerm) {
            renderCaregiverData(formData);
            return;
        }
        const filteredData = {};
        for (let caregiver in formData) {
            const caregiverMatch = caregiver.toLowerCase().includes(lowerCaseSearchTerm);
            const personMatches = formData[caregiver].filter(person =>
                person.name.toLowerCase().includes(lowerCaseSearchTerm)
            );
            if (caregiverMatch || personMatches.length > 0) {
                filteredData[caregiver] = caregiverMatch ? formData[caregiver] : personMatches;
            }
        }
        renderCaregiverData(filteredData);
    }
    
    /**
     * 獲取統計數據
     */
    function fetchStats(selectedDate, hall) {
        fetch(`/getStats?selectedDate=${selectedDate}&hall=${hall}`, { credentials: 'include' })
            .then(response => {
                if (!response.ok) { throw new Error('獲取統計資料失敗'); }
                return response.json();
            })
            .then(data => {
                renderStats(data);
                document.getElementById('stats-container').style.display = 'block';
                document.getElementById('checkbox-container').style.display = 'none';
                document.getElementById('current-date').textContent = formatDateRange(selectedDate);
            })
            .catch(err => {
                console.error('Error fetching stats:', err);
                showToast('獲取統計資料失敗', 'danger');
            });
    }

    /**
     * 渲染統計表格
     */
    function renderStats(stats) {
        const statsBody = document.getElementById('stats-body');
        statsBody.innerHTML = '';
        for (const category in stats) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${category}</td><td>${stats[category]}</td>`;
            statsBody.appendChild(row);
        }
    }
    
    /**
     * 隱藏浮動子按鈕
     */
    function hideSubButtons() {
        if(subButtons) subButtons.style.display = 'none';
        isSubButtonsVisible = false;
    }

    // --- 初始化與事件綁定 ---

    function initializeHallPage() {
        const currentHall = getHallFromURL();
        updatePageContent(currentHall);
        loadNavbar();

        mainButton.addEventListener('click', (e) => {
            e.stopPropagation();
            isSubButtonsVisible = !isSubButtonsVisible;
            if(subButtons) subButtons.style.display = isSubButtonsVisible ? 'flex' : 'none';
        });
        
        document.addEventListener('click', (e) => {
            if (isSubButtonsVisible && !subButtons.contains(e.target)) {
                hideSubButtons();
            }
        });

        document.getElementById('add-entry-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const modal = new bootstrap.Modal(document.getElementById('addEntryModal'));
            document.getElementById('addEntryForm').reset();
            const hallSelect = document.getElementById('hall');
            const currentHallValue = getHallFromURL();
            hallSelect.value = currentHallValue;
            updateRegionOptions(currentHallValue);
            modal.show();
            hideSubButtons();
        });

        document.getElementById('stats-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedDate = document.getElementById('date-range').value;
            const hall = getHallFromURL();
            fetchStats(selectedDate, hall);
            hideSubButtons();
        });

        document.getElementById('back-to-list').addEventListener('click', () => {
            document.getElementById('stats-container').style.display = 'none';
            document.getElementById('checkbox-container').style.display = 'block';
        });

        document.getElementById('addEntryForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const newEntryData = {
                hall: document.getElementById('hall').value,
                caregiver: document.getElementById('caregiver').value,
                name: document.getElementById('name').value,
                region: document.getElementById('region').value,
                identity: document.getElementById('identity').value,
                department: document.getElementById('department').value
            };
            lastFormData = { ...newEntryData };

            fetch('/addNewData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEntryData),
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === 'Data added successfully') {
                    showToast('新增名單成功', 'success');
                    bootstrap.Modal.getInstance(document.getElementById('addEntryModal')).hide();
                    fetchDataAndUpdateCheckboxes(document.getElementById('date-range').value, getHallFromURL());
                } else {
                    throw new Error(data.message || '新增失敗');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast(`新增失敗: ${error.message}`, 'danger');
            });
        });

        document.getElementById('copy-last').addEventListener('click', function() {
            if (lastFormData) {
                document.getElementById('hall').value = lastFormData.hall;
                document.getElementById('caregiver').value = lastFormData.caregiver;
                document.getElementById('region').value = lastFormData.region;
                document.getElementById('identity').value = lastFormData.identity;
                document.getElementById('name').value = '';
                document.getElementById('department').value = '';
            }
        });
        
        const addEntryModal = document.getElementById('addEntryModal');
        if(addEntryModal){
            addEntryModal.addEventListener('shown.bs.modal', () => {
                const hallSelect = document.getElementById('hall');
                hallSelect.addEventListener('change', (e) => {
                    updateRegionOptions(e.target.value);
                });
            });
        }
    }
    
    // 執行初始化
    initializeHallPage();
});