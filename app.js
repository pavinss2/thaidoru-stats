// Global variables to store dataset state
let idolsList = [];
let historyData = [];
let growthChart = null;

// Filter and state tracking
let activeView = "group"; // "group" or "member"
let searchQuery = "";

// Directory Sorters & Filters (Relocated under the graph)
let filterGroup = "all";
let filterColor = "all";
let sortSelect = "name";

// Chart Controls (Top of the graph)
let startDate = "";
let endDate = "";
let chartPlatform = "instagram"; // Plotted SNS platform
let chartType = "bar"; // Plotted chart view type ("line" or "bar")

// Multi-selection comparative tracking
let selectedIdols = []; // Array of selected member/group names

// Color resolution helper for professional, eye-friendly pastel colors
const colorMap = {
    red: "#FF6B6B",
    blue: "#5C9CFF",
    yellow: "#FFD93D",
    green: "#6BCB77",
    pink: "#FF85B3",
    purple: "#A28BFE",
    orange: "#FFB347",
    black: "#35353A",
    white: "#E1E1E6"
};

function resolveColor(colorName) {
    if (!colorName) return "#FFFFFF";
    return colorMap[colorName.toLowerCase()] || colorName;
}

// Generate truncated colored HTML names list for subtitle tracking
function getColoredNamesString(list) {
    if (list.length === 0) return "";
    
    const maxShow = 10;
    const itemsToShow = list.slice(0, maxShow);
    
    const mapped = itemsToShow.map(name => {
        const config = idolsList.find(i => i.name.toLowerCase() === name.toLowerCase());
        const color = resolveColor(config?.color);
        return `<span style="color: ${color}; text-shadow: 0 0 8px color-mix(in srgb, ${color} 30%, transparent);">${name}</span>`;
    });
    
    let result = mapped.join(", ");
    if (list.length > maxShow) {
        result += ` and ${list.length - maxShow} more..`;
    }
    return result;
}

// ==========================================
// Initialization & Data Fetching
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide icons
    lucide.createIcons();
    
    // Fetch configuration and follower datasets
    Promise.all([
        fetch("idols.json?_t=" + Date.now()).then(res => res.json()),
        fetch("/api/stats?_t=" + Date.now())
            .then(res => {
                if (!res.ok) throw new Error("API not available");
                return res.json();
            })
            .catch(() => {
                // Fallback to static CSV parsing for local testing environments
                return fetch("follower_history.csv?_t=" + Date.now())
                    .then(res => res.text())
                    .then(csvText => parseCSV(csvText));
            })
    ])
    .then(([idols, parsedData]) => {
        idolsList = idols;
        historyData = parsedData;
        
        // Display the latest scrape update timestamp (stored in UTC+7 by scraper)
        if (historyData.length > 0) {
            const sortedHistory = [...historyData].sort((a, b) => {
                const dateComp = a.Date.localeCompare(b.Date);
                if (dateComp !== 0) return dateComp;
                return (a.Timestamp || "").localeCompare(b.Timestamp || "");
            });
            const latest = sortedHistory[sortedHistory.length - 1];
            const timeStr = latest.Timestamp ? ` @ ${latest.Timestamp.slice(0, 5)} (UTC+7)` : "";
            document.getElementById("last-updated").innerText = `Last Update: ${latest.Date}${timeStr}`;
        }
        
        // Initial setup and render
        calculateGlobalStats();
        
        // Pre-select all groups on initial load so cards glow and Clear Selection is active
        const groups = idolsList.filter(i => i.type === "group");
        selectedIdols = groups.map(g => g.name);
        
        setupFilters();
        populateDateFilters();
        filterAndRender();
        renderGrowthChart();
    })
    .catch(err => {
        console.error("Error loading dashboard data:", err);
    });
});

// Simple CSV parser helper
function parseCSV(text) {
    const lines = text.trim().split("\n");
    if (lines.length <= 1) return [];
    const headers = lines[0].split(",").map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim());
        const row = {};
        headers.forEach((header, idx) => {
            row[header] = values[idx] || "";
        });
        return row;
    });
}

// ==========================================
// Calculations & Stat Updates
// ==========================================
function calculateGlobalStats() {
    // Stats widgets removed from top header
}

function getLatestStats(idolName) {
    const idolRecords = historyData.filter(r => r.Idol_Name.toLowerCase() === idolName.toLowerCase());
    const stats = { Instagram: 0, X: 0, Facebook: 0, TikTok: 0 };
    if (idolRecords.length === 0) {
        return stats;
    }
    
    const platforms = ["Instagram", "X", "Facebook", "TikTok"];
    platforms.forEach(platform => {
        const platformRecords = idolRecords.filter(r => r.Platform.toLowerCase() === platform.toLowerCase());
        
        // Sort oldest to newest
        platformRecords.sort((a, b) => {
            const dateComp = a.Date.localeCompare(b.Date);
            if (dateComp !== 0) return dateComp;
            return (a.Timestamp || "").localeCompare(b.Timestamp || "");
        });
        
        // Traverse backwards to find the first non-zero count
        let count = 0;
        for (let i = platformRecords.length - 1; i >= 0; i--) {
            const val = parseInt(platformRecords[i].Follower_Count || 0, 10);
            if (val > 0) {
                count = val;
                break;
            }
        }
        stats[platform] = count;
    });
    
    return stats;
}

