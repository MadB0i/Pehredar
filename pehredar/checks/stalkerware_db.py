from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path

from ..adb import ADBConnection
from . import CheckResult

DB_PATH = Path(__file__).with_name("stalkerware_db.json")

VALID_MATCHES = {"exact", "prefix"}
VALID_SEVERITIES = {"high", "medium", "low", "info"}


def _candidate_db_paths() -> list[Path]:
    """Locations of the indicator JSON, including PyInstaller onefile.

    In a ``--onefile`` bundle ``__file__`` points inside the temp extract
    dir, but ``--add-data`` payloads land under ``sys._MEIPASS`` — check
    both so the frozen binary never silently runs with an empty DB.
    """
    paths = [DB_PATH]
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        base = Path(meipass)
        paths.append(base / "pehredar" / "checks" / "stalkerware_db.json")
        paths.append(base / "stalkerware_db.json")
    return paths


@lru_cache(maxsize=1)
def load_db() -> dict | list | None:
    """Load the raw indicator DB document (envelope or legacy bare list)."""
    for candidate in _candidate_db_paths():
        try:
            with open(candidate, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            continue
    return None


@lru_cache(maxsize=1)
def db_meta() -> dict:
    """Envelope metadata: version / updated date / source note.

    Legacy bare-list files report version 0 with no date, which also
    makes `--check` flag them as needing migration.
    """
    data = load_db()
    if isinstance(data, dict):
        return {
            "version": int(data.get("version") or 0),
            "updated": str(data.get("updated") or ""),
            "source": str(data.get("source") or ""),
        }
    return {"version": 0, "updated": "", "source": ""}


@lru_cache(maxsize=1)
def load_entries() -> list[dict]:
    """Load the manually curated stalkerware indicator DB.

    Source: Coalition Against Stalkerware + TinyCheck IOCs (curated
    snapshot — exact package IDs rotate, so family prefixes are used).
    Accepts the versioned envelope (`{"entries": [...]}`) and legacy
    bare-list files.
    """
    data = load_db()
    if isinstance(data, dict):
        data = data.get("entries")
    if not isinstance(data, list):
        return []
    return [e for e in data if isinstance(e, dict) and e.get("package")]


def match_packages(installed: set[str]) -> list[dict]:
    """Match installed package IDs against the DB (exact + prefix)."""
    hits: list[dict] = []
    for entry in load_entries():
        pkg = str(entry.get("package") or "")
        mode = str(entry.get("match") or "exact")
        if not pkg or not installed:
            continue
        if mode == "prefix":
            matched = sorted(p for p in installed if p == pkg.rstrip(".") or p.startswith(pkg))
        else:
            matched = [pkg] if pkg in installed else []
        for m in matched:
            hits.append({**entry, "matched_package": m})
    # de-dupe by matched package, keep first (most specific) entry
    seen: dict[str, dict] = {}
    for h in hits:
        seen.setdefault(str(h["matched_package"]), h)
    return sorted(seen.values(), key=lambda h: str(h["matched_package"]))


def validate_entry(entry: dict) -> str | None:
    """Return an error string for a malformed curator entry, else None."""
    if not isinstance(entry, dict):
        return "entry is not an object"
    if not str(entry.get("package") or "").strip():
        return "entry is missing 'package'"
    if str(entry.get("match") or "exact") not in VALID_MATCHES:
        return f"bad 'match' (want one of {sorted(VALID_MATCHES)})"
    if str(entry.get("severity") or "high") not in VALID_SEVERITIES:
        return f"bad 'severity' (want one of {sorted(VALID_SEVERITIES)})"
    return None


def merge_entries(existing: list[dict], new_entries: list[dict]) -> tuple[list[dict], int]:
    """Merge curator entries in, de-duplicated by (package, match).

    Returns (merged_list, added_count). Raises ValueError on malformed input.
    """
    merged = list(existing)
    seen = {(str(e.get("package")), str(e.get("match") or "exact")) for e in merged}
    added = 0
    for entry in new_entries:
        problem = validate_entry(entry)
        if problem:
            raise ValueError(f"invalid entry {entry!r}: {problem}")
        key = (str(entry["package"]), str(entry.get("match") or "exact"))
        if key not in seen:
            seen.add(key)
            merged.append(
                {
                    "package": str(entry["package"]),
                    "match": str(entry.get("match") or "exact"),
                    "label": str(entry.get("label") or ""),
                    "source": str(entry.get("source") or ""),
                    "severity": str(entry.get("severity") or "high"),
                    "note": str(entry.get("note") or ""),
                }
            )
            added += 1
    return merged, added


def db_age_days(meta: dict | None = None, today: date | None = None) -> int | None:
    """Days since the DB's `updated` date, or None when unknown/unparseable."""
    meta = meta if meta is not None else db_meta()
    try:
        updated = date.fromisoformat(str(meta.get("updated") or ""))
    except ValueError:
        return None
    return ((today or datetime.now(timezone.utc).date()) - updated).days


def check_known_stalkerware(adb: ADBConnection) -> CheckResult:
    """Flag installed apps matching the known-stalkerware DB."""
    stdout, _, code = adb.run_command("pm list packages")
    if code != 0:
        return CheckResult(
            name="Known Stalkerware Indicators",
            passed=True,
            evidence="Could not list packages for stalkerware DB lookup",
            severity="info",
        )
    installed: set[str] = set()
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("package:"):
            installed.add(line[len("package:"):].strip())

    hits = match_packages(installed)
    meta = db_meta()
    if hits:
        pkgs = [str(h["matched_package"]) for h in hits]
        labels = sorted({str(h.get("label") or h["matched_package"]) for h in hits})
        return CheckResult(
            name="Known Stalkerware Indicators",
            passed=False,
            evidence=f"Matched known stalkerware ({', '.join(labels[:5])}): {', '.join(pkgs[:10])} [db v{meta['version']}]",
            severity="high",
            packages=pkgs,
        )
    return CheckResult(
        name="Known Stalkerware Indicators",
        passed=True,
        evidence=f"No known stalkerware matches ({len(load_entries())} indicators checked, db v{meta['version']})",
        severity="info",
    )
