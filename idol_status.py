"""Shared rules for which idols the scrapers should still track."""

# Core membership statuses that mean the idol has left the group.
ENDED_MEMBERSHIP_STATUSES = {"graduated", "withdrawn"}


def is_graduated(idol: dict) -> bool:
    return idol.get("status") in ("graduated", "disbanded")


def is_scrapable(idol: dict) -> bool:
    """Graduated idols stay in idols.json (and the dashboard) but are no longer scraped."""
    return idol.get("active") is not False and not is_graduated(idol)
