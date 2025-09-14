document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素 ---
    const viewTypeSelect = document.getElementById('viewTypeSelect');
    const hallRegionFilters = document.getElementById('hallRegionFilters');
    const prayerGroupFilter = document.getElementById('prayerGroupFilter');
    const hallSelect = document.getElementById('hallSelect');
    const regionSelect = document.getElementById('regionSelect'); // <ul> 元素
    const regionDropdown = document.getElementById('regionDropdown');
    const prayerGroupSelect = document.getElementById('prayerGroupSelect');
    const listContainer = document.getElementById('list-container');
    const listTitle = document.getElementById('list-title');
    const listCount = document.getElementById('list-count');

    // --- 資料 ---
    const PRAYER_GROUPS = window.AppConfig.PRAYER_GROUPS;

    // --- 函式 ---
    function loadNavbar() {
        fetch('navbar.html')
            .then(response => response.text())
            .then(data => {
                document.getElementById('navbar-container').innerHTML = data;
                const dateRangeContainer = document.getElementById('date-range-container');
                if (dateRangeContainer) dateRangeContainer.style.display = 'none';
            });
    }

    function populatePrayerGroups() {
        for (const key in PRAYER_GROUPS) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = PRAYER_GROUPS[key].name;
            prayerGroupSelect.appendChild(option);
        }
    }

    // ★★★ 核心修正：重構此函式以實現點擊整行勾選 ★★★
    async function updateRegionOptions(hallId) {
        regionSelect.innerHTML = '<li><span class="dropdown-item-text text-muted">載入中...</span></li>';
        try {
            const response = await fetch(`/getRegions?hall=${hallId}`);
            if (!response.ok) throw new Error("Failed to fetch regions");
            const regions = await response.json();
            regionSelect.innerHTML = '';

            if (regions.length === 0) {
                 regionSelect.innerHTML = '<li><span class="dropdown-item-text text-muted">此會所無小區</span></li>';
            } else {
                regions.forEach(region => {
                    const li = document.createElement('li');
                    li.className = 'dropdown-item-checkbox';
                    li.innerHTML = `
                        <input class="form-check-input" type="checkbox" value="${region}" id="region-${region}">
                        <label class="form-check-label flex-grow-1" for="region-${region}">${region}</label>
                    `;
                    
                    // 1. 將事件監聽器綁定到 li 元素
                    li.addEventListener('click', (event) => {
                        // 2. 阻止事件冒泡，保持下拉選單開啟
                        event.stopPropagation();
                        
                        const checkbox = li.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            // 3. 如果點擊的不是 checkbox 本身，就手動反轉其狀態
                            if (event.target !== checkbox) {
                                checkbox.checked = !checkbox.checked;
                            }
                            // 4. 觸發列表刷新
                            fetchAndRenderList();
                        }
                    });

                    regionSelect.appendChild(li);
                });
            }
        } catch (error) {
            console.error(error);
            regionSelect.innerHTML = '<li><span class="dropdown-item-text text-danger">載入失敗</span></li>';
        }
    }

    async function fetchAndRenderList() {
        const type = viewTypeSelect.value;
        let url = `/api/view-list?type=${type}`;
        
        if (type === 'hall' || type === 'region') {
            const hall = hallSelect.value;
            const selectedRegions = Array.from(regionSelect.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
            
            let titleRegionText = '-- 所有小區 --';
            
            if (selectedRegions.length > 0) {
                // 如果有選擇小區，設定 type=region 和 regions 參數
                url = `/api/view-list?type=region&hall=${hall}&regions=${selectedRegions.join(',')}`;
                titleRegionText = selectedRegions.length > 2 ? `已選 ${selectedRegions.length} 個小區` : selectedRegions.join(', ');
            } else {
                // 如果沒有選擇小區，則請求整個會所
                url = `/api/view-list?type=hall&hall=${hall}`;
            }

            regionDropdown.textContent = titleRegionText;
            listTitle.textContent = `${hallSelect.options[hallSelect.selectedIndex].text} / ${titleRegionText}`;

        } else if (type === 'prayer_group') {
            const group = prayerGroupSelect.value;
            url += `&group=${group}`;
            listTitle.textContent = `${prayerGroupSelect.options[prayerGroupSelect.selectedIndex].text} 名單`;
        }
        
        listContainer.innerHTML = `<div class="col-12 text-center p-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('無法載入名單');
            const data = await response.json();
            
            listCount.textContent = `共 ${data.length} 位`;
            listContainer.innerHTML = '';

            if (data.length === 0) {
                listContainer.innerHTML = `<div class="col-12 text-center p-5"><p class="text-muted">此分類下尚無名單資料。</p></div>`;
                return;
            }

            data.forEach(person => {
                const card = document.createElement('div');
                card.className = 'col-lg-4 col-md-6 mb-4';
                
                let cardBody = `
                    <h5 class="card-title">${person.name}</h5>
                    <p class="card-text mb-1"><small class="text-muted">${person.department || ''}</small></p>
                `;
                if(person.caregiver){
                    cardBody += `<p class="card-text"><span class="badge bg-primary">${person.caregiver}</span></p>`;
                }
                
                card.innerHTML = `
                    <div class="card h-100 shadow-sm">
                        <div class="card-body">
                            ${cardBody}
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            });
        } catch (error) {
            console.error(error);
            listContainer.innerHTML = `<div class="col-12 text-center p-5"><p class="text-danger">載入失敗，請稍後再試。</p></div>`;
        }
    }

    // --- 事件監聽 ---
    viewTypeSelect.addEventListener('change', () => {
        const isHallView = viewTypeSelect.value === 'hall';
        hallRegionFilters.style.display = isHallView ? 'flex' : 'none';
        prayerGroupFilter.style.display = isHallView ? 'none' : 'block';
        fetchAndRenderList();
    });

    hallSelect.addEventListener('change', async () => {
        await updateRegionOptions(hallSelect.value);
        fetchAndRenderList();
    });

    // 移除舊的 regionSelect 監聽器，因為邏輯已移至 li 元素上

    prayerGroupSelect.addEventListener('change', fetchAndRenderList);

    // --- 初始化 ---
    loadNavbar();
    populatePrayerGroups();
    updateRegionOptions(hallSelect.value).then(() => {
        fetchAndRenderList();
    });
});