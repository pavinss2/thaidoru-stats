let idolsList = [];
let currentView = "agency"; // fallback

// Search and filter states
let agencySearchQuery = "";

let groupSearchQuery = "";
let groupTabAgencyFilter = "all";

let memberSearchQuery = "";
let memberTabGroupFilter = "all";
let memberTabAgencyFilter = "all";
let memberTabColorFilter = "all";

let colorSearchQuery = "";
let colorTabGroupFilter = "all";
let colorTabAgencyFilter = "all";

// Color map resolution helper
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

document.addEventListener("DOMContentLoaded", () => {
    // 1. Instant local storage cache check for the last updated timestamp
    const cachedTime = localStorage.getItem("lastUpdatedTime");
    const lastUpdatedEl = document.getElementById("last-updated");
    if (cachedTime && lastUpdatedEl) {
        lastUpdatedEl.innerText = cachedTime;
    }

    // Initialize Lucide icons
    lucide.createIcons();

    // 2. Determine and toggle view parameter immediately on page load before data fetches
    const urlParams = new URLSearchParams(window.location.search);
    currentView = urlParams.get("view") || "agency";
    toggleViewContainers();

    // Fetch datasets
    Promise.all([
        fetch("idols.json?_t=" + Date.now()).then(res => res.json()),
        fetch("/api/stats?_t=" + Date.now())
            .then(res => {
                if (!res.ok) throw new Error("API not available");
                return res.json();
            })
            .catch(() => {
                return fetch("follower_history.csv?_t=" + Date.now())
                    .then(res => res.text())
                    .then(csvText => parseCSV(csvText));
            })
    ])
    .then(([idols, parsedData]) => {
        idolsList = idols;
        
        // Cache and display latest updated timestamp
        if (parsedData.length > 0) {
            const sortedHistory = [...parsedData].sort((a, b) => {
                const dateComp = a.Date.localeCompare(b.Date);
                if (dateComp !== 0) return dateComp;
                return (a.Timestamp || "").localeCompare(b.Timestamp || "");
            });
            const latest = sortedHistory[sortedHistory.length - 1];
            const timeStr = latest.Timestamp ? ` @ ${latest.Timestamp.slice(0, 5)} (UTC+7)` : "";
            const formattedTime = `Last Update: ${latest.Date}${timeStr}`;
            
            if (lastUpdatedEl) {
                lastUpdatedEl.innerText = formattedTime;
            }
            localStorage.setItem("lastUpdatedTime", formattedTime);
        }

        initSearchAutocomplete();
        populateFilters();
        setupSearchAndFilters();
        renderActiveView();
    })
    .catch(err => {
        console.error("Error loading directory dashboard:", err);
    });
});

// CSV parsing
function parseCSV(text) {
    const lines = text.split("\n").filter(line => line.trim() !== "");
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(",").map(h => h.trim());
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(",");
        if (columns.length < headers.length) continue;
        
        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = columns[j].trim();
        }
        results.push(row);
    }
    return results;
}

