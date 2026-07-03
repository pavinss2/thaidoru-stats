let idolsList = [];
let historyData = [];
let selectedMemberName = "";
let memberProfile = null;

// Slicing parameters
let startDate = "";
let endDate = "";
let chartPlatform = "all"; // 'all', 'instagram', 'x', 'facebook', 'tiktok'
let chartType = "line";    // 'line', 'bar'
let growthChart = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Get Member Name from Query String
    const urlParams = new URLSearchParams(window.location.search);
    selectedMemberName = urlParams.get("name") || "";
    
    if (!selectedMemberName) {
        window.location.href = "index.html";
        return;
    }

    // 2. Fetch Data
    await loadDatasets();

    // 3. Resolve Member
    memberProfile = idolsList.find(i => i.name.toLowerCase() === selectedMemberName.toLowerCase());
    if (!memberProfile) {
        alert(`Member "${selectedMemberName}" not found in directory.`);
        window.location.href = "index.html";
        return;
    }

    // 4. Render Profile Info Panel
    renderProfilePanel();

    // 5. Initialize Date Range Filters
    initDateFilters();

    // 6. Initialize Events & Control Toggles
    initControls();

    // 7. Render Chart
    renderProfileChart();

    // 8. Initialize Autocomplete Search
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
        
        // Inject latestStats to idolsList using the same logic as the homepage (fallback to latest non-zero count)
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
                    
                    // Map to normalized platform casing key
                    const normalizedPlatform = platformRecords.length > 0 ? platformRecords[0].Platform : platform;
                    idol.latestStats[normalizedPlatform] = count;
                });
            }
        });
    } catch (e) {
        console.error("Error loading profile datasets:", e);
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

function renderProfilePanel() {
    const name = memberProfile.name;
    const isGroup = memberProfile.type === "group";
    const groupColor = resolveColor(memberProfile.color || "purple");
    
    // Set colors
    const sidebar = document.getElementById("profile-card");
    sidebar.style.setProperty("--member-color", groupColor);
    
    // Header page text
    document.getElementById("header-member-title").innerText = name.toUpperCase();
    document.getElementById("header-member-subtitle").innerText = isGroup ? "Official Group Channel Analytics" : `${memberProfile.group}`;
    
    // Avatar
    const avatar = document.getElementById("profile-avatar");
    const initials = name.slice(0, 2).toUpperCase();
    if (memberProfile.x_avatar_url) {
        avatar.style.backgroundImage = `url('${memberProfile.x_avatar_url}')`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.innerText = "";
    } else {
        avatar.style.backgroundImage = "none";
        avatar.innerText = initials;
    }
    
    // Title Name
    document.getElementById("profile-name").innerHTML = `
        ${name}
        ${memberProfile.color ? '<span class="color-dot"></span>' : ''}
    `;
    
    // Tags
    const badges = document.getElementById("profile-badges");
    badges.innerHTML = isGroup 
        ? '<span class="badge-official">Official Channel</span>'
        : `<a href="profile.html?name=${encodeURIComponent(memberProfile.group)}" class="group-badge-link" style="text-decoration:none;"><span class="group-badge" style="background: rgba(255,255,255,0.06); font-size: 11px; padding: 4px 10px; border-radius: 8px; cursor: pointer; transition: var(--transition-smooth);">${memberProfile.group}</span></a>`;
        
    // Metadata Details
    document.getElementById("profile-group-val").innerText = isGroup ? name : memberProfile.group;
    document.getElementById("profile-agency-val").innerText = memberProfile.agency || "Catsolute";
    document.getElementById("profile-color-val").innerText = memberProfile.color || "None";
    
    // Debut date
    const debutItem = document.getElementById("profile-debut-item");
    const debutVal = document.getElementById("profile-debut-val");
    if (debutItem && debutVal) {
        if (memberProfile.debut_date) {
            debutVal.innerText = memberProfile.debut_date;
            debutItem.style.display = "flex";
        } else {
            debutItem.style.display = "none";
        }
    }
    
    // List platform buttons
    const linksList = document.getElementById("profile-links-list");
    linksList.innerHTML = "";
    
    const platforms = [
        { key: "Instagram", handle: memberProfile.instagram_handle, url: memberProfile.instagram_handle ? (memberProfile.instagram_handle.startsWith('http') ? memberProfile.instagram_handle : `https://www.instagram.com/${memberProfile.instagram_handle}/`) : '#' },
        { key: "X", handle: memberProfile.x_handle, url: memberProfile.x_handle ? (memberProfile.x_handle.startsWith('http') ? memberProfile.x_handle : `https://x.com/${memberProfile.x_handle}`) : '#' },
        { key: "Facebook", handle: memberProfile.facebook_page, url: memberProfile.facebook_page ? (memberProfile.facebook_page.startsWith('http') ? memberProfile.facebook_page : `https://www.facebook.com/${memberProfile.facebook_page}`) : '#' },
        { key: "TikTok", handle: memberProfile.tiktok_handle, url: memberProfile.tiktok_handle ? (memberProfile.tiktok_handle.startsWith('http') ? memberProfile.tiktok_handle : `https://www.tiktok.com/@${memberProfile.tiktok_handle}`) : '#' },
    ];
    
    platforms.forEach(p => {
        const link = document.createElement("a");
        link.href = p.url;
        link.target = "_blank";
        link.classList.add("platform-metric");
        if (!p.handle) {
            link.style.pointerEvents = "none";
            link.style.opacity = "0.4";
        }
        
        let iconSvg = "";
        if (p.key === "Instagram") {
            iconSvg = `<svg aria-hidden="true" class="e-font-icon-svg e-fab-instagram" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;fill:currentColor;"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"></path></svg>`;
        } else if (p.key === "X") {
            iconSvg = `<svg aria-hidden="true" class="e-font-icon-svg e-fab-x-twitter" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;fill:currentColor;"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"></path></svg>`;
        } else if (p.key === "Facebook") {
            iconSvg = `<svg aria-hidden="true" class="e-font-icon-svg e-fab-facebook-f" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;fill:currentColor;"><path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z"></path></svg>`;
        } else if (p.key === "TikTok") {
            iconSvg = `<svg aria-hidden="true" class="e-font-icon-svg e-fab-tiktok" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;fill:currentColor;"><path d="M448 209.91a210.06 210.06 0 0 1-122.77-39.25v178.72A162.55 162.55 0 1 1 185 188.31v89.89a72.69 72.69 0 1 0 72.23 72.42V0h90.87a208.87 208.87 0 0 0 41 93.9 208.56 208.56 0 0 0 58.9 51.6z"></path></svg>`;
        }
        
        const count = memberProfile.latestStats[p.key];
        link.innerHTML = `
            <span class="platform-name" style="display:flex;align-items:center;gap:6px;">${iconSvg} ${p.key}</span>
            <span class="platform-val">${p.handle ? count.toLocaleString() : '-'}</span>
        `;
        linksList.appendChild(link);
    });

    // Render Group Members List if this profile is a Group channel
    const membersContainer = document.getElementById("group-members-container");
    const membersList = document.getElementById("group-members-list");
    
    if (membersContainer && membersList) {
        if (isGroup) {
            const groupMembers = idolsList.filter(i => i.type === "member" && i.group.toLowerCase() === name.toLowerCase());
            
            membersList.innerHTML = "";
            groupMembers.forEach(m => {
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
                    ${colorDot}
                `;
                membersList.appendChild(link);
            });
            
            membersContainer.style.display = "block";
        } else {
            membersContainer.style.display = "none";
        }
    }

    // Render Spotify Iframe Player if spotify_handle exists
    const spotifyContainer = document.getElementById("spotify-container");
    const spotifyWrapper = document.getElementById("spotify-player-wrapper");
    if (spotifyContainer && spotifyWrapper) {
        if (memberProfile.spotify_handle) {
            const match = memberProfile.spotify_handle.match(/\/artist\/([a-zA-Z0-9]+)/);
            const artistId = match ? match[1] : null;
            if (artistId) {
                spotifyWrapper.innerHTML = `
                    <iframe style="border-radius:12px" 
                        src="https://open.spotify.com/embed/artist/${artistId}?utm_source=generator&theme=0" 
                        width="100%" 
                        height="352" 
                        frameBorder="0" 
                        allowfullscreen="" 
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                        loading="lazy">
                    </iframe>`;
                spotifyContainer.style.display = "block";
            } else {
                spotifyContainer.style.display = "none";
            }
        } else {
            spotifyContainer.style.display = "none";
        }
    }
}

function initDateFilters() {
    const dates = [...new Set(historyData.map(r => r.Date))].sort();
    if (dates.length === 0) return;
    
    startDate = dates[0];
    endDate = dates[dates.length - 1];

    const startSelect = document.getElementById("start-date-select");
    const endSelect = document.getElementById("end-date-select");

    startSelect.innerHTML = "";
    endSelect.innerHTML = "";

    dates.forEach(d => {
        const optStart = document.createElement("option");
        optStart.value = d;
        optStart.text = d;
        startSelect.appendChild(optStart);

        const optEnd = document.createElement("option");
        optEnd.value = d;
        optEnd.text = d;
        endSelect.appendChild(optEnd);
    });

    startSelect.value = startDate;
    endSelect.value = endDate;

    startSelect.addEventListener("change", (e) => {
        startDate = e.target.value;
        renderProfileChart();
    });

    endSelect.addEventListener("change", (e) => {
        endDate = e.target.value;
        renderProfileChart();
    });
}

function initControls() {
    // 1. Chart Type (Line / Bar) Toggle
    const typeButtons = document.querySelectorAll("#chart-type-toggle .toggle-btn");
    typeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            typeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            chartType = btn.getAttribute("data-type");
            
            const startWrapper = document.getElementById("start-date-wrapper");
            const endWrapper = document.getElementById("end-date-wrapper");
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
            renderProfileChart();
        });
    });

    // 2. Platform Filter Icon Row Click Handlers
    const platformButtons = document.querySelectorAll("#platform-filter-row .platform-icon-btn");
    platformButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            platformButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            chartPlatform = btn.getAttribute("data-platform");
            renderProfileChart();
        });
    });
}

function renderProfileChart() {
    const ctx = document.getElementById("growthChart").getContext("2d");
    if (growthChart) {
        growthChart.destroy();
    }

    const platformMapping = {
        all: "All Platforms",
        instagram: "Instagram",
        x: "X",
        facebook: "Facebook",
        tiktok: "TikTok"
    };

    // Slice historical dates by Date Range selection
    const fullDates = [...new Set(historyData.map(r => r.Date))].sort();
    const startIndex = fullDates.indexOf(startDate);
    const endIndex = fullDates.indexOf(endDate);
    const dates = fullDates.slice(startIndex !== -1 ? startIndex : 0, (endIndex !== -1 ? endIndex : fullDates.length - 1) + 1);

    const historyList = historyData.filter(r => r.Idol_Name.toLowerCase() === memberProfile.name.toLowerCase());
    
    // Set Header Text
    const activePlatformName = platformMapping[chartPlatform];
    document.getElementById("chart-title").innerHTML = `${memberProfile.name} (${activePlatformName})`;
    document.getElementById("chart-sub").innerText = `Followers`;
    if (window.lucide) window.lucide.createIcons();

    let datasets = [];
    let labels = [];

    const colors = {
        Instagram: "#FF5A79",
        X: "#E1E1E6",
        Facebook: "#007AFF",
        TikTok: "#34C759"
    };

    if (chartType === "line") {
        labels = dates;
        const platformsToPlot = chartPlatform === "all" 
            ? ["Instagram", "X", "Facebook", "TikTok"] 
            : [platformMapping[chartPlatform]];

        platformsToPlot.forEach(plat => {
            const dataPoints = [];
            dates.forEach(d => {
                const rec = historyList.find(r => r.Date === d && r.Platform === plat);
                dataPoints.push(rec ? intVal(rec.Follower_Count) : null);
            });

            // Check if there is data
            if (dataPoints.some(v => v !== null)) {
                datasets.push({
                    label: plat,
                    data: dataPoints,
                    borderColor: colors[plat] || "#9D4DFF",
                    backgroundColor: colors[plat] + "20",
                    borderWidth: 3,
                    pointBackgroundColor: colors[plat],
                    pointBorderColor: "rgba(255,255,255,0.4)",
                    pointHoverRadius: 7,
                    tension: 0.35,
                    fill: false,
                    spanGaps: true
                });
            }
        });
    } else {
        // Bar Chart (latest standings counts)
        const targetDate = fullDates[fullDates.length - 1]; // Latest date
        labels = chartPlatform === "all" 
            ? ["Instagram", "X", "Facebook", "TikTok"] 
            : [platformMapping[chartPlatform]];

        const dataPoints = [];
        labels.forEach(lbl => {
            const rec = historyList.find(r => r.Date === targetDate && r.Platform === lbl);
            dataPoints.push(rec ? intVal(rec.Follower_Count) : 0);
        });

        const backgroundColors = labels.map(lbl => colors[lbl] + "B3");
        const borderColors = labels.map(lbl => colors[lbl]);

        datasets.push({
            label: "Followers",
            data: dataPoints,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 2,
            borderRadius: 8
        });
    }

    const valueLabelPlugin = {
        id: 'valueLabelPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.font = 'bold 11px Outfit, sans-serif';
            ctx.textAlign = 'center';
            
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                if (!meta.visible) return;
                
                if (meta.type === 'bar') {
                    meta.data.forEach((bar, index) => {
                        const dataVal = dataset.data[index];
                        if (dataVal !== null && dataVal !== undefined && dataVal > 0) {
                            let formattedVal = new Intl.NumberFormat().format(dataVal);
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillText(formattedVal, bar.x, bar.y - 8);
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
                            let formattedVal = new Intl.NumberFormat().format(dataVal);
                            ctx.fillStyle = dataset.borderColor || '#E1E1E6';
                            ctx.fillText(formattedVal, point.x, point.y - 8);
                        }
                    });
                }
            });
            ctx.restore();
        }
    };

    growthChart = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        plugins: [valueLabelPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 18,
                    bottom: 5,
                    left: 5,
                    right: 15
                }
            },
            plugins: {
                legend: {
                    display: chartPlatform === "all" && chartType === "line",
                    position: 'top',
                    labels: {
                        color: 'white',
                        font: {
                            family: 'Outfit',
                            size: 12
                        },
                        boxWidth: 15,
                        boxHeight: 4,
                        padding: 15,
                        usePointStyle: false
                    }
                },
                tooltip: {
                    backgroundColor: '#16161A',
                    titleColor: 'white',
                    titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
                    bodyColor: '#A0A0B0',
                    bodyFont: { family: 'Outfit', size: 12 },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            return ` ${context.dataset.label}: ${val.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)',
                        borderColor: 'transparent'
                    },
                    ticks: {
                        color: '#8E8E9F',
                        font: { family: 'Outfit', size: 11 }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'transparent'
                    },
                    ticks: {
                        color: '#8E8E9F',
                        font: { family: 'Outfit', size: 11 },
                        precision: 0,
                        callback: function(value) {
                            if (value % 1 === 0) {
                                return new Intl.NumberFormat().format(value);
                            }
                            return null;
                        }
                    }
                }
            }
        }
    });
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
