from __future__ import annotations

import re

from ..adb import ADBConnection
from . import CheckResult

SPYWARE_CHECKS: list = []

SMS_PERMS = {
    "android.permission.READ_SMS",
    "android.permission.SEND_SMS",
    "android.permission.RECEIVE_SMS",
}
CAMERA_PERMS = {"android.permission.CAMERA"}
AUDIO_PERMS = {"android.permission.RECORD_AUDIO"}
LOCATION_PERMS = {
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
}

KNOWN_ACCESSIBILITY_PACKAGES = {
    "com.google.android.marvin.talkback",
    "com.google.android.accessibility.talkback",
    "com.google.android.accessibility.voiceaccess",
    "com.google.android.accessibility.switchaccess",
    "com.google.android.apps.accessibility.voiceaccess",
    "com.android.accessibility",
    "com.google.android.marvin.voiceaccess",
    "com.samsung.android.accessibility",
    "com.samsung.accessibility",
    "com.samsung.android.app.talkback",
    "com.google.android.apps.accessibility.talkback",
}

SYSTEM_ADMIN_PREFIXES = (
    "com.android.",
    "com.google.android.gms",
    "com.google.android.apps.work",
    "com.google.android.feedback",
    "com.samsung.android.knox",
    "com.samsung.knox",
)


def list_third_party_packages(adb: ADBConnection) -> set[str]:
    stdout, _, code = adb.run_command("pm list packages -3")
    pkgs = set()
    if code == 0:
        for line in stdout.splitlines():
            line = line.strip()
            if line.startswith("package:"):
                pkgs.add(line[len("package:"):])
    return pkgs


def list_launchable_packages(adb: ADBConnection) -> tuple[set[str], bool]:
    launchable = set()
    ok = False
    commands = [
        "cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LAUNCHER",
        "pm query-activities -a android.intent.action.MAIN -c android.intent.category.LAUNCHER",
    ]
    for cmd in commands:
        stdout, _, code = adb.run_command(cmd)
        if code != 0:
            continue
        ok = True
        for line in stdout.splitlines():
            line = line.strip()
            if not line or line.startswith("No "):
                continue
            pkg = line.split("/")[0].strip()
            if pkg:
                launchable.add(pkg)
        if launchable:
            break
    return launchable, ok


def check_hidden_apps(adb: ADBConnection) -> CheckResult:
    launchable, ok = list_launchable_packages(adb)
    if not ok:
        return CheckResult(
            name="Hidden Apps (No Icon)",
            passed=True,
            evidence="Could not enumerate launchable activities on this device",
            severity="info",
        )
    third_party = list_third_party_packages(adb)
    hidden = sorted(third_party - launchable)
    if hidden:
        return CheckResult(
            name="Hidden Apps (No Icon)",
            passed=False,
            evidence=f"Third-party apps with no launcher icon: {', '.join(hidden[:10])}",
            severity="medium",
        )
    return CheckResult(
        name="Hidden Apps (No Icon)",
        passed=True,
        evidence="No third-party apps without a launcher icon",
        severity="info",
    )


def check_accessibility_services(adb: ADBConnection) -> CheckResult:
    stdout, _, code = adb.run_command("settings get secure enabled_accessibility_services")
    raw = stdout.strip()
    if code != 0 or not raw or raw == "null":
        return CheckResult(
            name="Accessibility Services",
            passed=True,
            evidence="No accessibility services enabled",
            severity="info",
        )
    services = [s.strip() for s in raw.split(":") if s.strip()]
    suspicious = []
    for svc in services:
        pkg = svc.split("/")[0].strip()
        if pkg and pkg not in KNOWN_ACCESSIBILITY_PACKAGES:
            suspicious.append(svc)
    if suspicious:
        return CheckResult(
            name="Accessibility Services",
            passed=False,
            evidence=f"Suspicious accessibility services: {', '.join(suspicious[:10])}",
            severity="high",
        )
    return CheckResult(
        name="Accessibility Services",
        passed=True,
        evidence=f"Enabled services: {raw}",
        severity="info",
    )


