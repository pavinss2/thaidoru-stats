let idolsList = [];
let historyData = [];
let selectedAgencyName = "";

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Get Agency Name from Query String
    const urlParams = new URLSearchParams(window.location.search);
    selectedAgencyName = urlParams.get("name") || "";
    
    if (!selectedAgencyName) {
        window.location.href = "index.html";
        return;
    }

    // 2. Fetch Data
    await loadDatasets();

    // 3. Render Page Content
    renderAgencyPage();

    // 4. Initialize Autocomplete Search
    initSearchAutocomplete();
});

async function loadDatasets() {
    try {
        // Fetch idols config
        const idolsRes = await fetch("idols.json");
        idolsList = await idolsRes.json();
        
        // Fetch follower history from API or Fallback CSV
        try {
            const apiRes = await fetch("/api/stats");
            if (apiRes.ok) {
                historyData = await apiRes.json();
            } else {
                throw new Error("API stats failed");
            }
        } catch (e) {
            console.log("Stats API failed, falling back to local follower_history.csv");
            const csvRes = await fetch("follower_history.csv");
            const csvText = await csvRes.text();
            historyData = parseCSV(csvText);
        }
        
        // Inject latestStats to idolsList
        idolsList.forEach(idol => {
            idol.latestStats = {
                Instagram: 0,
                X: 0,
                Facebook: 0,
                TikTok: 0
            };
            const memberRecords = historyData.filter(r => r.Idol_Name.toLowerCase() === idol.name.toLowerCase());
            if (memberRecords.length > 0) {
                const platforms = ["Instagram", "X", "Facebook", "TikTok"];
                platforms.forEach(platform => {
                    const platformRecords = memberRecords.filter(r => r.Platform.toLowerCase() === platform.toLowerCase());
                    
                    // Sort oldest to newest
                    platformRecords.sort((a, b) => {
                        const dateComp = a.Date.localeCompare(b.Date);
                        if (dateComp !== 0) return dateComp;
                        return (a.Timestamp || "").localeCompare(b.Timestamp || "");
                    });
                    
                    // Traverse backwards to find the first non-zero count
                    let count = 0;
                    for (let i = platformRecords.length - 1; i >= 0; i--) {
                        const val = intVal(platformRecords[i].Follower_Count);
                        if (val > 0) {
                            count = val;
                            break;
                        }
                    }
                    
                    const normalizedPlatform = platformRecords.length > 0 ? platformRecords[0].Platform : platform;
                    idol.latestStats[normalizedPlatform] = count;
                });
            }
        });
    } catch (e) {
        console.error("Error loading agency datasets:", e);
    }
}

function parseCSV(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(",").map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const currentline = lines[i].split(",");
        if (currentline.length < headers.length) continue;
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentline[j].trim();
        }
        result.push(obj);
    }
    return result;
}

function intVal(val) {
    return parseInt(val || 0, 10);
}

function resolveColor(c) {
    const colMap = {
        Red: '#FF6B6B', Pink: '#FF85B3', Blue: '#5C9CFF', Yellow: '#FFD93D',
        Green: '#6BCB77', Purple: '#9D4DFF', Orange: '#FF9F43', White: '#FFFFFF',
        Black: '#2C3E50', Mint: '#2ECC71', Peach: '#F15F5F', Lavender: '#DCDDE1',
        SkyBlue: '#448AFF'
    };
    return colMap[c] || c;
}

