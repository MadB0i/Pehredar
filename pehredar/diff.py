from __future__ import annotations

import json


def load_report(path: str) -> dict:
    """Load a Pehredar JSON report from disk."""
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or "checks" not in data:
        raise ValueError(f"Not a valid Pehredar report: {path}")
    return data


def _check_index(report: dict) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for entry in report.get("checks", []):
        name = entry.get("name") or entry.get("check") or "unknown"
        index[str(name)] = entry
    return index


def _outcome(entry: dict) -> str:
    if entry.get("outcome"):
        return str(entry["outcome"])
    return "pass" if entry.get("passed") else "fail"


def _packages(entry: dict) -> set[str]:
    pkgs = entry.get("packages") or []
    return {str(p) for p in pkgs if p}


def diff_reports(old: dict, new: dict) -> dict:
    """Compare two Pehredar reports.

    Returns a JSON-serialisable diff focused on the personal-safety
    question: "since my last scan, what changed?"
    """
    old_idx = _check_index(old)
    new_idx = _check_index(new)

    old_summary = old.get("summary", {}) or {}
    new_summary = new.get("summary", {}) or {}

    old_level = str(old_summary.get("risk_level") or old.get("risk_level") or "Low")
    new_level = str(new_summary.get("risk_level") or new.get("risk_level") or "Low")
    old_score = int(old_summary.get("risk_score") if old_summary.get("risk_score") is not None else old.get("risk_score") or 0)
    new_score = int(new_summary.get("risk_score") if new_summary.get("risk_score") is not None else new.get("risk_score") or 0)

    old_serial = str(old.get("device_serial") or "")
    new_serial = str(new.get("device_serial") or "")

    check_changes: list[dict] = []
    new_failures: list[str] = []
    resolved: list[str] = []
    still_failing: list[str] = []

    for name in sorted(set(old_idx) | set(new_idx)):
        o = old_idx.get(name)
        n = new_idx.get(name)
        o_out = _outcome(o) if o else "missing"
        n_out = _outcome(n) if n else "missing"
        if o_out != n_out:
            check_changes.append(
                {
                    "name": name,
                    "old_outcome": o_out,
                    "new_outcome": n_out,
                    "old_severity": str((o or {}).get("severity") or ""),
                    "new_severity": str((n or {}).get("severity") or ""),
                }
            )
        if n_out == "fail" and o_out != "fail":
            new_failures.append(name)
        elif o_out == "fail" and n_out != "fail":
            resolved.append(name)
        elif n_out == "fail" and o_out == "fail":
            still_failing.append(name)

    old_pkgs: set[str] = set()
    new_pkgs: set[str] = set()
    for entry in old_idx.values():
        old_pkgs.update(_packages(entry))
    for entry in new_idx.values():
        new_pkgs.update(_packages(entry))

    added_pkgs = sorted(new_pkgs - old_pkgs)
    removed_pkgs = sorted(old_pkgs - new_pkgs)

    risk_changed = (old_level != new_level) or (old_score != new_score)
    has_changes = bool(check_changes or added_pkgs or removed_pkgs or risk_changed)

    return {
        "old_timestamp": old.get("timestamp") or "",
        "new_timestamp": new.get("timestamp") or "",
        "old_serial": old_serial,
        "new_serial": new_serial,
        "same_device": (not old_serial or not new_serial or old_serial == new_serial),
        "risk_level_old": old_level,
        "risk_level_new": new_level,
        "risk_score_old": old_score,
        "risk_score_new": new_score,
        "risk_score_delta": new_score - old_score,
        "risk_changed": risk_changed,
        "new_failures": sorted(new_failures),
        "resolved": sorted(resolved),
        "still_failing": sorted(still_failing),
        "new_packages": added_pkgs,
        "removed_packages": removed_pkgs,
        "check_changes": check_changes,
        "has_changes": has_changes,
    }


def format_diff_text(diff: dict) -> str:
    """Plain-language + technical summary of a diff dict."""
    lines: list[str] = []
    if not diff.get("same_device", True):
        lines.append(
            f"Warning: different devices (was {diff.get('old_serial')}, now {diff.get('new_serial')})."
        )
    if not diff.get("has_changes"):
        return "No changes since last scan. Nothing new to review."

    lines.append(
        f"Risk: {diff.get('risk_level_old')} (score {diff.get('risk_score_old')}) "
        f"-> {diff.get('risk_level_new')} (score {diff.get('risk_score_new')})."
    )
    if diff.get("new_packages"):
        lines.append(
            "New flagged apps since last scan: " + ", ".join(diff["new_packages"][:10])
        )
    if diff.get("removed_packages"):
        lines.append(
            "No longer flagged: " + ", ".join(diff["removed_packages"][:10])
        )
    if diff.get("new_failures"):
        lines.append("Newly failing checks: " + ", ".join(diff["new_failures"]))
    if diff.get("resolved"):
        lines.append("Fixed since last scan: " + ", ".join(diff["resolved"]))
    if diff.get("still_failing"):
        lines.append("Still failing: " + ", ".join(diff["still_failing"]))
    for change in diff.get("check_changes", []):
        if change["name"] not in (diff.get("new_failures", []) + diff.get("resolved", [])):
            lines.append(
                f"{change['name']}: {change['old_outcome']} -> {change['new_outcome']}"
            )
    return "\n".join(lines)
