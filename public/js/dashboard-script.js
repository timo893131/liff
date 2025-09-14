document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素 ---
    const viewTypeSelect = document.getElementById('viewTypeSelect');
    const hallRegionFilters = document.getElementById('hallRegionFilters');
    const prayerGroupFilter = document.getElementById('prayerGroupFilter');
    const hallSelect = document.getElementById('hallSelect');
    const regionSelect = document.getElementById('regionSelect');
    const prayerGroupSelect = document.getElementById('prayerGroupSelect');
    const listContainer = document.getElementById('list-container');
    const listTitle = document.getElementById('list-title');
    const listCount = document.getElementById('list-count');

    // --- 資料 ---
    // 從 config.js 複製 PRAYER_GROUPS，避免前端額外請求
    /* const PRAYER_GROUPS = {
        'h3-peace-brothers': { name: 'H3（和平弟兄）' },
        'h3-peace-sisters':  { name: 'H3（和平姊妹）' },
        'h3-new-brothers':   { name: 'H3（新生弟兄）' },
        'h3-new-sisters':    { name: 'H3（新生姊妹）' },
        'h3-english':        { name: 'H3（英語）' },
        'h62-sisters':       { name: 'H62（姊妹）' },
        'h71-brothers':      { name: 'H71（弟兄）' },
        'h71-sisters':       { name: 'H71（姊妹）' },
        'h82-brothers':      { name: 'H82（弟兄）' },
        'h82-sisters':       { name: 'H82（姊妹）' },
        'h103-brothers':     { name: 'H103（弟兄）' },
        'h103-sisters':      { name: 'H103（姊妹）' }
    };
 */
    const PRAYER_GROUPS = window.AppConfig.PRAYER_GROUPS;
    // --- 函式 ---
    function loadNavbar() {
        fetch('navbar.html')
            .then(response => response.text())
            .then(data => {
                document.getElementById('navbar-container').innerHTML = data;
                // 在儀表板頁面隱藏日期和搜尋
                const dateRangeContainer = document.getElementById('date-range-container');
                if (dateRangeContainer) dateRangeContainer.style.display = 'none';
            });
    }

    // 填充活力組選項
    function populatePrayerGroups() {
        for (const key in PRAYER_GROUPS) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = PRAYER_GROUPS[key].name;
            prayerGroupSelect.appendChild(option);
        }
    }

    // 更新小區選項
    async function updateRegionOptions(hallId) {
        regionSelect.innerHTML = '<option value="">-- 所有小區 --</option>';
        try {
            const response = await fetch(`/getRegions?hall=${hallId}`);
            if (!response.ok) return;
            const regions = await response.json();
            regions.forEach(region => {
                const option = document.createElement('option');
                option.value = region;
                option.textContent = region;
                regionSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Failed to fetch regions:", error);
        }
    }

    // 獲取並渲染名單
    async function fetchAndRenderList() {
        const type = viewTypeSelect.value;
        let url = `/api/view-list?type=${type}`;
        
        if (type === 'hall' || type === 'region') {
            const hall = hallSelect.value;
            const region = regionSelect.value;
            url += `&hall=${hall}`;
            if (region) url += `&region=${region}`;
            listTitle.textContent = `${hallSelect.options[hallSelect.selectedIndex].text} ${region ? `/ ${region}` : ''} 名單`;
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
            listContainer.innerHTML = ''; // 清空

            if (data.length === 0) {
                listContainer.innerHTML = `<div class="col-12 text-center p-5"><p class="text-muted">此分類下尚無名單資料。</p></div>`;
                return;
            }

            data.forEach(person => {
                const card = document.createElement('div');
                card.className = 'col-lg-4 col-md-6 mb-4';
                
                // 根據不同類型，卡片內容略有不同
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

    hallSelect.addEventListener('change', () => {
        updateRegionOptions(hallSelect.value);
        fetchAndRenderList();
    });

    regionSelect.addEventListener('change', fetchAndRenderList);
    prayerGroupSelect.addEventListener('change', fetchAndRenderList);

    // --- 初始化 ---
    loadNavbar();
    populatePrayerGroups();
    updateRegionOptions(hallSelect.value); // 載入預設會所的小區
    fetchAndRenderList(); // 載入預設的列表
});