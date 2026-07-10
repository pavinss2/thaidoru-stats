let idolsList = [];
let memberSearchQuery = "";
let memberTabGroupFilter = "all";
let memberTabAgencyFilter = "all";
let memberTabColorFilter = "all";

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

document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide icons
    lucide.createIcons();

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
        
        // Display latest updated timestamp
        if (parsedData.length > 0) {
            const sortedHistory = [...parsedData].sort((a, b) => {
                const dateComp = a.Date.localeCompare(b.Date);
                if (dateComp !== 0) return dateComp;
                return (a.Timestamp || "").localeCompare(b.Timestamp || "");
            });
            const latest = sortedHistory[sortedHistory.length - 1];
            const timeStr = latest.Timestamp ? ` @ ${latest.Timestamp.slice(0, 5)} (UTC+7)` : "";
            document.getElementById("last-updated").innerText = `Last Update: ${latest.Date}${timeStr}`;
        }

        initSearchAutocomplete();
        populateFilters();
        setupMemberSearchAndFilters();
        renderMemberTab();
    })
    .catch(err => {
        console.error("Error loading members dashboard:", err);
    });
});

// Parse CSV helper
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

function populateFilters() {
    const groups = [...new Set(idolsList.filter(i => i.group).map(i => i.group))].sort();
    const agencies = [...new Set(idolsList.filter(i => i.agency).map(i => i.agency))].sort();
    const colors = [...new Set(idolsList.filter(i => i.color).map(i => i.color))].sort();

    const groupSelect = document.getElementById("member-tab-group-filter");
    if (groupSelect) {
        groupSelect.innerHTML = '<option value="all">All Groups</option>';
        groups.forEach(g => {
            groupSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
    }

    const agencySelect = document.getElementById("member-tab-agency-filter");
    if (agencySelect) {
        agencySelect.innerHTML = '<option value="all">All Agencies</option>';
        agencies.forEach(a => {
            agencySelect.innerHTML += `<option value="${a}">${a}</option>`;
        });
    }

    const colorSelect = document.getElementById("member-tab-color-filter");
    if (colorSelect) {
        colorSelect.innerHTML = '<option value="all">All Colors</option>';
        colors.forEach(c => {
            colorSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
    }
}

function setupMemberSearchAndFilters() {
    const memberSearch = document.getElementById("member-search-input");
    if (memberSearch) {
        memberSearch.addEventListener("input", (e) => {
            memberSearchQuery = e.target.value.toLowerCase().trim();
            renderMemberTab();
        });
    }
    const groupSelect = document.getElementById("member-tab-group-filter");
    if (groupSelect) {
        groupSelect.addEventListener("change", (e) => {
            memberTabGroupFilter = e.target.value;
            renderMemberTab();
        });
    }
    const agencySelect = document.getElementById("member-tab-agency-filter");
    if (agencySelect) {
        agencySelect.addEventListener("change", (e) => {
            memberTabAgencyFilter = e.target.value;
            renderMemberTab();
        });
    }
    const colorSelect = document.getElementById("member-tab-color-filter");
    if (colorSelect) {
        colorSelect.addEventListener("change", (e) => {
            memberTabColorFilter = e.target.value;
            renderMemberTab();
        });
    }
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

function renderMemberTab() {
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
