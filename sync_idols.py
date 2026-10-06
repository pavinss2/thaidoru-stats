"""
Sync idols.json from thaidoru-core (the source of truth for idol data).

Pulls the published static API (https://pavinss2.github.io/thaidoru-core/v1/),
keeps only groups and members of one agency (default: Catsolute) and rewrites
idols.json in the flat shape the scraper and dashboard already read.

- A member's group, color and handles come from their current membership.
  If they have no current membership in the agency, their latest one is used
  and they are marked graduated (scraper skips them, dashboard labels them).
- Fields this repo owns are kept: x_avatar_url (avatar bot) and "active": false
  (set by the avatar bot when an X account disappears).
- If core can't be reached, idols.json is left as is (it is the last snapshot).

Usage:
    python3 sync_idols.py                  # fetch from core, rewrite idols.json
    python3 sync_idols.py --dry-run        # print the diff summary only
    python3 sync_idols.py --source DIR     # read core JSON files from a local dir (e.g. thaidoru-core/src/data)
"""
import argparse
import json
import os
import sys
import urllib.request

from idol_status import ENDED_MEMBERSHIP_STATUSES

DEFAULT_API = os.environ.get("THAIDORU_CORE_API", "https://pavinss2.github.io/thaidoru-core/v1")
DEFAULT_AGENCY = "Catsolute"
CORE_FILES = ("companies", "groups", "members", "memberships")
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
# Membership statuses where the idol is still in the group (and still scraped).
CURRENT_STATUSES = {"active", "hiatus", "trainee"}


def load_core(source: str) -> dict:
    data = {}
    for name in CORE_FILES:
        if source.startswith("http"):
            url = f"{source.rstrip('/')}/{name}.json"
            req = urllib.request.Request(url, headers={"User-Agent": "thaidoru-stats-sync"})
            with urllib.request.urlopen(req, timeout=30) as res:
                data[name] = json.loads(res.read().decode("utf-8"))
        else:
            with open(os.path.join(source, f"{name}.json"), encoding="utf-8") as f:
                data[name] = json.load(f)
    return data


def sns_handle(sns: list, platform: str):
    for s in sns or []:
        if s.get("platform") == platform:
            return s.get("current_handle") or s.get("url")
    return None


def sns_field(sns: list, platform: str, field: str):
    for s in sns or []:
        if s.get("platform") == platform:
            return s.get(field)
    return None


def format_birthday(b: dict):
    if not b or not b.get("month") or not b.get("day"):
        return None
    return f"{MONTHS[b['month'] - 1]} {b['day']}"


def pick_membership(memberships: list) -> dict:
    """Current membership if there is one, otherwise the most recently ended."""
    current = [m for m in memberships if m.get("status") in CURRENT_STATUSES]
    if current:
        return current[-1]
    return max(memberships, key=lambda m: m.get("end_date") or "")


def build_entries(core: dict, agency: str) -> list:
    company = next((c for c in core["companies"] if c["name"].lower() == agency.lower()), None)
    if not company:
        raise ValueError(f"Agency '{agency}' not found in core companies")

    groups = [g for g in core["groups"] if g["company_id"] == company["id"]]
    group_by_id = {g["id"]: g for g in groups}
    members_by_id = {m["id"]: m for m in core["members"]}

    by_member = {}
    for ms in core["memberships"]:
        if ms["group_id"] in group_by_id:
            by_member.setdefault(ms["member_id"], []).append(ms)

    members = []
    for member_id, mss in by_member.items():
        ms = pick_membership(mss)
        m = members_by_id[member_id]
        g = group_by_id[ms["group_id"]]
        status = "graduated" if ms["status"] in ENDED_MEMBERSHIP_STATUSES else "active"
        members.append({
            "name": m["stage_name"],
            "core_id": m["id"],
            "group": g["name"],
            "instagram_handle": sns_handle(m["sns"], "instagram"),
            "x_handle": sns_handle(m["sns"], "x"),
            "facebook_page": sns_handle(m["sns"], "facebook"),
            "tiktok_handle": sns_handle(m["sns"], "tiktok"),
            "agency": company["name"],
            "color": (ms.get("color") or {}).get("name"),
            "type": "member",
            "status": status,
            "graduation_date": ms.get("end_date") if status == "graduated" else None,
            "birthday": format_birthday(m.get("birthday")),
            "x_avatar_url": sns_field(m["sns"], "x", "avatar_url") or "",
        })

    group_entries = []
    for g in groups:
        group_entries.append({
            "name": g["name"],
            "core_id": g["id"],
            "group": g["name"],
            "type": "group",
            "instagram_handle": sns_handle(g["sns"], "instagram"),
            "x_handle": sns_handle(g["sns"], "x"),
            "facebook_page": sns_handle(g["sns"], "facebook"),
            "tiktok_handle": sns_handle(g["sns"], "tiktok"),
            "agency": company["name"],
            "color": (g.get("theme_color") or {}).get("name"),
            "status": "disbanded" if g.get("status") == "disbanded" else "active",
            "debut_date": g.get("debut_date"),
            "spotify_handle": (g.get("music_links") or {}).get("spotify") or sns_handle(g["sns"], "spotify"),
            "x_avatar_url": sns_field(g["sns"], "x", "avatar_url") or "",
        })

    group_order = {g["name"]: i for i, g in enumerate(groups)}
    members.sort(key=lambda e: group_order[e["group"]])
    return members + group_entries