def parse_dpm_owners(stdout: str) -> set[str]:
    owners = set()
    for pattern in (r"Package:\s*([^\s]+)", r"(?:Device|Profile) owner:[ \t]*([^\s]+)"):
        for m in re.finditer(pattern, stdout):
            raw = m.group(1).strip()
            pkg = raw.split("/")[0].strip()
            if pkg:
                owners.add(pkg)
    return owners


def parse_active_admins(stdout: str) -> set[str]:
    admins = set()
    for m in re.finditer(r"Active admin:\s*\[([^\]]+)\]", stdout):
        raw = m.group(1).strip()
        pkg = raw.split("/")[0].strip()
        if pkg:
            admins.add(pkg)
    return admins


def check_device_admin(adb: ADBConnection) -> CheckResult:
    owners = set()
    stdout, _, code = adb.run_command("dpm list-owners")
    if code == 0:
        owners.update(parse_dpm_owners(stdout))
    admins = set()
    stdout, _, code = adb.run_command("dumpsys device_policy")
    if code == 0:
        admins.update(parse_active_admins(stdout))

    flagged = sorted(p for p in (owners | admins) if not p.startswith(SYSTEM_ADMIN_PREFIXES))
    if flagged:
        return CheckResult(
            name="Device Admin Privileges",
            passed=False,
            evidence=f"Apps with device admin/owner privileges: {', '.join(flagged[:10])}",
            severity="high",
        )
    if owners:
        return CheckResult(
            name="Device Admin Privileges",
            passed=True,
            evidence=f"Only system-owned device admins: {', '.join(sorted(owners))}",
            severity="info",
        )
    return CheckResult(
        name="Device Admin Privileges",
        passed=True,
        evidence="No device admin or owner apps detected",
        severity="info",
    )


def _has_all_sensitive(granted: set[str]) -> bool:
    return bool(
        granted & SMS_PERMS
        and granted & CAMERA_PERMS
        and granted & AUDIO_PERMS
        and granted & LOCATION_PERMS
    )


def _find_sensitive_hidden_packages(dump: str, launchable: set[str]) -> list[str]:
    suspects = []
    current_pkg = None
    granted = set()
    in_perms = False
    for line in dump.splitlines():
        if line.startswith("  Package ["):
            if current_pkg is not None and _has_all_sensitive(granted) and current_pkg not in launchable:
                suspects.append(current_pkg)
            current_pkg = line.split("[", 1)[1].split("]", 1)[0].strip()
            granted = set()
            in_perms = False
            continue
        if current_pkg is None:
            continue
        stripped = line.strip()
        if stripped.startswith("grantedPermissions:"):
            in_perms = True
            continue
        if in_perms:
            if stripped.startswith("android.permission."):
                granted.add(stripped)
            elif not stripped or ":" in stripped:
                in_perms = False
    if current_pkg is not None and _has_all_sensitive(granted) and current_pkg not in launchable:
        suspects.append(current_pkg)
    return suspects


def check_sensitive_permissions(adb: ADBConnection) -> CheckResult:
    launchable, _ = list_launchable_packages(adb)
    stdout, _, code = adb.run_command("dumpsys package")
    if code != 0 or not stdout.strip():
        return CheckResult(
            name="Sensitive Permissions (No Icon)",
            passed=True,
            evidence="Could not read package permission dump",
            severity="info",
        )
    suspects = _find_sensitive_hidden_packages(stdout, launchable)
    if suspects:
        return CheckResult(
            name="Sensitive Permissions (No Icon)",
            passed=False,
            evidence=(
                "Hidden apps holding SMS+Camera+Microphone+Location: "
                f"{', '.join(suspects[:10])}"
            ),
            severity="high",
        )
    return CheckResult(
        name="Sensitive Permissions (No Icon)",
        passed=True,
        evidence="No hidden app holds all four sensitive permission groups",
        severity="info",
    )


SPYWARE_CHECKS = [
    check_hidden_apps,
    check_accessibility_services,
    check_device_admin,
    check_sensitive_permissions,
]