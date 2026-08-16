from __future__ import annotations

from dataclasses import dataclass

from ..adb import ADBConnection


@dataclass
class CheckResult:
    name: str
    passed: bool
    evidence: str
    severity: str


SU_PATHS = [
    "/system/bin/su",
    "/system/xbin/su",
    "/sbin/su",
    "/system/sd/xbin/su",
    "/su/bin/su",
    "/magisk/.core/bin/su",
]


ROOT_PACKAGES = [
    "com.topjohnwu.magisk",
    "eu.chainfire.supersu",
    "com.koushikdutta.superuser",
    "com.noshufou.android.su",
    "com.thirdparty.superuser",
    "com.yellowes.su",
    "com.zachspong.temprootremovejb",
    "com.devadvance.rootcloak",
    "com.devadvance.rootcloakplus",
    "de.robv.android.xposed.installer",
    "com.saurik.substrate",
]


BUSYBOX_PATHS = [
    "/system/bin/busybox",
    "/system/xbin/busybox",
    "/sbin/busybox",
    "/system/sd/xbin/busybox",
    "/su/bin/busybox",
    "/magisk/.core/bin/busybox",
]


def check_su_binary(adb: ADBConnection) -> CheckResult:
    found_paths = []
    for path in SU_PATHS:
        stdout, _, code = adb.run_command(f"ls -l {path} 2>/dev/null")
        if code == 0 and stdout.strip():
            found_paths.append(f"{path} ({stdout.strip()})")

    if found_paths:
        return CheckResult(
            name="SU Binary",
            passed=False,
            evidence=f"Found su binary at: {', '.join(found_paths)}",
            severity="high",
        )
    return CheckResult(
        name="SU Binary",
        passed=True,
        evidence="No su binary found in common paths",
        severity="info",
    )


def check_root_packages(adb: ADBConnection) -> CheckResult:
    stdout, _, code = adb.run_command("pm list packages")
    if code != 0:
        return CheckResult(
            name="Root Packages",
            passed=True,
            evidence="Could not list packages",
            severity="info",
        )

    found = []
    for pkg in ROOT_PACKAGES:
        if f"package:{pkg}" in stdout:
            found.append(pkg)

    if found:
        return CheckResult(
            name="Root Packages",
            passed=False,
            evidence=f"Found root management packages: {', '.join(found)}",
            severity="high",
        )
    return CheckResult(
        name="Root Packages",
        passed=True,
        evidence="No known root management packages installed",
        severity="info",
    )


def check_build_tags(adb: ADBConnection) -> CheckResult:
    tags = adb.getprop("ro.build.tags")
    if not tags:
        return CheckResult(
            name="Build Tags",
            passed=True,
            evidence="Could not retrieve ro.build.tags",
            severity="info",
        )

    if "test-keys" in tags:
        return CheckResult(
            name="Build Tags",
            passed=False,
            evidence=f"Build signed with test-keys: {tags}",
            severity="medium",
        )
    return CheckResult(
        name="Build Tags",
        passed=True,
        evidence=f"Build signed with release-keys: {tags}",
        severity="info",
    )


def check_debuggable_secure(adb: ADBConnection) -> CheckResult:
    debuggable = adb.getprop("ro.debuggable")
    secure = adb.getprop("ro.secure")

    issues = []
    if debuggable == "1":
        issues.append("ro.debuggable=1 (debuggable build)")
    if secure == "0":
        issues.append("ro.secure=0 (insecure ADB)")

    if issues:
        return CheckResult(
            name="Debuggable/Secure Props",
            passed=False,
            evidence="; ".join(issues),
            severity="medium",
        )
    return CheckResult(
        name="Debuggable/Secure Props",
        passed=True,
        evidence=f"ro.debuggable={debuggable}, ro.secure={secure}",
        severity="info",
    )


def check_writable_system(adb: ADBConnection) -> CheckResult:
    stdout, _, code = adb.run_command("mount | grep ' /system '")
    if code != 0:
        return CheckResult(
            name="Writable /system",
            passed=True,
            evidence="/system not mounted separately or mount info unavailable",
            severity="info",
        )

    if "rw," in stdout:
        return CheckResult(
            name="Writable /system",
            passed=False,
            evidence=f"/system partition is writable: {stdout.strip()}",
            severity="high",
        )
    return CheckResult(
        name="Writable /system",
        passed=True,
        evidence=f"/system is read-only: {stdout.strip()}",
        severity="info",
    )


def check_busybox(adb: ADBConnection) -> CheckResult:
    found_paths = []
    for path in BUSYBOX_PATHS:
        stdout, _, code = adb.run_command(f"ls -l {path} 2>/dev/null")
        if code == 0 and stdout.strip():
            found_paths.append(f"{path} ({stdout.strip()})")

    if found_paths:
        return CheckResult(
            name="BusyBox Binary",
            passed=False,
            evidence=f"Found busybox at: {', '.join(found_paths)}",
            severity="medium",
        )
    return CheckResult(
        name="BusyBox Binary",
        passed=True,
        evidence="No busybox binary found in common paths",
        severity="info",
    )


def check_magisk_hide(adb: ADBConnection) -> CheckResult:
    stdout, _, code = adb.run_command("ls -la /proc/self/ns/mnt 2>/dev/null")
    if code == 0 and "mnt" in stdout:
        pass

    stdout, _, code = adb.run_command("find /proc -name 'mounts' -exec grep -l magisk {} \\; 2>/dev/null | head -5")
    magisk_mounts = stdout.strip().split("\n") if stdout.strip() else []

    stdout, _, code = adb.run_command("ls /dev/magisk* /dev/.magisk* /sbin/.magisk* 2>/dev/null")
    magisk_devs = stdout.strip().split("\n") if stdout.strip() else []

    evidence_parts = []
    if magisk_mounts:
        evidence_parts.append(f"Magisk mount namespace references: {', '.join(magisk_mounts[:3])}")
    if magisk_devs:
        evidence_parts.append(f"Magisk device nodes: {', '.join(magisk_devs[:3])}")

    if evidence_parts:
        return CheckResult(
            name="Magisk Hide Indicators",
            passed=False,
            evidence="; ".join(evidence_parts),
            severity="medium",
        )

    return CheckResult(
        name="Magisk Hide Indicators",
        passed=True,
        evidence="No obvious Magisk hide indicators detected",
        severity="info",
    )


ALL_CHECKS = [
    check_su_binary,
    check_root_packages,
    check_build_tags,
    check_debuggable_secure,
    check_writable_system,
    check_busybox,
    check_magisk_hide,
]

from . import spyware

ALL_CHECKS.extend(spyware.SPYWARE_CHECKS)


def run_all_checks(adb: ADBConnection, on_check=None) -> list[CheckResult]:
    results = []
    for check_func in ALL_CHECKS:
        slug = check_func.__name__
        if on_check is not None:
            on_check("running", slug, None)
        try:
            result = check_func(adb)
        except Exception as e:  # noqa: BLE001 - isolate per-check failures
            result = CheckResult(
                name=check_func.__name__,
                passed=False,
                evidence=f"Check failed with error: {e!s}",
                severity="high",
            )
        if on_check is not None:
            on_check("done", slug, result)
        results.append(result)
    return results