from __future__ import annotations

from dataclasses import dataclass, field

from ..adb import ADBConnection, ADBError


@dataclass
class CheckResult:
    name: str
    passed: bool
    evidence: str
    severity: str
    # outcome status: "pass" | "fail" | "inconclusive"
    # "auto" derives the status from `passed` for backward compat.
    status: str = "auto"
    # structured list of flagged package IDs (used by the GUI remediation flow)
    packages: list = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.status == "auto":
            self.status = "pass" if self.passed else "fail"


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
    """Detect Magisk/Zygisk mount-hiding indicators.

    A recursive /proc scan (find ... -exec grep) is far too slow and is
    frequently blocked without root on OEM ROMs, which used to surface a
    timeout as a HIGH-severity FAIL. This version only probes a fixed set
    of quick commands with a short timeout, and reports INCONCLUSIVE (with
    the raw error as evidence) when a probe cannot produce a definitive
    answer.
    """
    probe_timeout = 2.5
    indicator_paths = [
        "/data/adb/magisk",
        "/data/adb/magisk.db",
        "/data/adb/modules",
        "/data/adb/zygisk",
        "/data/adb/stock_boot",
        "/sbin/.magisk",
        "/dev/magisk",
        "/dev/.magisk",
        "/cache/magisk",
    ]

    evidence_parts = []

    def inconclusive(detail: str) -> CheckResult:
        return CheckResult(
            name="Magisk Hide Indicators",
            passed=False,
            evidence=f"INCONCLUSIVE — {detail}",
            severity="info",
            status="inconclusive",
        )

    # 1) mount table: fast and read-only; grep returns 1 for "no match"
    try:
        stdout, stderr, code = adb.run_command("mount | grep -iE 'magisk|zygisk'", timeout=probe_timeout)
        if code == 2 or (code != 0 and code != 1 and not stdout.strip()):
            # grep errored (2) or the shell failed in an unexpected way -> no
            # definitive answer, never a FAIL.
            if code == 2:
                return inconclusive(f"mount scan error: {stderr.strip() or 'grep error'}")
            return inconclusive(f"mount scan failed with code {code}: {stderr.strip() or 'unknown error'}")
        if code == 0 and stdout.strip():
            evidence_parts.append(f"Magisk/Zygisk mount references: {stdout.strip()[:200]}")
    except ADBError as e:
        return inconclusive(str(e))

    # 2) fixed known indicator paths
    for probe in indicator_paths:
        try:
            stdout, _, code = adb.run_command(f"ls -ld {probe} 2>/dev/null", timeout=probe_timeout)
            if code == 0 and stdout.strip():
                evidence_parts.append(f"Indicator path present: {stdout.strip()}")
        except ADBError as e:
            return inconclusive(f"path probe failed ({probe}): {e}")

    # 3) magisk binary on PATH
    try:
        stdout, _, code = adb.run_command("command -v magisk 2>/dev/null", timeout=probe_timeout)
        if code == 0 and stdout.strip():
            evidence_parts.append(f"magisk binary: {stdout.strip()}")
    except ADBError as e:
        return inconclusive(f"binary probe failed: {e}")

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
        evidence="No Magisk/Zygisk mount or path indicators detected",
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


def run_all_checks(adb: ADBConnection, on_check=None, skip: set[str] | None = None) -> list[CheckResult]:
    skip = skip or set()
    results = []
    for check_func in ALL_CHECKS:
        slug = check_func.__name__
        if slug in skip:
            continue
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