def merge(existing: list, fresh: list) -> list:
    """Keep repo-owned fields and the existing ordering; new idols go after their group."""
    old_by_name = {e["name"].lower(): e for e in existing}
    for e in fresh:
        old = old_by_name.get(e["name"].lower())
        if not old:
            continue
        if old.get("x_avatar_url"):
            e["x_avatar_url"] = old["x_avatar_url"]
        if old.get("active") is False:
            e["active"] = False
        # Keep the group's display color when core has no theme color yet.
        if e["type"] == "group" and not e.get("color") and old.get("color"):
            e["color"] = old["color"]

    old_index = {e["name"].lower(): i for i, e in enumerate(existing)}
    result = [e for e in fresh if e["name"].lower() in old_index]
    result.sort(key=lambda e: old_index[e["name"].lower()])
    for e in fresh:
        if e["name"].lower() in old_index:
            continue
        # Insert after the last entry of the same type and group.
        pos = len(result)
        for i, r in enumerate(result):
            if r["type"] == e["type"] and r["group"] == e["group"]:
                pos = i + 1
        result.insert(pos, e)
    return result


def summarize(existing: list, merged: list):
    old = {e["name"]: e for e in existing}
    new = {e["name"]: e for e in merged}
    for name in new.keys() - old.keys():
        print(f"  + added {name}")
    for name in old.keys() - new.keys():
        print(f"  - removed {name} (no longer in core; follower history is kept in the DB)")
    for name in new.keys() & old.keys():
        changed = [k for k in new[name] if k not in ("core_id",) and old[name].get(k) != new[name][k]
                   and not (k in ("status", "graduation_date") and k not in old[name] and new[name][k] in ("active", None))]
        if changed:
            print(f"  ~ {name}: " + ", ".join(f"{k} {old[name].get(k)!r} -> {new[name][k]!r}" for k in changed))


def main():
    parser = argparse.ArgumentParser(description="Sync idols.json from thaidoru-core.")
    parser.add_argument("--source", default=DEFAULT_API, help="Core API base URL or a local directory of core JSON files.")
    parser.add_argument("--agency", default=DEFAULT_AGENCY, help="Agency (company) name to keep.")
    parser.add_argument("--config", default="idols.json", help="Path to idols.json.")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero if core can't be reached.")
    args = parser.parse_args()

    existing = []
    if os.path.exists(args.config):
        with open(args.config, encoding="utf-8") as f:
            existing = json.load(f)

    try:
        core = load_core(args.source)
        fresh = build_entries(core, args.agency)
    except Exception as e:
        print(f"Warning: could not sync from core ({e}). Keeping the existing {args.config}.")
        sys.exit(1 if args.strict else 0)

    merged = merge(existing, fresh)
    graduated = [e["name"] for e in merged if e.get("status") == "graduated"]
    print(f"Core has {sum(e['type'] == 'member' for e in merged)} {args.agency} members "
          f"and {sum(e['type'] == 'group' for e in merged)} groups. Graduated: {', '.join(graduated) or 'none'}")
    summarize(existing, merged)

    if args.dry_run:
        return
    with open(args.config, "w", encoding="utf-8") as f:
        # Same format as x_image_scraper.py so the two writers don't churn the file.
        json.dump(merged, f, indent=2)
    print(f"Wrote {len(merged)} entries to {args.config}.")


if __name__ == "__main__":
    main()