// Populate Start and End Date range dropdowns dynamically
function populateDateFilters() {
    const dates = [...new Set(historyData.map(r => r.Date))].sort();
    if (dates.length === 0) return;
    
    const startSelect = document.getElementById("start-date-select");
    const endSelect = document.getElementById("end-date-select");
    
    startSelect.innerHTML = "";
    endSelect.innerHTML = "";
    
    dates.forEach(date => {
        const optStart = document.createElement("option");
        optStart.value = date;
        optStart.innerText = date;
        startSelect.appendChild(optStart);
        
        const optEnd = document.createElement("option");
        optEnd.value = date;
        optEnd.innerText = date;
        endSelect.appendChild(optEnd);
    });
    
    // Set default range: All history
    startSelect.value = dates[0];
    endSelect.value = dates[dates.length - 1];
    
    startDate = dates[0];
    endDate = dates[dates.length - 1];
    
    // Bind change listeners to slice chart
    startSelect.addEventListener("change", (e) => {
        startDate = e.target.value;
        if (dates.indexOf(startDate) > dates.indexOf(endDate)) {
            endDate = startDate;
            endSelect.value = endDate;
        }
        renderGrowthChart();
    });
    
    endSelect.addEventListener("change", (e) => {
        endDate = e.target.value;
        if (dates.indexOf(endDate) < dates.indexOf(startDate)) {
            startDate = endDate;
            startSelect.value = startDate;
        }
        renderGrowthChart();
    });
}

