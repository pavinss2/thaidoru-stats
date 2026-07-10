let idolsList = [];
let agencySearchQuery = "";

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

    // Fetch configuration and follower datasets
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
        setupAgencySearch();
        renderAgencyTab();
    })
    .catch(err => {
        console.error("Error loading agency dashboard:", err);
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

function setupAgencySearch() {
    const agencySearch = document.getElementById("agency-search-input");
    if (agencySearch) {
        agencySearch.addEventListener("input", (e) => {
            agencySearchQuery = e.target.value.toLowerCase().trim();
            renderAgencyTab();
        });
    }
}

function renderAgencyTab() {
    const tbody = document.getElementById("agency-directory-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const agencies = [...new Set(idolsList.filter(i => i.agency).map(i => i.agency))];
    const filteredAgencies = agencies.filter(a => a.toLowerCase().includes(agencySearchQuery));

    if (filteredAgencies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 20px;">No agencies found matching "${agencySearchQuery}"</td></tr>`;
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
