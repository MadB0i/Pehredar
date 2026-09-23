"""Safety-first presentation layer (content only — no behavior change).

Two pure functions, shared by the CLI report and the desktop GUI:

- :func:`plain_summary` — a 2–3 sentence plain-language summary generated
  from the actual check results (never a static string), calibrated to the
  real severity: reassuring for Low, neutral for Medium, calm-but-clear for
  High. No jargon, nothing alarmist.
- :func:`safety_gate` — True only when the known-stalkerware check itself
  failed. Only a genuine stalkerware match routes through the safety-first
  screen; every other finding — whatever its severity — goes straight to
  the normal flow.

Rationale: tech-safety practice (documented e.g. by NNEDV's Safety Net
project) consistently warns that immediately deleting suspected monitoring
software can alert someone with access to the device or accounts — so the
tool must never assume removal is automatically the safe next step. See
docs/for-developers.md ("Why safety-first") for the full design note.
"""

from __future__ import annotations

from .checks import CheckResult
from .checks.stalkerware_db import load_entries
from .scoring import calculate_risk_score

STALKERWARE_CHECK = "Known Stalkerware Indicators"

# Display name (as stored in reports) -> check slug.
SLUG_BY_NAME = {
    "SU Binary": "check_su_binary",
    "Root Packages": "check_root_packages",
    "Build Tags": "check_build_tags",
    "Debuggable/Secure Props": "check_debuggable_secure",
    "Writable /system": "check_writable_system",
    "BusyBox Binary": "check_busybox",
    "Magisk Hide Indicators": "check_magisk_hide",
    "Hidden Apps (No Icon)": "check_hidden_apps",
    "Accessibility Services": "check_accessibility_services",
    "Device Admin Privileges": "check_device_admin",
    "Sensitive Permissions (No Icon)": "check_sensitive_permissions",
    "Known Stalkerware Indicators": "check_known_stalkerware",
}

# Slug -> plain-language phrase used when naming a finding. Deliberately
# avoids tool names (Magisk), paths (/system) and ADB vocabulary.
CHECK_BLURBS = {
    "check_su_binary": "a hidden tool that can take full control of the phone",
    "check_root_packages": "an app designed to bypass the phone's security",
    "check_build_tags": "phone software that was not officially signed",
    "check_debuggable_secure": "deep computer-access settings left open",
    "check_writable_system": "a protected system area left unlocked",
    "check_busybox": "a toolkit often installed when modifying phones",
    "check_magisk_hide": "a tool for hiding such modifications",
    "check_hidden_apps": "apps hiding their icon from the app list",
    "check_accessibility_services": "an app able to read the screen and what is typed",
    "check_device_admin": "an app with special control over the phone",
    "check_sensitive_permissions": (
        "a hidden app able to read messages, camera, microphone and location together"
    ),
    "check_known_stalkerware": "an app matching known monitoring software",
}


def _failed(results: list[CheckResult]) -> list[CheckResult]:
    return [r for r in results if r.status == "fail"]


def _describe(fails: list[CheckResult]) -> str:
    """Name failed areas in plain language, capped to keep it readable."""
    blurbs = []
    for r in fails:
        blurb = CHECK_BLURBS.get(SLUG_BY_NAME.get(r.name, ""), "")
        if blurb and blurb not in blurbs:
            blurbs.append(blurb)
    if not blurbs:
        return f"{len(fails)} area{'s' if len(fails) != 1 else ''}"
    if len(blurbs) <= 3:
        return "; ".join(blurbs)
    return "; ".join(blurbs[:3]) + f"; and {len(blurbs) - 3} more area(s)"


def stalkerware_labels(packages: list[str]) -> list[str]:
    """Human labels for matched packages, looked up in the indicator DB."""
    labels = set()
    for pkg in packages:
        for entry in load_entries():
            needle = str(entry.get("package") or "")
            mode = str(entry.get("match") or "exact")
            if not needle:
                continue
            if (mode == "prefix" and (pkg == needle.rstrip(".") or pkg.startswith(needle))) or (
                mode != "prefix" and pkg == needle
            ):
                labels.add(str(entry.get("label") or pkg))
    return sorted(labels)


def safety_gate(results: list[CheckResult]) -> bool:
    """Whether findings must pass through the safety-first screen.

    True only for a genuine known-stalkerware match — deliberately NOT for
    severity in general. A rooted phone (SU binary, Magisk traces, …) is a
    serious but different situation from suspected monitoring by another
    person, and routing everything through the safety screen would train
    users to click past it.
    """
    return any(r.status == "fail" and r.name == STALKERWARE_CHECK for r in results)


def plain_summary(results: list[CheckResult]) -> dict:
    """Build ``{"level", "headline", "body"}`` from the actual results."""
    level, _ = calculate_risk_score(results)
    total = len(results)
    fails = _failed(results)
    inconclusive = sum(1 for r in results if r.status == "inconclusive")

    stalker_fails = [r for r in fails if r.name == STALKERWARE_CHECK]
    caveat = (
        f" {inconclusive} check{'s' if inconclusive != 1 else ''} could not finish, "
        "so this picture may be incomplete — a re-scan on a steady connection can help."
        if inconclusive
        else ""
    )

    if not fails:
        return {
            "level": level,
            "headline": "No signs of tampering found.",
            "body": (
                f"Pehredar ran {total} checks on this device and found nothing that looks "
                "like hacking, rooting or hidden monitoring software. That is reassuring. "
                "Still, no scan can prove a phone is completely safe — if something feels "
                f"wrong, trust that feeling and check again later.{caveat}"
            ),
        }

    if stalker_fails:
        labels = []
        for r in stalker_fails:
            labels.extend(stalkerware_labels(list(r.packages)))
        labels = sorted(set(labels))
        who = f" ({', '.join(labels)})" if labels else ""
        return {
            "level": level,
            "headline": "This phone may be monitored by someone else.",
            "body": (
                f"An app on this phone matches known monitoring software{who}. "
                "Such apps can silently report messages, location and more to whoever "
                "installed them. Removing it could alert that person, so read the safety "
                f"guidance in the Review step before deciding what to do.{caveat}"
            ),
        }

    high = [r for r in fails if r.severity == "high"]
    if high:
        return {
            "level": level,
            "headline": "This phone shows strong signs of tampering.",
            "body": (
                f"Pehredar found serious issues in {len(high)} area{'s' if len(high) != 1 else ''}: "
                f"{_describe(high)}. This usually means the phone was modified to allow full "
                "control over it. That alone does not prove another person is monitoring you, "
                f"but treat the device as untrusted until you understand each finding.{caveat}"
            ),
        }

    return {
        "level": level,
        "headline": "A few things are worth a look.",
        "body": (
            f"{len(fails)} of {total} checks returned warnings: {_describe(fails)}. "
            "These suggest the phone's software may have been changed, but on their own "
            "they do not show that someone else is watching this device. Review each "
            f"finding below and decide what, if anything, to do about it.{caveat}"
        ),
    }


def attach_safety(summary: dict, results: list[CheckResult]) -> dict:
    """Add the safety layer to a report/CLI summary dict (in place)."""
    summary["safety_gate"] = safety_gate(results)
    summary["plain"] = plain_summary(results)
    return summary
