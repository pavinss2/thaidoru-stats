// Graduation helpers shared by every dashboard page.
// idols.json is synced from thaidoru-core: graduated idols keep their history
// but are labelled, and hidden by default unless "Show graduated" is ticked.
const SHOW_GRADUATED_KEY = "showGraduated";

function isGraduated(idol) {
    return !!idol && (idol.status === "graduated" || idol.status === "disbanded");
}

function getShowGraduated() {
    try {
        return localStorage.getItem(SHOW_GRADUATED_KEY) === "1";
    } catch (e) {
        return false;
    }
}

function setShowGraduated(value) {
    try {
        localStorage.setItem(SHOW_GRADUATED_KEY, value ? "1" : "0");
    } catch (e) {
        // Preference just won't persist
    }
}

// True when the idol should appear in lists under the current toggle state
function passesGraduatedFilter(idol) {
    return getShowGraduated() || !isGraduated(idol);
}

function graduatedBadgeHtml(idol) {
    if (!isGraduated(idol)) return "";
    const label = idol.status === "disbanded" ? "Disbanded" : "Graduated";
    const title = idol.graduation_date ? `${label} on ${idol.graduation_date}` : label;
    return `<span class="badge-graduated" title="${title}">${label}</span>`;
}

// Wire a "Show graduated" checkbox to the shared preference
function bindGraduatedToggle(id, onChange) {
    const toggle = document.getElementById(id);
    if (!toggle) return;
    toggle.checked = getShowGraduated();
    toggle.addEventListener("change", (e) => {
        setShowGraduated(e.target.checked);
        onChange();
    });
}