// ==========================================
// User Interaction & Filter Bindings
// ==========================================
function setupFilters() {
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        filterAndRender();
    });
    
    // View Mode Tabs Toggles
    const pills = document.querySelectorAll(".filter-pill");
    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            activeView = pill.getAttribute("data-view");
            
            if (activeView === "group") {
                const groupsList = idolsList.filter(i => i.type === "group");
                selectedIdols = groupsList.map(g => g.name);
            } else {
                const membersList = idolsList.filter(i => i.type === "member");
                const activeMembers = membersList.filter(m => {
                    if (filterGroup !== "all" && m.group !== filterGroup) return false;
                    if (filterColor !== "all" && m.color !== filterColor) return false;
                    return true;
                });
                const platformMapping = {
                    instagram: "Instagram",
                    x: "X",
                    facebook: "Facebook",
                    tiktok: "TikTok",
                    all: "Instagram"
                };
                const activeSns = platformMapping[chartPlatform] || "Instagram";
                activeMembers.forEach(m => m.latestStats = getLatestStats(m.name));
                activeMembers.sort((a, b) => b.latestStats[activeSns] - a.latestStats[activeSns]);
                const top10 = activeMembers.slice(0, 10);
                selectedIdols = top10.map(m => m.name);
            }
            
            // Reset color filter action when toggling view tabs
            filterColor = "all";
            const colorFilterSelect = document.getElementById("color-filter-select");
            if (colorFilterSelect) {
                colorFilterSelect.value = "all";
            }
            
            filterAndRender();
            renderGrowthChart();
        });
    });
    
    // Directory Group Filter Change (Synchronized across Member and Group tabs)
    const groupFilter = document.getElementById("group-filter-select");
    const groupFilterGroupTab = document.getElementById("group-filter-select-group-tab");
    
    function updateGroupFilter(val) {
        filterGroup = val;
        if (groupFilter) groupFilter.value = val;
        if (groupFilterGroupTab) groupFilterGroupTab.value = val;
        filterAndRender();
        renderGrowthChart();
    }
    
    if (groupFilter) {
        groupFilter.addEventListener("change", (e) => {
            updateGroupFilter(e.target.value);
        });
    }
    
    if (groupFilterGroupTab) {
        groupFilterGroupTab.addEventListener("change", (e) => {
            updateGroupFilter(e.target.value);
        });
    }
    
    // Directory Color Filter Change
    const colorFilter = document.getElementById("color-filter-select");
    colorFilter.addEventListener("change", (e) => {
        filterColor = e.target.value;
        filterAndRender();
        renderGrowthChart();
    });
    
    // Directory Sort Change (Decoupled from Graph)
    const sortSelectElement = document.getElementById("sort-select");
    sortSelectElement.addEventListener("change", (e) => {
        sortSelect = e.target.value;
        filterAndRender(); // Only affects the list sorting at the bottom
    });
    
    // Chart Platform Filter Change (Relocated in the graph header panel)
    const platformButtons = document.querySelectorAll("#platform-filter-row .platform-icon-btn");
    platformButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            platformButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            chartPlatform = btn.getAttribute("data-platform");
            
            // Sync Chart header text
            const chartHeaderHeading = document.querySelector(".chart-header h2");
            if (chartHeaderHeading) {
                const platformDisplayName = chartPlatform === "x" ? "X" : chartPlatform.charAt(0).toUpperCase() + chartPlatform.slice(1);
                const titleWord = chartType === "line" ? "Trend" : "Standings";
                chartHeaderHeading.innerHTML = `<i data-lucide="trending-up"></i> ${titleWord} (${platformDisplayName})`;
                if (window.lucide) window.lucide.createIcons();
            }
            
            renderGrowthChart();
        });
    });

    // Initialize Global Autocomplete Search
    initSearchAutocomplete();

    // Chart Type (Line / Bar) Toggle
    const typeButtons = document.querySelectorAll("#chart-type-toggle .toggle-btn");
    typeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            typeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            chartType = btn.getAttribute("data-type");
            
            const startWrapper = document.getElementById("start-date-wrapper");
            const endWrapper = document.getElementById("end-date-wrapper");
            if (startWrapper && endWrapper) {
                if (chartType === "bar") {
                    startWrapper.style.opacity = "0.3";
                    startWrapper.style.pointerEvents = "none";
                    endWrapper.style.opacity = "0.3";
                    endWrapper.style.pointerEvents = "none";
                } else {
                    startWrapper.style.opacity = "1";
                    startWrapper.style.pointerEvents = "auto";
                    endWrapper.style.opacity = "1";
                    endWrapper.style.pointerEvents = "auto";
                }
            }
            renderGrowthChart();
        });
    });

    // Select Top 10 Button Click
    const selectTop10Btn = document.getElementById("select-top-10-btn");
    if (selectTop10Btn) {
        selectTop10Btn.addEventListener("click", () => {
            const membersList = idolsList.filter(i => i.type === "member");
            const activeMembers = membersList.filter(m => {
                if (filterGroup !== "all" && m.group !== filterGroup) return false;
                if (filterColor !== "all" && m.color !== filterColor) return false;
                return true;
            });
            
            const platformMapping = {
                instagram: "Instagram",
                x: "X",
                facebook: "Facebook",
                tiktok: "TikTok",
                all: "Instagram"
            };
            const activeSns = platformMapping[chartPlatform] || "Instagram";
            activeMembers.forEach(m => m.latestStats = getLatestStats(m.name));
            activeMembers.sort((a, b) => b.latestStats[activeSns] - a.latestStats[activeSns]);
            const top10 = activeMembers.slice(0, 10);
            
            selectedIdols = top10.map(m => m.name);
            filterAndRender();
            renderGrowthChart();
        });
    }

    // Select All Button Click
    const selectAllBtn = document.getElementById("select-all-btn");
    selectAllBtn.addEventListener("click", () => {
        let itemsToSelect = [];
        if (activeView === "group") {
            const groupsList = idolsList.filter(i => i.type === "group");
            itemsToSelect = groupsList.filter(group => {
                if (searchQuery && !group.name.toLowerCase().includes(searchQuery)) return false;
                if (filterGroup !== "all" && group.group !== filterGroup) return false;
                if (filterColor !== "all" && group.color !== filterColor) return false;
                return true;
            });
        } else {
            const membersList = idolsList.filter(i => i.type === "member");
            itemsToSelect = membersList.filter(member => {
                if (searchQuery && !member.name.toLowerCase().includes(searchQuery) && !member.group.toLowerCase().includes(searchQuery)) return false;
                if (filterGroup !== "all" && member.group !== filterGroup) return false;
                if (filterColor !== "all" && member.color !== filterColor) return false;
                return true;
            });
        }
        
        selectedIdols = itemsToSelect.map(item => item.name);
        filterAndRender();
        renderGrowthChart();
    });

    // Clear Selection Button Click
    const clearBtn = document.getElementById("clear-selection-btn");
    clearBtn.addEventListener("click", () => {
        selectedIdols = [];
        filterAndRender();
        renderGrowthChart();
    });

    // Group Tab Select All Button Click
    const groupSelectAllBtn = document.getElementById("group-select-all-btn");
    if (groupSelectAllBtn) {
        groupSelectAllBtn.addEventListener("click", () => {
            const groupsList = idolsList.filter(i => i.type === "group");
            selectedIdols = groupsList.map(g => g.name);
            filterAndRender();
            renderGrowthChart();
        });
    }

    // Group Tab Clear Selection Button Click
    const groupClearBtn = document.getElementById("group-clear-selection-btn");
    if (groupClearBtn) {
        groupClearBtn.addEventListener("click", () => {
            selectedIdols = [];
            filterAndRender();
            renderGrowthChart();
        });
    }
}

