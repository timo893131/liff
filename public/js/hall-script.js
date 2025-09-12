// public/js/hall-script.js (Final Polished Version)

// --- Global Variables ---
let formData = {};
let nameToRowIndexMap = {};
let lastFormData = null;
const options = ['有主日(早上)', '聖經講座(晚上)', '有小排', '家聚會(讀經)', '家聚會(讀其他、福音餐廳)', '有聯絡有回應', '有聯絡未回應'];

// --- DOM Elements ---
const toastEl = document.getElementById('submit-toast');
const toast = new bootstrap.Toast(toastEl);
const mainButton = document.getElementById('main-floating-button');
const subButtons = document.getElementById('sub-buttons');
let isSubButtonsVisible = false;
let dateRanges = [];

// --- Core Functions ---

// Fetch and set date ranges from the backend
async function fetchAndSetDateRanges() {
    try {
        const response = await fetch('/getDateRanges');
        if (!response.ok) throw new Error('Cannot fetch date ranges');
        const data = await response.json();
        dateRanges = data.dateRanges || [];

        const dateRangeSelect = document.getElementById('date-range');
        if (dateRangeSelect) {
            populateDateRangeSelect(dateRangeSelect);
            setDefaultDate(dateRangeSelect);
        }
    } catch (error) {
        console.error('Error fetching date ranges:', error);
        showToast('Could not load date ranges, please check the server', 'danger');
    }
}

// Populate the date dropdown
function populateDateRangeSelect(selectElement) {
    selectElement.innerHTML = '<option value="" disabled>Please select a date range</option>';
    if (dateRanges.length > 0) {
        dateRanges.forEach((date) => {
            const option = document.createElement('option');
            option.value = date.code;
            option.textContent = date.range;
            selectElement.appendChild(option);
        });
    } else {
        selectElement.innerHTML = '<option value="">No dates available</option>';
    }
}

// Set the default date based on the current date
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
    fetchDataAndUpdateCheckboxes(defaultCode, getHallFromTitle());
}

// Format date range display from a date code
function formatDateRange(dateCode) {
    const found = dateRanges.find(r => r.code === dateCode);
    return found ? found.range : 'Loading...';
}

