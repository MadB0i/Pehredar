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

    def run_command(self, command, timeout=30):
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
    assert result.packages == ["com.sneaky.app"]


def test_check_hidden_apps_real_query_format(adb):
    # regression (real device): modern `cmd package query-activities` emits
    # "package:" lines followed by "  activity:pkg/.Activity" lines. Only the
    # activity lines resolve to real packages; the old parser swallowed the
    # prefixed tokens and flagged every app as hidden.
    adb.responses["cmd package query-activities"] = fake_result(
        "package:com.android.chrome\n"
        "  activity:com.android.chrome/com.google.android.apps.chrome.Main\n"
        "package:com.google.android.youtube\n"
        "  activity:com.google.android.youtube/com.google.android.apps.youtube.app.phone.YoutubeActivity\n"
    )
    adb.responses["pm list packages -3"] = fake_result(
        "package:com.android.chrome\n"
        "package:com.google.android.youtube\n"
        "package:com.sneaky.app\n"
    )
    result = check_hidden_apps(adb)
    assert not result.passed
    assert "com.sneaky.app" in result.evidence
    assert "com.android.chrome" not in result.evidence
    assert result.packages == ["com.sneaky.app"]


def test_check_hidden_apps_allowlist_excludes_well_known(adb):
    # regression (real device): when the launcher query returns nothing usable
    # on an OEM launcher, well-known apps with real launcher icons (Google
    # Authenticator, Assistant, Facebook, Play Console, YouTube) were flagged.
    # The allowlist excludes them regardless of the query result.
    adb.responses["cmd package query-activities"] = fake_result("")
    adb.responses["pm list packages -3"] = fake_result(
        "package:com.google.android.apps.authenticator2\n"
        "package:com.google.android.googlequicksearchbox\n"
        "package:com.facebook.katana\n"
        "package:com.google.android.apps.playconsole\n"
        "package:com.google.android.youtube\n"
        "package:com.sneaky.spy\n"
    )
    result = check_hidden_apps(adb)
    assert not result.passed
    assert "com.sneaky.spy" in result.evidence
    for known in (
        "com.google.android.apps.authenticator2",
        "com.google.android.googlequicksearchbox",
        "com.facebook.katana",
        "com.google.android.apps.playconsole",
        "com.google.android.youtube",
    ):
        assert known not in result.evidence
    assert result.packages == ["com.sneaky.spy"]


def test_check_hidden_apps_verbose_dump_format(adb):
    # regression (real device, Android 14 BBK/Vivo): `cmd package
    # query-activities` emits a dumpsys-style dump. The activity package is in
    # `packageName=` fields, not `pkg/Activity` or `package:`/`activity:`
    # lines. The old parser read nothing from this format and flagged every
    # third-party app (incl. Truecaller / ChatGPT) as hidden.
    adb.responses["cmd package query-activities"] = fake_result(
        "55 activities found:\n"
        "  Activity #0:\n"
        "    ActivityInfo:\n"
        "      name=com.truecaller.ui.TruecallerInit\n"
        "      packageName=com.truecaller\n"
        "      labelRes=0x7f100053 icon=0x0\n"
        "      sourceDir=/data/app/~~abc==/com.truecaller-bX==/base.apk\n"
        "  Activity #1:\n"
        "    ActivityInfo:\n"
        "      name=com.openai.chatgpt/.MainActivity\n"
        "      packageName=com.openai.chatgpt\n"
        "    ApplicationInfo:\n"
        "      packageName=com.openai.chatgpt\n"
    )
    adb.responses["pm list packages -3"] = fake_result(
        "package:com.truecaller\n"
        "package:com.openai.chatgpt\n"
        "package:com.sneaky.app\n"
    )
    result = check_hidden_apps(adb)
    assert not result.passed
    assert "com.sneaky.app" in result.evidence
    assert "com.truecaller" not in result.evidence
    assert "com.openai.chatgpt" not in result.evidence
    assert "sourceDir" not in result.evidence
    assert result.packages == ["com.sneaky.app"]


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
    assert result.packages == ["com.sneaky.app"]


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