function renderCard(idol, container) {
    const card = document.createElement("div");
    card.classList.add("member-card");
    card.setAttribute("data-name", idol.name); // Search index target
    if (selectedIdols.includes(idol.name)) {
        card.classList.add("selected");
    }
    
    // Glow border colors are forced to white. Dot maps to member-color.
    card.style.setProperty("--card-glow-color", "#FFFFFF");
    if (idol.color) {
        card.style.setProperty("--member-color", resolveColor(idol.color));
    }
    
    const initials = idol.name.slice(0, 2).toUpperCase();
    const isGroup = idol.type === "group";
    const avatarStyle = idol.x_avatar_url ? `style="background-image: url('${idol.x_avatar_url}'); background-size: cover; background-position: center;"` : '';
    
    // Formulate platform URL redirects
    const igUrl = idol.instagram_handle ? (idol.instagram_handle.startsWith('http') ? idol.instagram_handle : `https://www.instagram.com/${idol.instagram_handle}/`) : '#';
    const xUrl = idol.x_handle ? (idol.x_handle.startsWith('http') ? idol.x_handle : `https://x.com/${idol.x_handle}`) : '#';
    const fbUrl = idol.facebook_page ? (idol.facebook_page.startsWith('http') ? idol.facebook_page : `https://www.facebook.com/${idol.facebook_page}`) : '#';
    const ttUrl = idol.tiktok_handle ? (idol.tiktok_handle.startsWith('http') ? idol.tiktok_handle : `https://www.tiktok.com/@${idol.tiktok_handle}`) : '#';
    
    card.innerHTML = `
        <div class="card-top">
            <a href="profile.html?name=${encodeURIComponent(idol.name)}" class="avatar-link" onclick="event.preventDefault(); event.stopPropagation(); showPopupAtElement('${idol.name}', this);" title="View details for ${idol.name}">
                <div class="member-avatar" ${avatarStyle}>${idol.x_avatar_url ? '' : initials}</div>
            </a>
            <div class="member-meta">
                <span class="member-name">
                    ${idol.name}
                    ${idol.color ? '<span class="color-dot"></span>' : ''}
                </span>
                <span class="member-tagline">
                    ${isGroup ? '<span class="badge-official">Official Channel</span>' : `<span class="group-badge">${idol.group}</span>`}
                </span>
            </div>
        </div>
        
        <div class="card-platforms">
            <a href="${igUrl}" target="_blank" class="platform-metric" ${idol.instagram_handle ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                <span class="platform-name instagram-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-instagram" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"></path></svg></span>
                <span class="platform-val">${idol.latestStats.Instagram.toLocaleString()}</span>
            </a>
            <a href="${xUrl}" target="_blank" class="platform-metric" ${idol.x_handle ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                <span class="platform-name x-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-x-twitter-square" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm297.1 84L257.3 234.6 379.4 396H283.8L209 298.1 123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5L313.6 116h47.5zM323.3 367.6L153.4 142.9H125.1L296.9 367.6h26.3z"></path></svg></span>
                <span class="platform-val">${idol.latestStats.X.toLocaleString()}</span>
            </a>
            <a href="${fbUrl}" target="_blank" class="platform-metric" ${idol.facebook_page ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                <span class="platform-name facebook-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-facebook" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z"></path></svg></span>
                <span class="platform-val">${idol.latestStats.Facebook.toLocaleString()}</span>
            </a>
            <a href="${ttUrl}" target="_blank" class="platform-metric" ${idol.tiktok_handle ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                <span class="platform-name tiktok-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-tiktok" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z"></path></svg></span>
                <span class="platform-val">${idol.latestStats.TikTok.toLocaleString()}</span>
            </a>
        </div>
    `;
    
    // Bind selection event ONLY to card-top clicks
    const cardTop = card.querySelector(".card-top");
    cardTop.addEventListener("click", () => {
        const idx = selectedIdols.indexOf(idol.name);
        if (idx > -1) {
            selectedIdols.splice(idx, 1);
            card.classList.remove("selected");
        } else {
            selectedIdols.push(idol.name);
            card.classList.add("selected");
        }
        renderGrowthChart();
    });
    
    container.appendChild(card);
}

function filterAndRender() {
    const groupCardsContainer = document.getElementById("group-cards-container");
    const cardsContainer = document.getElementById("cards-container");
    const groupSection = document.getElementById("group-section");
    const membersSection = document.getElementById("members-section");
    
    groupCardsContainer.innerHTML = "";
    cardsContainer.innerHTML = "";
    
    const groupsList = idolsList.filter(i => i.type === "group");
    const membersList = idolsList.filter(i => i.type === "member");
    
    if (activeView === "group") {
        groupSection.style.display = "block";
        membersSection.style.display = "none";
        
        let filteredGroups = groupsList.filter(group => {
            if (searchQuery && !group.name.toLowerCase().includes(searchQuery)) return false;
            if (filterGroup !== "all" && group.group !== filterGroup) return false;
            if (filterColor !== "all" && group.color !== filterColor) return false;
            return true;
        });
        
        filteredGroups.forEach(g => g.latestStats = getLatestStats(g.name));
        
        // Sort Groups by their original declaration order in idols.json
        const orderMap = new Map(idolsList.map((item, index) => [item.name.toLowerCase(), index]));
        filteredGroups.sort((a, b) => orderMap.get(a.name.toLowerCase()) - orderMap.get(b.name.toLowerCase()));
        
        filteredGroups.forEach(group => renderCard(group, groupCardsContainer));
        
    } else {
        groupSection.style.display = "none";
        membersSection.style.display = "block";
        
        let filteredMembers = membersList.filter(member => {
            if (searchQuery && !member.name.toLowerCase().includes(searchQuery) && !member.group.toLowerCase().includes(searchQuery)) return false;
            if (filterGroup !== "all" && member.group !== filterGroup) return false;
            if (filterColor !== "all" && member.color !== filterColor) return false;
            return true;
        });
        
        filteredMembers.forEach(m => m.latestStats = getLatestStats(m.name));
        
        // Sorting Members
        if (sortSelect === "name") {
            filteredMembers.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortSelect === "group") {
            filteredMembers.sort((a, b) => a.group.localeCompare(b.group));
        } else if (sortSelect === "color") {
            filteredMembers.sort((a, b) => (a.color || "").localeCompare(b.color || ""));
        } else if (sortSelect === "instagram") {
            filteredMembers.sort((a, b) => b.latestStats.Instagram - a.latestStats.Instagram);
        } else if (sortSelect === "x") {
            filteredMembers.sort((a, b) => b.latestStats.X - a.latestStats.X);
        } else if (sortSelect === "facebook") {
            filteredMembers.sort((a, b) => b.latestStats.Facebook - a.latestStats.Facebook);
        } else if (sortSelect === "tiktok") {
            filteredMembers.sort((a, b) => b.latestStats.TikTok - a.latestStats.TikTok);
        }
        
        document.getElementById("members-count").innerText = `${filteredMembers.length} Idols`;
        filteredMembers.forEach(member => renderCard(member, cardsContainer));
    }
}