function renderAgencyPage() {
    // Set active class on nav tab
    document.querySelectorAll(".nav-tab").forEach(tab => {
        if (tab.getAttribute("data-tab") === "agency") {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // Normalise and filter
    const agencyNameNorm = selectedAgencyName.toLowerCase();
    const agencyGroups = idolsList.filter(i => i.type === "group" && i.agency && i.agency.toLowerCase() === agencyNameNorm);
    const agencyMembers = idolsList.filter(i => i.type === "member" && i.agency && i.agency.toLowerCase() === agencyNameNorm);

    // If no groups or members, show message and return
    if (agencyGroups.length === 0 && agencyMembers.length === 0) {
        document.getElementById("header-agency-title").innerText = selectedAgencyName.toUpperCase();
        document.getElementById("agency-name").innerText = selectedAgencyName;
        document.getElementById("agency-groups-container").innerHTML = `<div class="no-suggestions-row" style="color:var(--text-secondary); text-align:center; padding: 40px 0; width:100%; grid-column: 1/-1;">No groups found for agency "${selectedAgencyName}"</div>`;
        return;
    }

    // Resolve proper agency display name (from database casing)
    let displayAgencyName = selectedAgencyName;
    const sampleItem = agencyGroups[0] || agencyMembers[0];
    if (sampleItem && sampleItem.agency) {
        displayAgencyName = sampleItem.agency;
    }

    // Render title
    document.getElementById("header-agency-title").innerText = displayAgencyName.toUpperCase();
    document.getElementById("agency-name").innerText = displayAgencyName;

    // Calculate agency totals
    let totalGroups = agencyGroups.length;
    let totalMembers = agencyMembers.length;
    let totalFollowers = 0;

    [...agencyGroups, ...agencyMembers].forEach(item => {
        totalFollowers += intVal(item.latestStats.Instagram) +
                         intVal(item.latestStats.X) +
                         intVal(item.latestStats.Facebook) +
                         intVal(item.latestStats.TikTok);
    });

    document.getElementById("agency-groups-val").innerText = totalGroups.toString();
    document.getElementById("agency-members-val").innerText = totalMembers.toString();
    document.getElementById("agency-followers-val").innerText = totalFollowers.toLocaleString();

    // Populate Roster List
    const rosterList = document.getElementById("agency-roster-list");
    rosterList.innerHTML = "";
    
    agencyMembers.forEach(m => {
        const link = document.createElement("a");
        link.href = `profile.html?name=${encodeURIComponent(m.name)}`;
        link.style.display = "flex";
        link.style.alignItems = "center";
        link.style.padding = "8px 12px";
        link.style.background = "rgba(255, 255, 255, 0.03)";
        link.style.border = "1px solid var(--border-color)";
        link.style.borderRadius = "8px";
        link.style.textDecoration = "none";
        link.style.transition = "var(--transition-smooth)";
        
        link.addEventListener("mouseenter", () => {
            link.style.background = "rgba(255, 255, 255, 0.08)";
            link.style.borderColor = "rgba(255, 255, 255, 0.2)";
        });
        link.addEventListener("mouseleave", () => {
            link.style.background = "rgba(255, 255, 255, 0.03)";
            link.style.borderColor = "var(--border-color)";
        });

        const initials = m.name.slice(0, 2).toUpperCase();
        const avatarStyle = m.x_avatar_url 
            ? `style="width: 24px; height: 24px; border-radius: 50%; background-image: url('${m.x_avatar_url}'); background-size: cover; background-position: center; margin-right: 10px; flex-shrink: 0;"`
            : `style="width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: white; margin-right: 10px; flex-shrink: 0;"`;
        
        const colorDot = m.color 
            ? `<span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${resolveColor(m.color)}; box-shadow: 0 0 6px ${resolveColor(m.color)}; margin-left: auto;"></span>`
            : '';

        link.innerHTML = `
            <div ${avatarStyle}>${m.x_avatar_url ? '' : initials}</div>
            <span style="font-size: 12px; font-weight: 600; color: white;">${m.name}</span>
            <span style="font-size: 11px; color: var(--text-secondary); margin-left: 8px;">(${m.group})</span>
            ${colorDot}
        `;
        rosterList.appendChild(link);
    });

    // Populate Group Cards
    const groupsContainer = document.getElementById("agency-groups-container");
    groupsContainer.innerHTML = "";

    agencyGroups.forEach(group => {
        const card = document.createElement("div");
        card.classList.add("member-card");
        card.style.setProperty("--card-glow-color", "#FFFFFF");
        if (group.color) {
            card.style.setProperty("--member-color", resolveColor(group.color));
        }

        const initials = group.name.slice(0, 2).toUpperCase();
        const avatarStyle = group.x_avatar_url ? `style="background-image: url('${group.x_avatar_url}'); background-size: cover; background-position: center;"` : '';

        // Formulate platform URL redirects
        const igUrl = group.instagram_handle ? (group.instagram_handle.startsWith('http') ? group.instagram_handle : `https://www.instagram.com/${group.instagram_handle}/`) : '#';
        const xUrl = group.x_handle ? (group.x_handle.startsWith('http') ? group.x_handle : `https://x.com/${group.x_handle}`) : '#';
        const fbUrl = group.facebook_page ? (group.facebook_page.startsWith('http') ? group.facebook_page : `https://www.facebook.com/${group.facebook_page}`) : '#';
        const ttUrl = group.tiktok_handle ? (group.tiktok_handle.startsWith('http') ? group.tiktok_handle : `https://www.tiktok.com/@${group.tiktok_handle}`) : '#';

        // Find members of this group
        const groupMembers = agencyMembers.filter(m => m.group.toLowerCase() === group.name.toLowerCase());
        const membersBadges = groupMembers.map(m => {
            const colorVal = m.color ? resolveColor(m.color) : 'var(--text-secondary)';
            return `<a href="profile.html?name=${encodeURIComponent(m.name)}" style="text-decoration:none;"><span style="font-size: 11px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: white; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; transition: var(--transition-smooth);" onmouseenter="this.style.background='rgba(255,255,255,0.1)'" onmouseleave="this.style.background='rgba(255,255,255,0.04)'"><span style="width: 5px; height: 5px; border-radius: 50%; background: ${colorVal};"></span>${m.name}</span></a>`;
        }).join(" ");

        card.innerHTML = `
            <div class="card-top" onclick="window.location.href='profile.html?name=${encodeURIComponent(group.name)}'">
                <div class="member-avatar" ${avatarStyle}>${group.x_avatar_url ? '' : initials}</div>
                <div class="member-meta">
                    <span class="member-name">
                        ${group.name}
                        ${group.color ? '<span class="color-dot"></span>' : ''}
                    </span>
                    <span class="member-tagline">
                        <span class="badge-official">Official Channel</span>
                    </span>
                </div>
            </div>
            
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">Group Roster (${groupMembers.length}):</span>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${membersBadges || '<span style="font-size: 11px; color: var(--text-muted);">No members listed</span>'}
                </div>
            </div>
            
            <div class="card-platforms">
                <a href="${igUrl}" target="_blank" class="platform-metric" ${group.instagram_handle ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                    <span class="platform-name instagram-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-instagram" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"></path></svg></span>
                    <span class="platform-val">${group.latestStats.Instagram.toLocaleString()}</span>
                </a>
                <a href="${xUrl}" target="_blank" class="platform-metric" ${group.x_handle ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                    <span class="platform-name x-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-x-twitter-square" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm297.1 84L257.3 234.6 379.4 396H283.8L209 298.1 123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5L313.6 116h47.5zM323.3 367.6L153.4 142.9H125.1L296.9 367.6h26.3z"></path></svg></span>
                    <span class="platform-val">${group.latestStats.X.toLocaleString()}</span>
                </a>
                <a href="${fbUrl}" target="_blank" class="platform-metric" ${group.facebook_page ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                    <span class="platform-name facebook-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-facebook" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z"></path></svg></span>
                    <span class="platform-val">${group.latestStats.Facebook.toLocaleString()}</span>
                </a>
                <a href="${ttUrl}" target="_blank" class="platform-metric" ${group.tiktok_handle ? '' : 'style="pointer-events: none; opacity: 0.4;"'}>
                    <span class="platform-name tiktok-label"><svg aria-hidden="true" class="e-font-icon-svg e-fab-tiktok" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z"></path></svg></span>
                    <span class="platform-val">${group.latestStats.TikTok.toLocaleString()}</span>
                </a>
            </div>
        `;
        groupsContainer.appendChild(card);
    });
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

    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.innerHTML = "";
            suggestionsBox.classList.remove("active");
            highlightedIndex = -1;
        }
    });
}
