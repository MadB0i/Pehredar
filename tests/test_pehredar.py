from types import SimpleNamespace

import pytest

from pehredar.adb import (
    ADBConnection,
    ADBError,
    NoDeviceError,
    UnauthorizedError,
)
from pehredar.checks import (
    ALL_CHECKS,
    CheckResult,
    check_build_tags,
    check_busybox,
    check_debuggable_secure,
    check_magisk_hide,
    check_root_packages,
    check_su_binary,
    check_writable_system,
    run_all_checks,
)
from pehredar.scoring import calculate_risk_score, get_summary


def fake_result(stdout="", stderr="", returncode=0):
    return SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)


class FakeADB:
    def __init__(self):
        self.props = {}
        self.responses = {}

    def run_command(self, command, timeout=30):
        for key, value in self.responses.items():
            if command.startswith(key):
                return value.stdout, value.stderr, value.returncode
        return fake_result().stdout, fake_result().stderr, fake_result().returncode

    def getprop(self, prop):
        return self.props.get(prop, "")


@pytest.fixture
def adb():
    return FakeADB()


def test_list_devices_parses_output(mocker):
    conn = ADBConnection()
    mocker.patch.object(conn, "_run_adb", return_value=fake_result("List of devices attached\nABC123\tdevice\n"))
    devices = conn.list_devices()
    assert len(devices) == 1
    assert devices[0].serial == "ABC123"
    assert devices[0].status == "device"


def test_connect_no_devices(mocker):
    conn = ADBConnection()
    mocker.patch.object(conn, "_run_adb", return_value=fake_result("List of devices attached\n\n"))
    with pytest.raises(NoDeviceError):
        conn.connect()


def test_connect_unauthorized(mocker):
    conn = ADBConnection()
    mocker.patch.object(conn, "_run_adb", return_value=fake_result("List of devices attached\nABC123\tunauthorized\n"))
    with pytest.raises(UnauthorizedError):
        conn.connect()


def test_connect_success(mocker):
    conn = ADBConnection()
    mocker.patch.object(conn, "_run_adb", return_value=fake_result("List of devices attached\nABC123\tdevice\n"))
    assert conn.connect() == "ABC123"


def test_adb_missing_raises_adb_error(mocker):
    conn = ADBConnection()
    mocker.patch("pehredar.adb.subprocess.run", side_effect=FileNotFoundError)
    with pytest.raises(ADBError, match="ADB not found"):
        conn.list_devices()


def test_check_su_binary_found(adb):
    adb.responses["ls -l /system/bin/su"] = fake_result("-rwxr-xr-x root root 26264 2024-01-01 10:00 /system/bin/su")
    result = check_su_binary(adb)
    assert not result.passed
    assert result.severity == "high"
    assert "/system/bin/su" in result.evidence


def test_check_su_binary_clean(adb):
    result = check_su_binary(adb)
    assert result.passed


def test_check_root_packages_found(adb):
    adb.responses["pm list packages"] = fake_result("package:com.topjohnwu.magisk\npackage:com.android.chrome\n")
    result = check_root_packages(adb)
    assert not result.passed
    assert "magisk" in result.evidence


def test_check_root_packages_clean(adb):
    adb.responses["pm list packages"] = fake_result("package:com.android.chrome\n")
    result = check_root_packages(adb)
    assert result.passed


def test_check_build_tags_test_keys(adb):
    adb.props["ro.build.tags"] = "test-keys"
    result = check_build_tags(adb)
    assert not result.passed
    assert result.severity == "medium"


def test_check_build_tags_release_keys(adb):
    adb.props["ro.build.tags"] = "release-keys"
    result = check_build_tags(adb)
    assert result.passed


def test_check_debuggable_secure_flags(adb):
    adb.props["ro.debuggable"] = "1"
    adb.props["ro.secure"] = "0"
    result = check_debuggable_secure(adb)
    assert not result.passed


def test_check_writable_system_rw(adb):
    adb.responses["mount | grep ' /system '"] = fake_result(
        "/dev/block/mmcblk0p24 /system ext4 rw,seclabel,relatime 0 0"
    )
    result = check_writable_system(adb)
    assert not result.passed
    assert result.severity == "high"


def test_check_writable_system_ro(adb):
    adb.responses["mount | grep ' /system '"] = fake_result(
        "/dev/block/mmcblk0p24 /system ext4 ro,seclabel,relatime 0 0"
    )
    result = check_writable_system(adb)
    assert result.passed


def test_check_busybox_found(adb):
    adb.responses["ls -l /system/xbin/busybox"] = fake_result("-rwxr-xr-x root root 1000000 /system/xbin/busybox")
    result = check_busybox(adb)
    assert not result.passed
    assert result.severity == "medium"