// Chart.js inline plugin to draw labels above data points for both line and bar charts
const chartValuePlugin = {
    id: 'chartValuePlugin',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = 'bold 9px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            
            if (meta.type === 'bar') {
                ctx.fillStyle = '#E1E1E6';
                meta.data.forEach((bar, index) => {
                    const dataVal = dataset.data[index];
                    if (dataVal !== null && dataVal !== undefined) {
                        const formatted = new Intl.NumberFormat().format(dataVal);
                        ctx.fillText(formatted, bar.x, bar.y - 6);
                    }
                    
                    // Draw platform SVG icon inside the bar
                    let currentPlat = chartPlatform;
                    if (chartPlatform === "all") {
                        const barLabel = chart.data.labels[index];
                        if (barLabel) {
                            currentPlat = barLabel.toLowerCase();
                        }
                    }
                    
                    const svgPaths = {
                        instagram: "M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z",
                        x: "M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z",
                        facebook: "M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z",
                        tiktok: "M448 209.91a210.06 210.06 0 0 1-122.77-39.25v178.72A162.55 162.55 0 1 1 185 188.31v89.89a72.69 72.69 0 1 0 72.23 72.42V0h90.87a208.87 208.87 0 0 0 41 93.9 208.56 208.56 0 0 0 58.9 51.6z"
                    };
                    
                    const pathStr = svgPaths[currentPlat.toLowerCase()];
                    if (pathStr) {
                        const pathWidth = (currentPlat.toLowerCase() === "instagram" || currentPlat.toLowerCase() === "tiktok") ? 448 : 512;
                        const pathHeight = 512;
                        
                        ctx.save();
                        const barHeight = bar.base - bar.y;
                        if (barHeight > 40) {
                            const centerX = bar.x;
                            const centerY = bar.y + barHeight / 2;
                            const iconSize = Math.min(32, bar.width * 0.4);
                            
                            if (iconSize > 10) {
                                const scale = iconSize / 512;
                                ctx.translate(centerX, centerY);
                                ctx.scale(scale, scale);
                                ctx.translate(-pathWidth / 2, -pathHeight / 2);
                                ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
                                ctx.fill(new Path2D(pathStr));
                            }
                        }
                        ctx.restore();
                    }
                });
            } else if (meta.type === 'line') {
                const skipStep = Math.max(1, Math.ceil(meta.data.length / 50));
                
                meta.data.forEach((point, index) => {
                    if (index % skipStep !== 0) return;
                    
                    const dataVal = dataset.data[index];
                    if (dataVal !== null && dataVal !== undefined) {
                        let formattedVal = dataVal;
                        if (dataVal >= 1e6) {
                            formattedVal = parseFloat((dataVal / 1e6).toFixed(2)) + 'M';
                        } else if (dataVal >= 1e3) {
                            formattedVal = parseFloat((dataVal / 1e3).toFixed(2)) + 'k';
                        }
                        ctx.fillStyle = dataset.borderColor || '#E1E1E6';
                        ctx.fillText(formattedVal, point.x, point.y - 8);
                    }
                });
            }
        });
        ctx.restore();
    }
};