// Load the navbar and bind its events
function loadNavbar() {
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('navbar-container').innerHTML = data;
            document.getElementById('date-range').addEventListener('change', function() {
                if(this.value) {
                    const hall = getHallFromTitle();
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
        })
        .catch(error => console.error('Error loading navbar:', error));
}


// (The functions from updateRegionOptions down to collectGroupData are unchanged)
async function updateRegionOptions(hallId) {
    const regionSelect = document.getElementById('region');
    regionSelect.innerHTML = '<option value="">Loading...</option>';
    try {
        const response = await fetch(`/getRegions?hall=${hallId}`);
        if (!response.ok) {
            throw new Error('Could not fetch community data');
        }
        const regions = await response.json();
        regionSelect.innerHTML = '<option value="" disabled selected>Select community</option>';
        if (regions.length > 0) {
            regions.forEach(region => {
                const option = document.createElement('option');
                option.value = region;
                option.textContent = region;
                regionSelect.appendChild(option);
            });
        } else {
            regionSelect.innerHTML = '<option value="">No community data for this hall</option>';
        }
    } catch (error) {
        console.error('Error fetching regions:', error);
        regionSelect.innerHTML = '<option value="">Load failed</option>';
    }
}

function getHallFromTitle() {
    return document.title.toLowerCase();
}

function fetchDataAndUpdateCheckboxes(selectedDate, hall, highlightGroup = null) {
    fetch(`/getData?selectedDate=${selectedDate}&hall=${hall}`)
        .then(response => response.json())
        .then(data => {
            formData = data.groupedData;
            nameToRowIndexMap = data.nameToRowIndexMap;
            document.getElementById('current-date').textContent = formatDateRange(selectedDate);
            renderCaregiverData(formData, options, highlightGroup);
        })
        .catch(err => {
            console.error('Error fetching data:', err);
            showToast('Error fetching data, please try again later', 'danger');
        });
}

function renderCaregiverData(formData, options, highlightGroup = null) {
    const checkboxContainer = document.querySelector('#checkbox-container');
    checkboxContainer.innerHTML = '';
    for (let caregiver in formData) {
        const caregiverDiv = document.createElement('div');
        caregiverDiv.classList.add('caregiver-group');
        caregiverDiv.innerHTML = `<h3>${caregiver}:</h3>`;
        formData[caregiver].forEach(person => {
            const checkboxWrapper = createCheckboxWrapper(caregiver, person, options);
            caregiverDiv.appendChild(checkboxWrapper);
        });

        const submitButton = document.createElement('button');
        submitButton.classList.add('btn', 'submit-group-btn');
        submitButton.innerHTML = '<span>✔</span> Submit';
        submitButton.addEventListener('click', (event) => submitGroupChanges(caregiver, event.target));
        caregiverDiv.appendChild(submitButton);

        checkboxContainer.appendChild(caregiverDiv);

        if (highlightGroup === caregiver) {
            caregiverDiv.classList.add('highlight');
            setTimeout(() => caregiverDiv.classList.remove('highlight'), 2000);
        }
    }
}

function createCheckboxWrapper(caregiver, person, options) {
    const sliderWrapper = document.createElement('div');
    sliderWrapper.classList.add('slider-wrapper');
    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.classList.add('checkbox-wrapper');
    checkboxWrapper.innerHTML = `<h4>${person.name}</h4>`;
    const deleteArea = document.createElement('div');
    deleteArea.classList.add('delete-area');
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('btn', 'btn-danger', 'btn-sm', 'delete-btn');
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('data-caregiver', caregiver);
    deleteBtn.setAttribute('data-name', person.name);
    deleteArea.appendChild(deleteBtn);
    sliderWrapper.appendChild(checkboxWrapper);
    sliderWrapper.appendChild(deleteArea);
    options.forEach(option => {
        const checkboxItem = document.createElement('div');
        checkboxItem.classList.add('checkbox-item');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `${caregiver}-${person.name}-${option}`;
        checkbox.checked = person.attendance && person.attendance.includes(option);
        const label = document.createElement('label');
        label.setAttribute('for', checkbox.id);
        label.textContent = option;
        checkboxItem.appendChild(checkbox);
        checkboxItem.appendChild(label);
        checkboxWrapper.appendChild(checkboxItem);
    });

    if (window.innerWidth <= 600) {
        let touchStartX = 0, currentTranslateX = 0, isSwiping = false;
        // ★ UPDATE ★: Added opacity transition for a smoother effect.
        deleteArea.style.opacity = '0';
        deleteArea.style.transition = 'opacity 0.3s ease';

        sliderWrapper.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                isSwiping = false;
                checkboxWrapper.style.transition = 'none';
                const match = (checkboxWrapper.style.transform || '').match(/translateX\(([-0-9]+)px\)/);
                currentTranslateX = match ? parseInt(match[1], 10) : 0;
            }
        });
        sliderWrapper.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                const deltaX = e.touches[0].clientX - touchStartX;
                if (Math.abs(deltaX) > 10) {
                    isSwiping = true;
                    let translateX = Math.min(0, Math.max(-100, currentTranslateX + deltaX));
                    checkboxWrapper.style.transform = `translateX(${translateX}px)`;
                    deleteArea.style.display = 'flex';
                    // ★ UPDATE ★: Fade in the delete area as the user swipes.
                    deleteArea.style.opacity = `${Math.abs(translateX) / 100}`;
                }
            }
        });
        sliderWrapper.addEventListener('touchend', () => {
            if (isSwiping) {
                const match = (checkboxWrapper.style.transform || '').match(/translateX\(([-0-9]+)px\)/);
                const translateX = match ? parseInt(match[1], 10) : 0;
                checkboxWrapper.style.transition = 'transform 0.3s ease-out';
                if (translateX <= -40) { // Threshold to snap open
                    checkboxWrapper.style.transform = 'translateX(-100px)';
                    deleteArea.style.opacity = '1';
                } else {
                    checkboxWrapper.style.transform = 'translateX(0)';
                    deleteArea.style.opacity = '0';
                    setTimeout(() => (deleteArea.style.display = 'none'), 300);
                }
            }
        });
    }

    deleteBtn.addEventListener('click', () => deletePerson(caregiver, person.name));
    return sliderWrapper;
}

