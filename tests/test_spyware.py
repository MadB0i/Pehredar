from types import SimpleNamespace

import pytest

from pehredar.checks import CheckResult, run_all_checks
from pehredar.checks.spyware import (
    SPYWARE_CHECKS,
    check_accessibility_services,
    check_device_admin,
    check_hidden_apps,
    check_sensitive_permissions,
)


def fake_result(stdout="", stderr="", returncode=0):
    return SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)


class FakeADB:
    def __init__(self):
        self.responses = {}

    def run_command(self, command):
        for key, value in self.responses.items():
            if command.startswith(key):
                return value.stdout, value.stderr, value.returncode
        return "", "", 0

    def getprop(self, prop):
        return ""


@pytest.fixture
def adb():
    return FakeADB()


def test_check_hidden_apps_flags_no_launcher(adb):
    adb.responses["cmd package query-activities"] = fake_result(
        "com.android.chrome/com.google.android.apps.chrome.Main\n"
        "com.google.android.youtube/com.google.android.apps.youtube.app.phone.YoutubeActivity\n"
    )
    adb.responses["pm list packages -3"] = fake_result(
        "package:com.android.chrome\n"
        "package:com.google.android.youtube\n"
        "package:com.sneaky.app\n"
    )
    result = check_hidden_apps(adb)
    assert not result.passed
    assert "com.sneaky.app" in result.evidence


def test_check_hidden_apps_clean(adb):
    adb.responses["cmd package query-activities"] = fake_result(
        "com.android.chrome/com.google.android.apps.chrome.Main\n"
        "com.google.android.youtube/com.google.android.apps.youtube.app.phone.YoutubeActivity\n"
        "com.sneaky.app/MainActivity\n"
    )
    adb.responses["pm list packages -3"] = fake_result(
        "package:com.android.chrome\n"
        "package:com.google.android.youtube\n"
        "package:com.sneaky.app\n"
    )
    result = check_hidden_apps(adb)
    assert result.passed


def test_check_hidden_apps_query_unavailable(adb):
    adb.responses["cmd package query-activities"] = fake_result(returncode=1)
    adb.responses["pm query-activities"] = fake_result(returncode=1)
    result = check_hidden_apps(adb)
    assert result.passed


def test_check_accessibility_services_flags_unknown(adb):
    adb.responses["settings get secure enabled_accessibility_services"] = fake_result(
        "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService:"
        "com.sneaky.app/.SpyService"
    )
    result = check_accessibility_services(adb)
    assert not result.passed
    assert "com.sneaky.app" in result.evidence


def test_check_accessibility_services_clean(adb):
    adb.responses["settings get secure enabled_accessibility_services"] = fake_result(
        "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
    )
    result = check_accessibility_services(adb)
    assert result.passed


def test_check_accessibility_services_none(adb):
    adb.responses["settings get secure enabled_accessibility_services"] = fake_result("null")
    result = check_accessibility_services(adb)
    assert result.passed


def test_check_device_admin_flags_third_party(adb):
    adb.responses["dpm list-owners"] = fake_result(
        "Device owner:\n  Package: com.sneaky.admin/AdminReceiver\n"
    )
    adb.responses["dumpsys device_policy"] = fake_result("")
    result = check_device_admin(adb)
    assert not result.passed
    assert "com.sneaky.admin" in result.evidence


def test_check_device_admin_ignores_system(adb):
    adb.responses["dpm list-owners"] = fake_result(
        "Profile owner:\n  Package: com.google.android.apps.work/DeviceAdminReceiver\n"
    )
    adb.responses["dumpsys device_policy"] = fake_result(
        "Active admin: [com.google.android.gms/com.google.android.gms.settings.mdm.MdmDeviceAdminReceiver]\n"
    )
    result = check_device_admin(adb)
    assert result.passed


def test_check_device_admin_clean(adb):
    result = check_device_admin(adb)
    assert result.passed


def test_check_sensitive_permissions_flags_hidden(adb):
    adb.responses["cmd package query-activities"] = fake_result(
        "com.android.chrome/com.google.android.apps.chrome.Main\n"
    )
    adb.responses["dumpsys package"] = fake_result(
        "  Package [com.android.chrome] (abc)\n"
        "    grantedPermissions:\n"
        "      android.permission.CAMERA\n"
        "      android.permission.RECORD_AUDIO\n"
        "      android.permission.READ_SMS\n"
        "      android.permission.ACCESS_FINE_LOCATION\n"
        "\n"
        "  Package [com.sneaky.app] (xyz)\n"
        "    grantedPermissions:\n"
        "      android.permission.CAMERA\n"
        "      android.permission.RECORD_AUDIO\n"
        "      android.permission.READ_SMS\n"
        "      android.permission.ACCESS_FINE_LOCATION\n"
        "\n"
    )
    result = check_sensitive_permissions(adb)
    assert not result.passed
    assert "com.sneaky.app" in result.evidence


def test_check_sensitive_permissions_clean(adb):
    adb.responses["cmd package query-activities"] = fake_result(
        "com.android.chrome/com.google.android.apps.chrome.Main\n"
    )
    adb.responses["dumpsys package"] = fake_result(
        "  Package [com.android.chrome] (abc)\n"
        "    grantedPermissions:\n"
        "      android.permission.CAMERA\n"
        "      android.permission.RECORD_AUDIO\n"
        "\n"
    )
    result = check_sensitive_permissions(adb)
    assert result.passed


def test_spyware_checks_registered_in_all_checks(adb):
    from pehredar.checks import ALL_CHECKS

    spyware_slugs = {c.__name__ for c in SPYWARE_CHECKS}
    all_slugs = {c.__name__ for c in ALL_CHECKS}
    assert spyware_slugs.issubset(all_slugs)
    assert len(SPYWARE_CHECKS) == 4
    results = run_all_checks(adb)
    assert len(results) == len(ALL_CHECKS)
    for result in results:
        assert isinstance(result, CheckResult)
        assert result.passed is True


def test_run_all_checks_calls_callback(adb):
    from pehredar.checks import ALL_CHECKS

    events = []
    run_all_checks(adb, on_check=lambda status, slug, result: events.append((status, slug, result)))
    assert len(events) == 2 * len(ALL_CHECKS)
    running = [e for e in events if e[0] == "running"]
    done = [e for e in events if e[0] == "done"]
    assert len(running) == len(done) == len(ALL_CHECKS)
    for _, slug, result in done:
        assert result is not None