// Toggle visible section based on parameters
function toggleViewContainers() {
    // Toggle tab styles
    document.querySelectorAll(".nav-tab").forEach(tab => {
        if (tab.getAttribute("data-tab") === currentView) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // Hide all sections, show active
    document.querySelectorAll(".directory-section").forEach(sec => {
        sec.style.display = "none";
    });

    const targetSection = document.getElementById(`${currentView}-section`);
    if (targetSection) {
        targetSection.style.display = "block";
    }
}

// Setup search & filter listeners
function setupSearchAndFilters() {
    // Agency Search
    const agencySearch = document.getElementById("agency-search-input");
    if (agencySearch) {
        agencySearch.addEventListener("input", (e) => {
            agencySearchQuery = e.target.value.toLowerCase().trim();
            renderAgencyView();
        });
    }

    // Group Search & Filter
    const groupSearch = document.getElementById("group-search-input");
    if (groupSearch) {
        groupSearch.addEventListener("input", (e) => {
            groupSearchQuery = e.target.value.toLowerCase().trim();
            renderGroupView();
        });
    }
    const groupAgencySelect = document.getElementById("group-tab-agency-filter");
    if (groupAgencySelect) {
        groupAgencySelect.addEventListener("change", (e) => {
            groupTabAgencyFilter = e.target.value;
            renderGroupView();
        });
    }

    // Member Search & Filters
    const memberSearch = document.getElementById("member-search-input");
    if (memberSearch) {
        memberSearch.addEventListener("input", (e) => {
            memberSearchQuery = e.target.value.toLowerCase().trim();
            renderMemberView();
        });
    }
    const memberGroupSelect = document.getElementById("member-tab-group-filter");
    if (memberGroupSelect) {
        memberGroupSelect.addEventListener("change", (e) => {
            memberTabGroupFilter = e.target.value;
            renderMemberView();
        });
    }
    const memberAgencySelect = document.getElementById("member-tab-agency-filter");
    if (memberAgencySelect) {
        memberAgencySelect.addEventListener("change", (e) => {
            memberTabAgencyFilter = e.target.value;
            renderMemberView();
        });
    }
    const memberColorSelect = document.getElementById("member-tab-color-filter");
    if (memberColorSelect) {
        memberColorSelect.addEventListener("change", (e) => {
            memberTabColorFilter = e.target.value;
            renderMemberView();
        });
    }

    // Color Search & Filters
    const colorSearch = document.getElementById("color-search-input");
    if (colorSearch) {
        colorSearch.addEventListener("input", (e) => {
            colorSearchQuery = e.target.value.toLowerCase().trim();
            renderColorView();
        });
    }
    const colorGroupSelect = document.getElementById("color-tab-group-filter");
    if (colorGroupSelect) {
        colorGroupSelect.addEventListener("change", (e) => {
            colorTabGroupFilter = e.target.value;
            renderColorView();
        });
    }
    const colorAgencySelect = document.getElementById("color-tab-agency-filter");
    if (colorAgencySelect) {
        colorAgencySelect.addEventListener("change", (e) => {
            colorTabAgencyFilter = e.target.value;
            renderColorView();
        });
    }
}

// Populate filters
function populateFilters() {
    const groups = [...new Set(idolsList.filter(i => i.group).map(i => i.group))].sort();
    const agencies = [...new Set(idolsList.filter(i => i.agency).map(i => i.agency))].sort();
    const colors = [...new Set(idolsList.filter(i => i.color).map(i => i.color))].sort();

    // Group Tab Filters
    const groupTabAgencySelect = document.getElementById("group-tab-agency-filter");
    if (groupTabAgencySelect) {
        groupTabAgencySelect.innerHTML = '<option value="all">All Agencies</option>';
        agencies.forEach(a => {
            groupTabAgencySelect.innerHTML += `<option value="${a}">${a}</option>`;
        });
    }

    // Member Tab Filters
    const memberTabGroupSelect = document.getElementById("member-tab-group-filter");
    if (memberTabGroupSelect) {
        memberTabGroupSelect.innerHTML = '<option value="all">All Groups</option>';
        groups.forEach(g => {
            memberTabGroupSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
    }
    const memberTabAgencySelect = document.getElementById("member-tab-agency-filter");
    if (memberTabAgencySelect) {
        memberTabAgencySelect.innerHTML = '<option value="all">All Agencies</option>';
        agencies.forEach(a => {
            memberTabAgencySelect.innerHTML += `<option value="${a}">${a}</option>`;
        });
    }
    const memberTabColorSelect = document.getElementById("member-tab-color-filter");
    if (memberTabColorSelect) {
        memberTabColorSelect.innerHTML = '<option value="all">All Colors</option>';
        colors.forEach(c => {
            memberTabColorSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
    }

    // Color Tab Filters
    const colorTabGroupSelect = document.getElementById("color-tab-group-filter");
    if (colorTabGroupSelect) {
        colorTabGroupSelect.innerHTML = '<option value="all">All Groups</option>';
        groups.forEach(g => {
            colorTabGroupSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
    }
    const colorTabAgencySelect = document.getElementById("color-tab-agency-filter");
    if (colorTabAgencySelect) {
        colorTabAgencySelect.innerHTML = '<option value="all">All Agencies</option>';
        agencies.forEach(a => {
            colorTabAgencySelect.innerHTML += `<option value="${a}">${a}</option>`;
        });
    }
}

// Render dynamic sections based on current parameters
function renderActiveView() {
    if (currentView === "agency") {
        renderAgencyView();
    } else if (currentView === "group") {
        renderGroupView();
    } else if (currentView === "member") {
        renderMemberView();
    } else if (currentView === "color") {
        renderColorView();
    }
}

// Views Render Methods
function renderAgencyView() {
    const tbody = document.getElementById("agency-directory-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const agencies = [...new Set(idolsList.filter(i => i.agency).map(i => i.agency))];
    const filteredAgencies = agencies.filter(a => a.toLowerCase().includes(agencySearchQuery));

    if (filteredAgencies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 20px;">No agencies found</td></tr>`;
        return;
    }

    filteredAgencies.forEach(agencyName => {
        const agencyGroups = idolsList.filter(i => i.type === "group" && i.agency === agencyName);
        const agencyMembers = idolsList.filter(i => i.type === "member" && i.agency === agencyName);

        const row = document.createElement("tr");
        row.style.cursor = "pointer";
        row.innerHTML = `
            <td style="font-weight: 700; color: white;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(157, 77, 255, 0.15); border: 1px solid rgba(157, 77, 255, 0.3); display:flex; align-items:center; justify-content:center; color: var(--accent-purple);">
                        <i data-lucide="building-2" style="width:16px; height: 16px;"></i>
                    </div>
                    <span>${agencyName}</span>
                </div>
            </td>
            <td>${agencyGroups.length} Groups</td>
            <td>${agencyMembers.length} Members</td>
        `;

        row.addEventListener("click", () => {
            window.location.href = `agency.html?name=${encodeURIComponent(agencyName)}`;
        });

        tbody.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons();
}

function getSnsLinksHtml(item) {
    const igUrl = item.instagram_handle ? (item.instagram_handle.startsWith('http') ? item.instagram_handle : `https://www.instagram.com/${item.instagram_handle}/`) : '';
    const xUrl = item.x_handle ? (item.x_handle.startsWith('http') ? item.x_handle : `https://x.com/${item.x_handle}`) : '';
    const fbUrl = item.facebook_page ? (item.facebook_page.startsWith('http') ? item.facebook_page : `https://www.facebook.com/${item.facebook_page}`) : '';
    const ttUrl = item.tiktok_handle ? (item.tiktok_handle.startsWith('http') ? item.tiktok_handle : `https://www.tiktok.com/@${item.tiktok_handle}`) : '';

    let html = `<div style="display:flex; gap: 10px; align-items:center;">`;
    
    if (igUrl) {
        html += `<a href="${igUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--text-secondary); transition: var(--transition-smooth); display:flex; align-items:center;" onmouseenter="this.style.color='#FF85B3'" onmouseleave="this.style.color='var(--text-secondary)'" title="Instagram">
            <svg aria-hidden="true" style="width:16px; height:16px; fill:currentColor;" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"></path></svg>
        </a>`;
    }
    if (xUrl) {
        html += `<a href="${xUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--text-secondary); transition: var(--transition-smooth); display:flex; align-items:center;" onmouseenter="this.style.color='#FFFFFF'" onmouseleave="this.style.color='var(--text-secondary)'" title="X (Twitter)">
            <svg aria-hidden="true" style="width:16px; height:16px; fill:currentColor;" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"></path></svg>
        </a>`;
    }
    if (fbUrl) {
        html += `<a href="${fbUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--text-secondary); transition: var(--transition-smooth); display:flex; align-items:center;" onmouseenter="this.style.color='#5C9CFF'" onmouseleave="this.style.color='var(--text-secondary)'" title="Facebook">
            <svg aria-hidden="true" style="width:16px; height:16px; fill:currentColor;" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z"></path></svg>
        </a>`;
    }
    if (ttUrl) {
        html += `<a href="${ttUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--text-secondary); transition: var(--transition-smooth); display:flex; align-items:center;" onmouseenter="this.style.color='#4DF2EE'" onmouseleave="this.style.color='var(--text-secondary)'" title="TikTok">
            <svg aria-hidden="true" style="width:16px; height:16px; fill:currentColor;" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M448 209.91a210.06 210.06 0 0 1-122.77-39.25v178.72A162.55 162.55 0 1 1 185 188.31v89.89a72.69 72.69 0 1 0 72.23 72.42V0h90.87a208.87 208.87 0 0 0 41 93.9 208.56 208.56 0 0 0 58.9 51.6z"></path></svg>
        </a>`;
    }
    
    if (!igUrl && !xUrl && !fbUrl && !ttUrl) {
        html += `<span style="font-size: 11px; color: var(--text-muted);">None</span>`;
    }

    html += `</div>`;
    return html;
}

function renderGroupView() {
    const tbody = document.getElementById("group-directory-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const groupsList = idolsList.filter(i => i.type === "group");
    const filteredGroups = groupsList.filter(g => {
        if (groupSearchQuery && !g.name.toLowerCase().includes(groupSearchQuery)) return false;
        if (groupTabAgencyFilter !== "all" && g.agency !== groupTabAgencyFilter) return false;
        return true;
    });

    if (filteredGroups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">No groups found</td></tr>`;
        return;
    }

    filteredGroups.sort((a, b) => a.name.localeCompare(b.name));

    filteredGroups.forEach(group => {
        const membersCount = idolsList.filter(i => i.type === "member" && i.group === group.name).length;
        const initials = group.name.slice(0, 2).toUpperCase();
        const avatarStyle = group.x_avatar_url ? `style="background-image: url('${group.x_avatar_url}'); background-size: cover; background-position: center;"` : '';

        const row = document.createElement("tr");
        row.style.cursor = "pointer";
        row.innerHTML = `
            <td style="font-weight: 700; color: white;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div class="member-avatar" ${avatarStyle} style="width:32px; height:32px; font-size: 11px; --card-glow-color: ${resolveColor(group.color)}">${group.x_avatar_url ? '' : initials}</div>
                    <span>${group.name}</span>
                </div>
            </td>
            <td>
                <a href="agency.html?name=${encodeURIComponent(group.agency)}" onclick="event.stopPropagation();" style="color: var(--text-secondary); text-decoration: none;" onmouseenter="this.style.color='var(--accent-purple)'" onmouseleave="this.style.color='var(--text-secondary)'">
                    ${group.agency || 'Catsolute'}
                </a>
            </td>
            <td>${membersCount} Members</td>
            <td>${group.debut_date || '-'}</td>
            <td>${getSnsLinksHtml(group)}</td>
        `;

        row.addEventListener("click", () => {
            window.location.href = `profile.html?name=${encodeURIComponent(group.name)}`;
        });

        tbody.appendChild(row);
    });
}

function renderMemberView() {
    const tbody = document.getElementById("member-directory-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const membersList = idolsList.filter(i => i.type === "member");
    const filteredMembers = membersList.filter(m => {
        if (memberSearchQuery && !m.name.toLowerCase().includes(memberSearchQuery) && !m.group.toLowerCase().includes(memberSearchQuery)) return false;
        if (memberTabGroupFilter !== "all" && m.group !== memberTabGroupFilter) return false;
        if (memberTabAgencyFilter !== "all" && m.agency !== memberTabAgencyFilter) return false;
        if (memberTabColorFilter !== "all" && m.color !== memberTabColorFilter) return false;
        return true;
    });

    if (filteredMembers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">No members found</td></tr>`;
        return;
    }

    filteredMembers.sort((a, b) => a.name.localeCompare(b.name));

    filteredMembers.forEach(m => {
        const initials = m.name.slice(0, 2).toUpperCase();
        const avatarStyle = m.x_avatar_url ? `style="background-image: url('${m.x_avatar_url}'); background-size: cover; background-position: center;"` : '';

        const row = document.createElement("tr");
        row.style.cursor = "pointer";
        row.innerHTML = `
            <td style="font-weight: 700; color: white;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div class="member-avatar" ${avatarStyle} style="width:32px; height:32px; font-size: 11px; --card-glow-color: ${resolveColor(m.color)}">${m.x_avatar_url ? '' : initials}</div>
                    <span>${m.name}</span>
                </div>
            </td>
            <td>
                <a href="profile.html?name=${encodeURIComponent(m.group)}" onclick="event.stopPropagation();" style="color: var(--text-secondary); text-decoration: none;" onmouseenter="this.style.color='var(--accent-purple)'" onmouseleave="this.style.color='var(--text-secondary)'">
                    ${m.group}
                </a>
            </td>
            <td>
                <a href="agency.html?name=${encodeURIComponent(m.agency)}" onclick="event.stopPropagation();" style="color: var(--text-secondary); text-decoration: none;" onmouseenter="this.style.color='var(--accent-purple)'" onmouseleave="this.style.color='var(--text-secondary)'">
                    ${m.agency || 'Catsolute'}
                </a>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap: 6px;">
                    <span class="color-dot" style="background: ${resolveColor(m.color)}; box-shadow: 0 0 6px ${resolveColor(m.color)}; width: 8px; height: 8px; border-radius: 50%; display:inline-block;"></span>
                    <span style="font-size: 13px;">${m.color}</span>
                </div>
            </td>
            <td>${getSnsLinksHtml(m)}</td>
        `;

        row.addEventListener("click", () => {
            window.location.href = `profile.html?name=${encodeURIComponent(m.name)}`;
        });

        tbody.appendChild(row);
    });
}

function renderColorView() {
    const wrapper = document.getElementById("colors-grouped-wrapper");
    if (!wrapper) return;
    wrapper.innerHTML = "";

    const membersList = idolsList.filter(i => i.type === "member");
    const colors = ["Red", "Pink", "Yellow", "Green", "White", "Blue", "Purple", "Black", "Orange"];
    let matchesFound = false;

    colors.forEach(colorName => {
        const matchingMembers = membersList.filter(m => {
            if (m.color !== colorName) return false;
            if (colorSearchQuery && !m.name.toLowerCase().includes(colorSearchQuery) && !m.group.toLowerCase().includes(colorSearchQuery)) return false;
            if (colorTabGroupFilter !== "all" && m.group !== colorTabGroupFilter) return false;
            if (colorTabAgencyFilter !== "all" && m.agency !== colorTabAgencyFilter) return false;
            return true;
        });

        if (matchingMembers.length === 0) return;

        matchesFound = true;
        const colorCode = resolveColor(colorName);
        const colorSec = document.createElement("div");
        colorSec.id = "color-group-" + colorName.toLowerCase();
        colorSec.classList.add("color-group-section");
        colorSec.style.marginBottom = "30px";
        colorSec.style.padding = "20px";
        colorSec.style.background = "rgba(20, 20, 25, 0.4)";
        colorSec.style.border = "1px solid var(--border-color)";
        colorSec.style.borderRadius = "16px";
        colorSec.style.transition = "var(--transition-smooth)";

        colorSec.innerHTML = `
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colorCode}; display: flex; align-items: center; gap: 8px; text-shadow: 0 0 10px color-mix(in srgb, ${colorCode} 30%, transparent);">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${colorCode}; box-shadow: 0 0 10px ${colorCode}; display: inline-block;"></span>
                ${colorName} Theme (${matchingMembers.length})
            </h3>
            <div class="cards-grid" id="color-cards-${colorName.toLowerCase()}"></div>
        `;

        wrapper.appendChild(colorSec);
        const cardsGrid = document.getElementById(`color-cards-${colorName.toLowerCase()}`);

        matchingMembers.forEach(m => {
            const card = document.createElement("div");
            card.classList.add("member-card");
            card.classList.add("no-toggle");
            card.style.setProperty("--card-glow-color", colorCode);
            card.style.setProperty("--member-color", colorCode);
            card.style.padding = "16px";

            const initials = m.name.slice(0, 2).toUpperCase();
            const avatarStyle = m.x_avatar_url ? `style="background-image: url('${m.x_avatar_url}'); background-size: cover; background-position: center;"` : '';

            card.innerHTML = `
                <div class="card-top" onclick="window.location.href='profile.html?name=${encodeURIComponent(m.name)}'" style="margin: -6px -6px 0 -6px; padding: 6px;">
                    <div class="member-avatar" ${avatarStyle} style="width: 44px; height: 44px; font-size: 14px; --card-glow-color: ${colorCode}">${m.x_avatar_url ? '' : initials}</div>
                    <div class="member-meta">
                        <span class="member-name" style="font-size: 16px;">${m.name}</span>
                        <span class="member-tagline" style="font-size: 11px;">
                            <span class="group-badge" style="padding: 1px 6px;">${m.group}</span>
                        </span>
                    </div>
                </div>
            `;
            cardsGrid.appendChild(card);
        });
    });

    if (!matchesFound) {
        wrapper.innerHTML = `<div class="no-suggestions-row" style="color:var(--text-secondary); text-align:center; padding: 40px 0; width:100%;">No members found matching the selected filters</div>`;
    }

    // Check hash scroll (e.g. directory.html?view=color#Red)
    const hash = window.location.hash;
    if (hash) {
        const targetId = decodeURIComponent(hash.substring(1));
        setTimeout(() => {
            const targetEl = document.getElementById("color-group-" + targetId.toLowerCase());
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
                targetEl.classList.add("highlight-pulse");
                setTimeout(() => {
                    targetEl.classList.remove("highlight-pulse");
                }, 2500);
            }
        }, 300);
    }
}

// Global Autocomplete Search
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

        currentSuggestions = idolsList.filter(idol => {
            const nameNorm = normalizeSearchStr(idol.name);
            const groupNorm = normalizeSearchStr(idol.group);
            return nameNorm.includes(queryNorm) || groupNorm.includes(queryNorm);
        });

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
            const avatarStyle = idol.x_avatar_url ? `style="background-image: url('${idol.x_avatar_url}');"` : '';
            const colorCode = resolveColor(idol.color);

            row.innerHTML = `
                <div class="suggestion-avatar" ${avatarStyle} style="--card-glow-color: ${colorCode}">${idol.x_avatar_url ? '' : initials}</div>
                <div class="suggestion-meta">
                    <span class="suggestion-name">${idol.name}</span>
                    <span class="suggestion-group">${idol.type === 'group' ? 'Official Group' : idol.group}</span>
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

    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.innerHTML = "";
            suggestionsBox.classList.remove("active");
        }
    });
}