function deletePerson(caregiver, name) {
    if (confirm(`Are you sure you want to delete the record for ${name}?`)) {
        const hall = getHallFromTitle();
        fetch('/deleteData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hall, caregiver, name }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === 'Data deleted successfully') {
                    showToast(`Record for ${name} has been deleted`, 'success');
                    fetchDataAndUpdateCheckboxes(document.getElementById('date-range').value, hall);
                } else {
                    showToast('Delete failed, please try again', 'danger');
                }
            })
            .catch(error => {
                console.error('Error deleting data:', error);
                showToast('Delete failed, please try again', 'danger');
            });
    }
}

function submitGroupChanges(caregiver, button) {
    const updatedData = { [caregiver]: collectGroupData(caregiver) };
    const selectedDate = document.getElementById('date-range').value;
    const hall = getHallFromTitle();

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';

    fetch('/updateData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updatedData, hall, selectedDate, nameToRowIndexMap })
        })
        .then(response => response.json())
        .then(data => {
            showToast(`${caregiver}'s changes submitted successfully`, 'success');
            fetchDataAndUpdateCheckboxes(selectedDate, hall, caregiver);
        })
        .catch(error => {
            console.error('Submit failed:', error);
            showToast(`${caregiver}'s changes failed to submit`, 'danger');
        })
        .finally(() => {
            button.disabled = false;
            button.innerHTML = '<span>✔</span> Submit';
        });
}

function collectGroupData(caregiver) {
    return formData[caregiver].map(person => ({
        name: person.name,
        selectedOptions: options.filter(option => document.getElementById(`${caregiver}-${person.name}-${option}`).checked)
    }));
}


// Filter caregiver data based on search input
function filterCaregiverData(searchTerm) {
    const checkboxContainer = document.querySelector('#checkbox-container');
    checkboxContainer.innerHTML = '';
    let matchCount = 0;
    for (let caregiver in formData) {
        if (caregiver.toLowerCase().includes(searchTerm)) {
            matchCount++;
            const caregiverDiv = document.createElement('div');
            caregiverDiv.classList.add('caregiver-group');
            caregiverDiv.innerHTML = `<h3>${caregiver.replace(new RegExp(searchTerm, 'gi'), match => `<span class="search-highlight">${match}</span>`)}:</h3>`;
            formData[caregiver].forEach(person => {
                caregiverDiv.appendChild(createCheckboxWrapper(caregiver, person, options));
            });
            const submitButton = document.createElement('button');
            submitButton.classList.add('btn', 'submit-group-btn');
            submitButton.innerHTML = '<span>✔</span> Submit';
            submitButton.addEventListener('click', (event) => submitGroupChanges(caregiver, event.target));
            caregiverDiv.appendChild(submitButton);
            checkboxContainer.appendChild(caregiverDiv);
        }
    }
    const resultInfo = document.createElement('p');
    resultInfo.textContent = searchTerm ? `Found ${matchCount} matches` : 'Showing all data';
    resultInfo.style.color = '#6c757d';
    checkboxContainer.insertBefore(resultInfo, checkboxContainer.firstChild);
}

// Show a toast notification
function showToast(message, type) {
    const toastBody = toastEl.querySelector('.toast-body');
    toastBody.textContent = message;
    toastEl.className = 'toast'; // Reset classes
    toastEl.classList.add(`text-bg-${type}`);
    toast.show();
}