// ==========================================
// Follower Growth Charts (Chart.js)
// ==========================================
function renderGrowthChart() {
    const ctx = document.getElementById("growthChart").getContext("2d");
    if (growthChart) {
        growthChart.destroy();
    }
    
    // Toggle "Clear Selection" button visibility based on selection array size and active tab
    const clearBtn = document.getElementById("clear-selection-btn");
    if (clearBtn) {
        if (selectedIdols.length > 0 && activeView === "member") {
            clearBtn.style.display = "inline-flex";
        } else {
            clearBtn.style.display = "none";
        }
    }

    const groupClearBtn = document.getElementById("group-clear-selection-btn");
    if (groupClearBtn) {
        if (selectedIdols.length > 0 && activeView === "group") {
            groupClearBtn.style.display = "inline-flex";
        } else {
            groupClearBtn.style.display = "none";
        }
    }
    
    // Handle ALL Platforms button visibility based on selection count
    const allPlatformBtn = document.querySelector('#platform-filter-row .platform-icon-btn[data-platform="all"]');
    if (allPlatformBtn) {
        if (selectedIdols.length === 1) {
            if (allPlatformBtn.style.display === "none") {
                allPlatformBtn.style.display = "flex";
                chartPlatform = "all";
            }
        } else {
            allPlatformBtn.style.display = "none";
            if (chartPlatform === "all") {
                chartPlatform = "instagram";
            }
        }
    }

    // Sync active button highlights in platform icons row
    const platformButtons = document.querySelectorAll("#platform-filter-row .platform-icon-btn");
    platformButtons.forEach(btn => {
        if (btn.getAttribute("data-platform") === chartPlatform) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    // Slice historical dates by Date Range selection
    const fullDates = [...new Set(historyData.map(r => r.Date))].sort();
    const startIndex = fullDates.indexOf(startDate);
    const endIndex = fullDates.indexOf(endDate);
    const dates = fullDates.slice(startIndex !== -1 ? startIndex : 0, (endIndex !== -1 ? endIndex : fullDates.length - 1) + 1);
    
    let datasets = [];
    let labels = [];
    let plottedIdols = []; // Names of groups/members currently displayed on the graph
    
    const platformMapping = {
        all: "All Platforms",
        instagram: "Instagram",
        x: "X",
        facebook: "Facebook",
        tiktok: "TikTok"
    };
    const activePlatformName = platformMapping[chartPlatform] || "Instagram";
    const palette = ["#9D4DFF", "#5C9CFF", "#FF6B6B", "#6BCB77", "#FFB347", "#E1E1E6", "#4DF2EE", "#FFA066", "#A28BFE", "#FF85B3"];
    
    if (chartType === "line") {
        labels = dates;
        if (selectedIdols.length === 0) {
            document.querySelector(".chart-header h2").innerText = activeView === "group" ? `Official Groups Trend (${activePlatformName})` : `Top 10 Trend (${activePlatformName})`;
            document.querySelector(".chart-subtitle").innerText = "No profiles selected. Select card headers below to plot growth trends.";
        } else if (selectedIdols.length === 1) {
            const targetName = selectedIdols[0];
            const historyList = historyData.filter(r => r.Idol_Name.toLowerCase() === targetName.toLowerCase());
            const platforms = chartPlatform === "all" 
                ? ["Instagram", "X", "Facebook", "TikTok"] 
                : [platformMapping[chartPlatform]];
            const colors = {
                Instagram: "#FF5A79",
                X: "#E1E1E6",
                Facebook: "#007AFF",
                TikTok: "#25F4EE"
            };
            
            platforms.forEach(platform => {
                const dataPoints = dates.map(date => {
                    const rec = historyList.find(r => r.Date === date && r.Platform === platform);
                    return rec ? intVal(rec.Follower_Count) : null;
                });
                
                if (dataPoints.some(val => val !== null && val > 0)) {
                    datasets.push({
                        label: platform,
                        data: dataPoints,
                        borderColor: colors[platform],
                        backgroundColor: colors[platform] + "10",
                        tension: 0.3,
                        borderWidth: 2.5,
                        fill: false
                    });
                }
            });
            
            plottedIdols.push(targetName);
            const idolConfig = idolsList.find(i => i.name.toLowerCase() === targetName.toLowerCase());
            const idolColor = resolveColor(idolConfig?.color);
            const typeLabel = idolConfig?.type === "group" ? "Group" : "Member";
            
            const platformText = chartPlatform === "all" ? "Platform Overview" : `${activePlatformName} Overview`;
            document.querySelector(".chart-header h2").innerHTML = `<span style="color: ${idolColor}; text-shadow: 0 0 10px color-mix(in srgb, ${idolColor} 40%, transparent);">${targetName}</span> <span style="font-size: 14px; color: var(--text-secondary);">(${typeLabel})</span> - ${platformText}`;
            document.querySelector(".chart-subtitle").innerText = "Displaying channel distribution. Click other card headers to plot comparisons.";
            
        } else {
            selectedIdols.forEach((name, idx) => {
                const historyList = historyData.filter(r => r.Idol_Name.toLowerCase() === name.toLowerCase() && r.Platform === activePlatformName);
                const dataPoints = dates.map(date => {
                    const rec = historyList.find(r => r.Date === date);
                    return rec ? intVal(rec.Follower_Count) : null;
                });
                
                const idolConfig = idolsList.find(i => i.name.toLowerCase() === name.toLowerCase());
                datasets.push({
                    label: name,
                    data: dataPoints,
                    borderColor: idolConfig?.color ? resolveColor(idolConfig.color) : palette[idx % palette.length],
                    backgroundColor: "transparent",
                    tension: 0.3,
                    borderWidth: 2.5,
                    fill: false
                });
                plottedIdols.push(name);
            });
            
            const coloredNames = getColoredNamesString(selectedIdols);
            
            document.querySelector(".chart-header h2").innerHTML = `Trend (${activePlatformName})`;
            document.querySelector(".chart-subtitle").innerHTML = `Tracking selected items: ${coloredNames}`;
        }
    } else {
        // Render Bar Chart (Latest Standings)
        if (selectedIdols.length === 0) {
            document.querySelector(".chart-header h2").innerText = activeView === "group" ? `Official Groups (${activePlatformName})` : `Top 10 (${activePlatformName})`;
            document.querySelector(".chart-subtitle").innerText = "No profiles selected. Select card headers below to plot standings.";
        } else if (selectedIdols.length === 1) {
            const targetName = selectedIdols[0];
            const stats = getLatestStats(targetName);
            labels = chartPlatform === "all" 
                ? ["Instagram", "X", "Facebook", "TikTok"] 
                : [platformMapping[chartPlatform]];
            const platformColorsMap = {
                Instagram: "#FF85B3",
                X: "#E1E1E6",
                Facebook: "#5C9CFF",
                TikTok: "#4DF2EE"
            };
            const dataValues = labels.map(p => stats[p] || 0);
            const barColors = labels.map(p => platformColorsMap[p]);
            
            datasets.push({
                label: "Followers",
                data: dataValues,
                backgroundColor: barColors,
                borderColor: barColors,
                borderWidth: 2,
                borderRadius: 6,
                barPercentage: 0.5,
                categoryPercentage: 0.8
            });
            plottedIdols.push(targetName);
            
            const idolConfig = idolsList.find(i => i.name.toLowerCase() === targetName.toLowerCase());
            const idolColor = resolveColor(idolConfig?.color);
            const typeLabel = idolConfig?.type === "group" ? "Group" : "Member";
            
            document.querySelector(".chart-header h2").innerHTML = `<span style="color: ${idolColor}; text-shadow: 0 0 10px color-mix(in srgb, ${idolColor} 40%, transparent);">${targetName}</span> <span style="font-size: 14px; color: var(--text-secondary);">(${typeLabel})</span>`;
            document.querySelector(".chart-subtitle").innerText = "Displaying distribution standings across platforms for this item.";
        } else {
            const items = selectedIdols.map((name, idx) => {
                const stats = getLatestStats(name);
                const count = stats[activePlatformName] || 0;
                const config = idolsList.find(i => i.name.toLowerCase() === name.toLowerCase());
                const color = config?.color ? resolveColor(config.color) : palette[idx % palette.length];
                return { name, count, color };
            });
            
            items.sort((a, b) => b.count - a.count);
            
            labels = items.map(item => item.name);
            const dataValues = items.map(item => item.count);
            const barColors = items.map(item => item.color);
            
            datasets.push({
                label: "Followers",
                data: dataValues,
                backgroundColor: barColors,
                borderColor: barColors,
                borderWidth: 2,
                borderRadius: 6,
                barPercentage: 0.5,
                categoryPercentage: 0.8
            });
            plottedIdols = selectedIdols;
            
            const coloredNames = getColoredNamesString(selectedIdols);
            
            document.querySelector(".chart-header h2").innerHTML = `Standings (${activePlatformName})`;
            document.querySelector(".chart-subtitle").innerHTML = `Tracking selected items: ${coloredNames}`;
        }
    }
    
    // Initialize Chart.js
    growthChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, activeElements) => {
                if (chartType === 'bar' && activeElements.length > 0) {
                    const activeElement = activeElements[0];
                    const dataIndex = activeElement.index;
                    const clickedName = growthChart.data.labels[dataIndex];
                    if (clickedName) {
                        event.native.stopPropagation(); // Stop propagation to document click handler
                        
                        // Calculate coordinates near the click point relative to the viewport + scroll
                        const canvas = growthChart.canvas;
                        const rect = canvas.getBoundingClientRect();
                        const scrollX = window.scrollX || window.pageXOffset;
                        const scrollY = window.scrollY || window.pageYOffset;
                        
                        // Place popup slightly above and centered on the click position
                        const x = rect.left + scrollX + event.x - 60;
                        const y = rect.top + scrollY + event.y - 45;
                        
                        showPopupAtCoords(clickedName, x, y);
                    }
                }
            },
            plugins: {
                legend: {
                    display: chartType === 'line',
                    position: 'top',
                    labels: {
                        boxWidth: 0, // Removes colored box/rectangle in front of text
                        font: { family: 'Outfit', size: 12, weight: 'bold' },
                        color: function(legendItem) {
                            const datasetIndex = legendItem.datasetIndex;
                            const dataset = datasets[datasetIndex];
                            return dataset ? dataset.borderColor : '#E1E1E6';
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#16161A',
                    titleColor: '#FFFFFF',
                    bodyColor: '#8E8E9F',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    titleFont: { family: 'Outfit', weight: 'bold' },
                    bodyFont: { family: 'Outfit' },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat().format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'category',
                    offset: true,
                    grid: { 
                        display: chartType === 'line',
                        color: 'rgba(255, 255, 255, 0.04)' 
                    },
                    ticks: { color: '#8E8E9F', font: { family: 'Outfit' } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: {
                        color: '#8E8E9F',
                        font: { family: 'Outfit' },
                        callback: function(value) {
                            if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
                            if (value >= 1e3) return (value / 1e3).toFixed(0) + 'k';
                            return value;
                        }
                    }
                }
            }
        },
        plugins: [chartValuePlugin]
    });
    
    // Sync Card Selection glow states based on plottedIdols list (without user clicks)
    document.querySelectorAll(".member-card").forEach(card => {
        const name = card.getAttribute("data-name");
        if (plottedIdols.includes(name)) {
            card.classList.add("selected");
        } else {
            card.classList.remove("selected");
        }
    });
}

function intVal(val) {
    return parseInt(val || 0, 10);
}

function initSearchAutocomplete() {
    const searchInput = document.getElementById("global-search-input");
    const suggestionsBox = document.getElementById("search-suggestions");
    if (!searchInput || !suggestionsBox) return;

    let highlightedIndex = -1;
    let currentSuggestions = [];

    const normalizeSearchStr = (str) => {
        if (!str) return "";
        return str.toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        if (!query) {
            suggestionsBox.innerHTML = "";
            suggestionsBox.classList.remove("active");
            highlightedIndex = -1;
            return;
        }

        const queryNorm = normalizeSearchStr(query);

        // Filter groups and members matching name or group
        currentSuggestions = idolsList.filter(idol => {
            const nameNorm = normalizeSearchStr(idol.name);
            const groupNorm = normalizeSearchStr(idol.group);
            return nameNorm.includes(queryNorm) || groupNorm.includes(queryNorm);
        });

        // Sort official group channels first
        currentSuggestions.sort((a, b) => {
            const aIsGroup = a.type === "group" ? 1 : 0;
            const bIsGroup = b.type === "group" ? 1 : 0;
            return bIsGroup - aIsGroup;
        });

        if (currentSuggestions.length === 0) {
            suggestionsBox.innerHTML = '<div class="no-suggestions-row">No matching members found</div>';
            suggestionsBox.classList.add("active");
            highlightedIndex = -1;
            return;
        }

        suggestionsBox.innerHTML = "";
        currentSuggestions.forEach((idol, index) => {
            const row = document.createElement("div");
            row.classList.add("suggestion-row");
            row.setAttribute("data-index", index);
            
            const initials = idol.name.slice(0, 2).toUpperCase();
            const avatarStyle = idol.x_avatar_url 
                ? `style="background-image: url('${idol.x_avatar_url}');"`
                : '';
                
            row.innerHTML = `
                <div class="suggestion-avatar" ${avatarStyle}>${idol.x_avatar_url ? '' : initials}</div>
                <div class="suggestion-info">
                    <span class="suggestion-name">${idol.name}</span>
                    <span class="suggestion-group">${idol.type === "group" ? "Official Channel" : idol.group}</span>
                </div>
            `;
            
            row.addEventListener("click", () => {
                window.location.href = `profile.html?name=${encodeURIComponent(idol.name)}`;
            });
            
            suggestionsBox.appendChild(row);
        });

        suggestionsBox.classList.add("active");
        highlightedIndex = -1;
    });

    // Handle Keyboard navigation
    searchInput.addEventListener("keydown", (e) => {
        const rows = suggestionsBox.querySelectorAll(".suggestion-row");
        if (!suggestionsBox.classList.contains("active") || rows.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % rows.length;
            updateHighlight(rows);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + rows.length) % rows.length;
            updateHighlight(rows);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < currentSuggestions.length) {
                const selected = currentSuggestions[highlightedIndex];
                window.location.href = `profile.html?name=${encodeURIComponent(selected.name)}`;
            } else if (currentSuggestions.length > 0) {
                window.location.href = `profile.html?name=${encodeURIComponent(currentSuggestions[0].name)}`;
            }
        } else if (e.key === "Escape") {
            suggestionsBox.innerHTML = "";
            suggestionsBox.classList.remove("active");
            highlightedIndex = -1;
        }
    });

    function updateHighlight(rows) {
        rows.forEach((row, index) => {
            if (index === highlightedIndex) {
                row.classList.add("highlighted");
                row.scrollIntoView({ block: "nearest" });
            } else {
                row.classList.remove("highlighted");
            }
        });
    }

    // Close suggestion box when clicking outside
    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.innerHTML = "";
            suggestionsBox.classList.remove("active");
            highlightedIndex = -1;
        }
    });
}

function showPopupAtElement(name, element) {
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    // Center bottom position
    const x = rect.left + scrollX + rect.width / 2 - 60;
    const y = rect.bottom + scrollY + 8;
    
    showPopupAtCoords(name, x, y);
}

function showPopupAtCoords(name, x, y) {
    const popup = document.getElementById("custom-profile-popup");
    if (popup) {
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        popup.style.display = "block";
        popup.onclick = (e) => {
            e.stopPropagation();
            window.location.href = `profile.html?name=${encodeURIComponent(name)}`;
        };
    }
}

// Document click-away listener to hide popup
document.addEventListener("click", () => {
    const popup = document.getElementById("custom-profile-popup");
    if (popup) {
        popup.style.display = "none";
    }
});

