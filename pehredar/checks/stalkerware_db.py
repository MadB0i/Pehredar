from __future__ import annotations

import json
import sys
from functools import lru_cache
from pathlib import Path

from ..adb import ADBConnection
from . import CheckResult

DB_PATH = Path(__file__).with_name("stalkerware_db.json")


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
def load_entries() -> list[dict]:
    """Load the manually curated stalkerware indicator DB.

    Source: Coalition Against Stalkerware + TinyCheck IOCs (curated
    snapshot — exact package IDs rotate, so family prefixes are used).
    """
    data = None
    for candidate in _candidate_db_paths():
        try:
            with open(candidate, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            break
        except (OSError, ValueError):
            continue
    if data is None:
        return []
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
    if hits:
        pkgs = [str(h["matched_package"]) for h in hits]
        labels = sorted({str(h.get("label") or h["matched_package"]) for h in hits})
        return CheckResult(
            name="Known Stalkerware Indicators",
            passed=False,
            evidence=f"Matched known stalkerware ({', '.join(labels[:5])}): {', '.join(pkgs[:10])}",
            severity="high",
            packages=pkgs,
        )
    return CheckResult(
        name="Known Stalkerware Indicators",
        passed=True,
        evidence=f"No known stalkerware matches ({len(load_entries())} indicators checked)",
        severity="info",
    )