// Fetch and render statistics
function fetchStats(selectedDate, hall) {
    fetch(`/getStats?selectedDate=${selectedDate}&hall=${hall}`)
        .then(response => response.json())
        .then(data => {
            renderStats(data);
            document.getElementById('stats-container').style.display = 'block';
            document.getElementById('checkbox-container').style.display = 'none';
            document.getElementById('current-date').textContent = formatDateRange(selectedDate);
        })
        .catch(err => {
            console.error('Error fetching stats:', err);
            showToast('Error fetching stats, please try again', 'danger');
        });
}

// Render the statistics table
function renderStats(stats) {
    const statsBody = document.getElementById('stats-body');
    statsBody.innerHTML = '';
    for (const category in stats) {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${category}</td><td>${stats[category]}</td>`;
        statsBody.appendChild(row);
    }
}

// Hide the sub-buttons of the floating action button
function hideSubButtons() {
    subButtons.style.display = 'none';
    mainButton.style.display = 'flex';
    isSubButtonsVisible = false;
}

// Initialize the page
function initializeHallPage() {
    // Bind event listeners to static elements
    mainButton.addEventListener('click', (e) => {
        e.stopPropagation();
        isSubButtonsVisible = !isSubButtonsVisible;
        subButtons.style.display = isSubButtonsVisible ? 'flex' : 'none';
        mainButton.style.display = isSubButtonsVisible ? 'none' : 'flex';
    });

    document.getElementById('add-entry-button').addEventListener('click', (e) => {
        e.stopPropagation();
        const modal = new bootstrap.Modal(document.getElementById('addEntryModal'));
        document.getElementById('addEntryForm').reset();
        document.getElementById('hall').value = getHallFromTitle();
        modal.show();
        hideSubButtons();
    });

    document.getElementById('stats-button').addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedDate = document.getElementById('date-range').value;
        const hall = getHallFromTitle();
        fetchStats(selectedDate, hall);
        hideSubButtons();
    });

    document.getElementById('back-to-list').addEventListener('click', () => {
        const selectedDate = document.getElementById('date-range').value;
        const hall = getHallFromTitle();
        fetchDataAndUpdateCheckboxes(selectedDate, hall);
        document.getElementById('stats-container').style.display = 'none';
        document.getElementById('checkbox-container').style.display = 'block';
    });

    document.addEventListener('click', (e) => {
        if (isSubButtonsVisible && !subButtons.contains(e.target) && e.target !== mainButton) {
            hideSubButtons();
        }
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
      })
      .then(response => response.json())
      .then(data => {
        if (data.message === 'Data added successfully') {
            showToast('New entry added successfully', 'success');
            bootstrap.Modal.getInstance(document.getElementById('addEntryModal')).hide();
            fetchDataAndUpdateCheckboxes(document.getElementById('date-range').value, getHallFromTitle());
        } else {
            throw new Error(data.message || 'Failed to add new entry');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        showToast('Failed to add entry, please try again', 'danger');
      });
    });

    document.getElementById('copy-last').addEventListener('click', function() {
        if (lastFormData) {
            document.getElementById('hall').value = lastFormData.hall;
            document.getElementById('caregiver').value = lastFormData.caregiver;
            document.getElementById('region').value = lastFormData.region;
            document.getElementById('identity').value = lastFormData.identity;
            // ★ UPDATE ★: Do not copy the name and department for better UX.
            document.getElementById('name').value = '';
            document.getElementById('department').value = '';
        }
    });

    document.getElementById('addEntryModal').addEventListener('shown.bs.modal', () => {
        const hallSelect = document.getElementById('hall');
        const currentHall = getHallFromTitle();
        hallSelect.value = currentHall;
        updateRegionOptions(currentHall);
        hallSelect.addEventListener('change', (e) => {
            updateRegionOptions(e.target.value);
        });
    });

    // Initial load
    loadNavbar();
}

// Run initialization once the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeHallPage);