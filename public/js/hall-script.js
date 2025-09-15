// public/js/hall-script.js (最終完美定稿版)

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局變數 ---
    let formData = {};
    let nameToRowIndexMap = {};
    let lastFormData = null;
    let isSubButtonsVisible = false;
    let dateRanges = [];
    const options = ['有主日(早上)', '聖經講座(晚上)', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];
    const HALL_NAME_MAP = {
        'hall3': '3會所', 'hall3e': '3會所英語區', 'hall62': '62會所',
        'hall71': '71會所', 'hall82': '82會所', 'hall103': '103會所'
    };

    // --- DOM 元素 ---
    const toastEl = document.getElementById('submit-toast');
    const toast = new bootstrap.Toast(toastEl);
    const mainButton = document.getElementById('main-floating-button');
    const subButtons = document.getElementById('sub-buttons');
    const currentDateSpan = document.getElementById('current-date');
    const dateRangeSelect = document.getElementById('date-range');
    const searchInput = document.getElementById('search-input');
    const checkboxContainer = document.querySelector('#checkbox-container');

    // --- 工具函數 ---
    function debounce(func, wait) {
      let timeout;
      return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    }

    async function fetchAPI(url, options = {}) {
      try {
        const response = await fetch(url, { credentials: 'include', ...options });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || '請求失敗');
        }
        return await response.json();
      } catch (error) {
        showToast(error.message, 'danger');
        throw error;
      }
    }

    // --- 函式定義 ---

    function getHallFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || 'hall3';
    }

    function updatePageContent(hall) {
        const hallDisplayName = HALL_NAME_MAP[hall] || '點名系統';
        document.title = hallDisplayName;
        document.getElementById('hall-title').textContent = hallDisplayName;
    }

    function showToast(message, type = 'info') {
        const toastBody = toastEl.querySelector('.toast-body');
        toastBody.textContent = message;
        toastEl.className = 'toast';
        toastEl.classList.add(`text-bg-${type}`);
        toast.show();
    }

    async function fetchAndSetDateRanges() {
      try {
          const data = await fetchAPI('/getDateRanges');
          dateRanges = data.dateRanges || [];
          populateDateRangeSelect();
          if (dateRanges.length > 0) {
              setDefaultDate();
          }
      } catch (error) {
          console.error('Error fetching date ranges:', error);
          currentDateSpan.textContent = '載入失敗';
          dateRangeSelect.innerHTML = '<option value="">載入失敗</option>';
          checkboxContainer.innerHTML = `<div class="alert alert-danger">無法載入點名資料，因為日期範圍獲取失敗。</div>`;
      }
    }

    function populateDateRangeSelect() {
        dateRangeSelect.innerHTML = '';
        if (dateRanges.length > 0) {
            dateRanges.forEach(date => {
                const option = document.createElement('option');
                option.value = date.code;
                option.textContent = date.range;
                dateRangeSelect.appendChild(option);
            });
        } else {
            dateRangeSelect.innerHTML = '<option value="">無可用日期</option>';
            currentDateSpan.textContent = '無可用日期';
            checkboxContainer.innerHTML = `<div class="alert alert-warning">系統尚未設定任何日期範圍，請至 Google Sheets 的「設定」工作表中新增。</div>`;
        }
    }

    function setDefaultDate() {
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
        dateRangeSelect.value = defaultCode;
        fetchDataAndUpdateCheckboxes(defaultCode, getHallFromURL());
    }
    
    function formatDateRange(dateCode) {
        const found = dateRanges.find(r => r.code === dateCode);
        return found ? found.range : '載入中...';
    }

    function loadNavbar() {
        fetch('navbar.html')
            .then(response => response.text())
            .then(data => {
                const nav = document.createElement('nav');
                nav.className = 'navbar navbar-expand-lg fixed-top';
                nav.innerHTML = data;
                document.body.prepend(nav);
                checkAdmin();
            });
    }

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

    function fetchDataAndUpdateCheckboxes(selectedDate, hall, highlightGroup = null) {
        checkboxContainer.innerHTML = `<div class="d-flex justify-content-center mt-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
        fetch(`/getData?selectedDate=${selectedDate}&hall=${hall}`, { credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                formData = data.groupedData;
                nameToRowIndexMap = data.nameToRowIndexMap;
                currentDateSpan.textContent = formatDateRange(selectedDate);
                renderCaregiverData(formData, highlightGroup);
            })
            .catch(err => {
                console.error('Error fetching data:', err);
                checkboxContainer.innerHTML = `<div class="alert alert-danger">資料載入失敗，請稍後再試。</div>`;
                showToast('資料載入失敗', 'danger');
            });
    }

    function renderCaregiverData(dataToRender, highlightGroup = null) {
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
                const slider = createCheckboxWrapper(caregiver, person);
                caregiverDiv.appendChild(slider);
            });

            const submitButton = document.createElement('button');
            submitButton.classList.add('btn', 'btn-primary', 'btn-sm', 'mt-3', 'submit-group-btn');
            submitButton.innerHTML = '<span>✔</span> 提交本組修改';
            submitButton.addEventListener('click', (event) => submitGroupChanges(caregiver, event.target));
            caregiverDiv.appendChild(submitButton);

            checkboxContainer.appendChild(caregiverDiv);

            if (highlightGroup === caregiver) {
                caregiverDiv.classList.add('highlight');
                setTimeout(() => caregiverDiv.classList.remove('highlight'), 2000);
            }
        }
        
        const firstSlider = document.querySelector('.slider-wrapper');
        if (firstSlider && window.innerWidth <= 768) {
            setTimeout(() => {
                firstSlider.classList.add('is-open');
                setTimeout(() => {
                    firstSlider.classList.remove('is-open');
                }, 1200);
            }, 500);
        }
    }
    
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
            label.setAttribute('aria-label', `${person.name} 的 ${option} 狀態`);
            item.append(checkbox, label);
            checkboxWrapper.appendChild(item);
        });
        
        if (window.innerWidth <= 768) {
            let touchStartX = 0;
            let touchEndX = 0;

            sliderWrapper.addEventListener('touchstart', (e) => {
                touchStartX = e.targetTouches[0].clientX;
                sliderWrapper.style.transition = 'none';
            }, { passive: true });

            sliderWrapper.addEventListener('touchmove', (e) => {
                touchEndX = e.targetTouches[0].clientX;
                const deltaX = touchStartX - touchEndX;
                if (Math.abs(deltaX) > 20) {
                  sliderWrapper.classList.add('is-sliding');
                } else {
                  sliderWrapper.classList.remove('is-sliding');
                }
            }, { passive: true });

            sliderWrapper.addEventListener('touchend', () => {
                sliderWrapper.style.transition = 'transform 0.3s ease';
                sliderWrapper.classList.remove('is-sliding');
                const deltaX = touchStartX - touchEndX;
                if (deltaX > 80) { 
                    sliderWrapper.classList.add('is-open');
                }
                if (deltaX < -80) {
                    sliderWrapper.classList.remove('is-open');
                }
            });
        }
        
        deleteBtn.addEventListener('click', () => deletePerson(caregiver, person.name));
        return sliderWrapper;
    }
    
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
                    fetchDataAndUpdateCheckboxes(dateRangeSelect.value, hall);
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

    async function submitGroupChanges(caregiver, button) {
        const updatedData = { [caregiver]: collectGroupData(caregiver) };
        const selectedDate = dateRangeSelect.value;
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
            button.innerHTML = '<span>✔</span> 提交本組修改';
        }
    }
    
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

    function filterCaregiverData(searchTerm) {
        if (!searchTerm) {
            renderCaregiverData(formData);
            return;
        }
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
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
    
    async function updateRegionOptions(hallId) {
        const regionSelect = document.getElementById('region');
        regionSelect.innerHTML = '<option value="">載入中...</option>';
        try {
            const regions = await fetchAPI(`/getRegions?hall=${hallId}`);
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
    
    async function fetchStats(selectedDate, hall) {
        try {
            const data = await fetchAPI(`/getStats?selectedDate=${selectedDate}&hall=${hall}`);
            renderStats(data);
            document.getElementById('stats-container').style.display = 'block';
            document.getElementById('checkbox-container').style.display = 'none';
            currentDateSpan.textContent = formatDateRange(selectedDate);
        } catch (err) {
            console.error('Error fetching stats:', err);
            showToast('獲取統計資料失敗', 'danger');
        }
    }

    function renderStats(stats) {
        const statsBody = document.getElementById('stats-body');
        statsBody.innerHTML = '';
        for (const category in stats) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${category}</td><td>${stats[category]}</td>`;
            if (stats[category] > 10) {
              row.classList.add('table-success');
            }
            statsBody.appendChild(row);
        }
    }
    
    // --- 初始化與事件綁定 ---
    function initialize() {
        updatePageContent(getHallFromURL());
        loadNavbar();

        dateRangeSelect.addEventListener('change', function() {
            if (this.value) {
                const hall = getHallFromURL();
                if (document.getElementById('stats-container').style.display === 'block') {
                    fetchStats(this.value, hall);
                } else {
                    fetchDataAndUpdateCheckboxes(this.value, hall);
                }
            }
        });

        searchInput.addEventListener('input', debounce(function() {
            filterCaregiverData(this.value.trim().toLowerCase());
        }, 300));
        
        mainButton.addEventListener('click', (e) => {
            e.stopPropagation();
            isSubButtonsVisible = !isSubButtonsVisible;
            if (subButtons) {
              subButtons.style.display = 'flex';
              subButtons.classList.toggle('active', isSubButtonsVisible);
              mainButton.setAttribute('aria-expanded', isSubButtonsVisible);
            }
        });

        mainButton.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            mainButton.click();
          }
        });

        document.addEventListener('click', (e) => {
            if (isSubButtonsVisible && subButtons && !subButtons.contains(e.target)) {
                isSubButtonsVisible = false;
                subButtons.classList.remove('active');
                setTimeout(() => {
                  subButtons.style.display = 'none';
                }, 300);
            }
        });
        
        const addEntryBtn = document.getElementById('add-entry-button');
        if(addEntryBtn) addEntryBtn.addEventListener('click', (e) => {
             e.stopPropagation();
            const modal = new bootstrap.Modal(document.getElementById('addEntryModal'));
            document.getElementById('addEntryForm').reset();
            const hallSelect = document.getElementById('hall');
            const currentHallValue = getHallFromURL();
            hallSelect.value = currentHallValue;
            updateRegionOptions(currentHallValue);
            modal.show();
        });

        const statsBtn = document.getElementById('stats-button');
        if(statsBtn) statsBtn.addEventListener('click', (e) => {
             e.stopPropagation();
            const selectedDate = dateRangeSelect.value;
            const hall = getHallFromURL();
            fetchStats(selectedDate, hall);
        });

        const backToListBtn = document.getElementById('back-to-list');
        if(backToListBtn) backToListBtn.addEventListener('click', () => {
            document.getElementById('stats-container').style.display = 'none';
            document.getElementById('checkbox-container').style.display = 'block';
        });

        const addEntryForm = document.getElementById('addEntryForm');
        if(addEntryForm) addEntryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formError = document.getElementById('form-error');
            formError.classList.add('d-none');

            const newEntryData = {
                hall: document.getElementById('hall').value,
                caregiver: document.getElementById('caregiver').value,
                name: document.getElementById('name').value,
                region: document.getElementById('region').value,
                identity: document.getElementById('identity').value,
                department: document.getElementById('department').value
            };

            if (!newEntryData.hall || !newEntryData.region || !newEntryData.name || !newEntryData.caregiver || !newEntryData.identity) {
              formError.textContent = '請填寫所有必填欄位';
              formError.classList.remove('d-none');
              formError.focus();
              return;
            }

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
                    fetchDataAndUpdateCheckboxes(dateRangeSelect.value, getHallFromURL());
                } else {
                    throw new Error(data.message || '新增失敗');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast(`新增失敗: ${error.message}`, 'danger');
            });
        });
        
        const copyLastBtn = document.getElementById('copy-last');
        if(copyLastBtn) copyLastBtn.addEventListener('click', function() {
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
        if(addEntryModal) addEntryModal.addEventListener('shown.bs.modal', () => {
             const hallSelect = document.getElementById('hall');
             hallSelect.addEventListener('change', (e) => {
                updateRegionOptions(e.target.value);
            });
        });

        fetchAndSetDateRanges();
    }

    initialize();
});