def test_check_busybox_clean(adb):
    result = check_busybox(adb)
    assert result.passed


def test_check_magisk_hide_found(adb):
    adb.responses["ls -ld /data/adb/magisk"] = fake_result("-rwxr-xr-x root root /data/adb/magisk")
    result = check_magisk_hide(adb)
    assert not result.passed
    assert result.status == "fail"
    assert result.severity == "medium"


def test_check_magisk_hide_clean(adb):
    result = check_magisk_hide(adb)
    assert result.passed
    assert result.status == "pass"


class TimeoutADB:
    def __init__(self, trigger):
        self.trigger = trigger

    def run_command(self, command, timeout=30):
        if command.startswith(self.trigger):
            raise ADBError(f"ADB command timed out after {timeout:.1f}s: {command}")
        return "", "", 0

    def getprop(self, prop):
        return ""


def test_check_magisk_hide_timeout_is_inconclusive_not_fail():
    # regression (real device): the old recursive /proc scan timed out and was
    # surfaced as a HIGH-severity FAIL. A blocked probe must be INCONCLUSIVE.
    adb = TimeoutADB("mount | grep")
    result = check_magisk_hide(adb)
    assert result.status == "inconclusive"
    assert result.severity == "info"
    assert result.severity != "high"
    assert "INCONCLUSIVE" in result.evidence


def test_check_magisk_hide_timeout_never_high_severity(adb):
    adb = TimeoutADB("command -v magisk")
    result = check_magisk_hide(adb)
    assert result.status == "inconclusive"
    assert result.severity == "info"


def test_inconclusive_does_not_inflate_risk():
    results = [
        CheckResult("a", passed=False, evidence="", severity="high", status="inconclusive"),
        CheckResult("b", passed=True, evidence="", severity="info"),
    ]
    level, score = calculate_risk_score(results)
    assert level == "Low"
    assert score == 0


def test_run_all_checks_returns_all(adb):
    results = run_all_checks(adb)
    assert len(results) == len(ALL_CHECKS)
    for r in results:
        assert isinstance(r, CheckResult)
        assert r.passed is True


def test_run_all_checks_catches_errors(adb):
    adb.responses["pm list packages"] = fake_result(returncode=1)
    results = run_all_checks(adb)
    assert len(results) == len(ALL_CHECKS)


def test_run_all_checks_skip(adb):
    results = run_all_checks(adb, skip={"check_su_binary", "check_hidden_apps"})
    # verify the returned results exclude the skipped checks by name
    assert not any(r.name == "SU Binary" for r in results)
    assert not any(r.name == "Hidden Apps (No Icon)" for r in results)
    assert len(results) == len(ALL_CHECKS) - 2


def test_run_all_checks_on_check_callback(adb):
    seen = []
    run_all_checks(adb, on_check=lambda status, slug, result: seen.append((status, slug)))
    assert len(seen) == len(ALL_CHECKS) * 2


def test_run_all_checks_skip_also_skips_callback(adb):
    seen = []
    run_all_checks(adb, on_check=lambda status, slug, result: seen.append((status, slug)), skip={"check_su_binary"})
    slugs = {slug for status, slug in seen}
    assert "check_su_binary" not in slugs
    assert "check_root_packages" in slugs


def test_adb_connection_custom_path():
    conn = ADBConnection(adb_path="/custom/adb")
    assert conn.adb_path == "/custom/adb"


def test_risk_score_low_when_all_clean(adb):
    results = run_all_checks(adb)
    level, score = calculate_risk_score(results)
    assert level == "Low"
    assert score == 0


def test_risk_score_high():
    results = [
        CheckResult("a", passed=False, evidence="", severity="high"),
        CheckResult("b", passed=False, evidence="", severity="high"),
        CheckResult("c", passed=False, evidence="", severity="high"),
    ]
    level, _ = calculate_risk_score(results)
    assert level == "High"


def test_get_summary_counts():
    results = [
        CheckResult("a", passed=True, evidence="", severity="info"),
        CheckResult("b", passed=False, evidence="", severity="high"),
        CheckResult("c", passed=False, evidence="", severity="medium"),
    ]
    summary = get_summary(results)
    assert summary["passed"] == 1
    assert summary["failed"] == 2
    assert summary["high_severity"] == 1
    assert summary["medium_severity"] == 1


def test_get_summary_counts_inconclusive():
    results = [
        CheckResult("a", passed=True, evidence="", severity="info"),
        CheckResult("b", passed=False, evidence="", severity="high"),
        CheckResult("c", passed=False, evidence="", severity="info", status="inconclusive"),
    ]
    summary = get_summary(results)
    assert summary["passed"] == 1
    assert summary["failed"] == 1
    assert summary["inconclusive"] == 1
    assert summary["total_checks"] == 3