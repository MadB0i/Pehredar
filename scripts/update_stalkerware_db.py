"""Keep the curated stalkerware indicator DB fresh without code changes.

The DB (`pehredar/checks/stalkerware_db.json`) is a versioned envelope::

    {"version": 1, "updated": "2026-09-23", "source": "...", "entries": [...]}

Usage (from the repo root)::

    python scripts/update_stalkerware_db.py --check
    python scripts/update_stalkerware_db.py --check --max-age-days 90
    python scripts/update_stalkerware_db.py --merge curator-additions.json

Workflow: a curator reviews upstream sources (Coalition Against Stalkerware,
TinyCheck IOCs), exports new indicators as a JSON list with the same entry
schema (package/match/label/source/severity/note), and merges them in.
``--merge`` de-duplicates by (package, match), bumps ``version`` and stamps
today's date. ``--check`` exits 0 when fresh, 2 when the DB is older than
``--max-age-days`` (default 90) — CI uses it as a non-blocking reminder.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from pehredar.checks.stalkerware_db import (
    db_age_days,
    merge_entries,
)

DEFAULT_DB = REPO_ROOT / "pehredar" / "checks" / "stalkerware_db.json"


def cmd_check(db_path: Path, max_age_days: int) -> int:
    try:
        with open(db_path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"Error reading DB {db_path}: {e}")
        return 1
    entries = doc.get("entries") if isinstance(doc, dict) else doc
    if not isinstance(entries, list):
        print("STALE: DB has no indicator list — migrate to the versioned envelope.")
        return 2
    version = int(doc.get("version") or 0) if isinstance(doc, dict) else 0
    updated = str(doc.get("updated") or "") if isinstance(doc, dict) else ""
    age = db_age_days({"updated": updated})
    print(f"version:  v{version}")
    print(f"updated:  {updated or 'unknown'}")
    print(f"entries:  {len(entries)}")
    print(f"age:      {age if age is not None else 'unknown'} days (limit {max_age_days})")
    if age is None:
        print("STALE: DB has no parseable updated date — migrate to the versioned envelope.")
        return 2
    if age > max_age_days:
        print(f"STALE: DB is {age} days old — review upstream IOCs and --merge new indicators.")
        return 2
    print("FRESH")
    return 0


def cmd_merge(db_path: Path, curator_path: Path) -> int:
    try:
        with open(db_path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"Error reading DB {db_path}: {e}")
        return 1
    try:
        with open(curator_path, "r", encoding="utf-8") as fh:
            incoming = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"Error reading curator file {curator_path}: {e}")
        return 1
    if isinstance(doc, list):  # legacy bare list
        doc = {"version": 0, "updated": "", "source": "", "entries": doc}
    if not isinstance(doc, dict) or not isinstance(incoming, list):
        print("Error: DB must be an envelope object and curator file a JSON list.")
        return 1
    try:
        merged, added = merge_entries(doc.get("entries") or [], incoming)
    except ValueError as e:
        print(f"Error: {e}")
        return 1
    doc["entries"] = merged
    doc["version"] = int(doc.get("version") or 0) + 1
    doc["updated"] = str(datetime.now(timezone.utc).date())
    with open(db_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
    print(f"merged {added} new indicator(s); DB is now v{doc['version']} ({len(merged)} entries)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Check freshness / merge curator additions for the stalkerware DB.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to stalkerware_db.json")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Report freshness (exit 2 when stale)")
    group.add_argument("--merge", metavar="CURATOR_JSON", help="Merge a curator JSON list into the DB")
    parser.add_argument("--max-age-days", type=int, default=90, help="Staleness limit for --check")
    args = parser.parse_args()
    if args.check:
        return cmd_check(Path(args.db), args.max_age_days)
    return cmd_merge(Path(args.db), Path(args.merge))


if __name__ == "__main__":
    raise SystemExit(main())
