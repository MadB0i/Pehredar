import json
from types import SimpleNamespace

import pytest
from click.testing import CliRunner

from pehredar.agent import (
    build_lock_recovery_plan,
    build_root_plan,
    fingerprint_device,
    has_root,
    run_lock_recovery,
)
from pehredar.agent.fingerprint import DeviceFingerprint
from pehredar.agent_cli import main


class MockFastboot:
    def __init__(self):
        self.calls = []

    def run(self, *args, **kwargs):
        self.calls.append(args)
        return "", "", 0

    def wait_for_device(self, timeout=60):
        return True


class FakeADB:
    def __init__(self, props=None, responses=None):
        self.props = props or {}
        self.responses = responses or {}

    def run_command(self, command, timeout=30):
        for key, value in self.responses.items():
            if command.startswith(key):
                return value.stdout, value.stderr, value.returncode
        return "", "", 0

    def host(self, *args, **kwargs):
        self.host_calls = getattr(self, "host_calls", [])
        self.host_calls.append(args)
        return "", "", 0

    def getprop(self, prop):
        return self.props.get(prop, "")

    def list_devices(self):
        return [SimpleNamespace(serial="XYZ", status="device")]


def fp(**overrides):
    base = {
        "manufacturer": "Google",
        "model": "Pixel 7",
        "android_version": "14",
        "sdk": "34",
        "build_id": "UP1A.231005.007",
        "security_patch": "2024-01-05",
        "bootloader_state": "locked",
        "oem": "pixel",
    }
    base.update(overrides)
    return DeviceFingerprint(**base)


def test_fingerprint_device_pixel(mocker):
    adb = FakeADB(
        props={
            "ro.product.manufacturer": "Google",
            "ro.product.model": "Pixel 7",
            "ro.build.version.release": "14",
            "ro.build.version.sdk": "34",
            "ro.build.id": "UP1A.231005.007",
            "ro.build.version.security_patch": "2024-01-05",
            "ro.boot.vbmeta.device_state": "locked",
        }
    )
    f = fingerprint_device(adb)
    assert f.oem == "pixel"
    assert f.bootloader_state == "locked"
    assert f.sdk == "34"


def test_fingerprint_samsung_oem():
    adb = FakeADB(props={"ro.product.manufacturer": "samsung", "ro.boot.flash.locked": "0"})
    f = fingerprint_device(adb)
    assert f.oem == "samsung"
    assert f.bootloader_state == "unlocked"


def test_fingerprint_bbk_vivo_oem():
    adb = FakeADB(props={"ro.product.manufacturer": "BBK", "ro.boot.verifiedbootstate": "green"})
    f = fingerprint_device(adb)
    assert f.oem == "vivo"
    assert f.bootloader_state == "locked"


def test_fingerprint_unknown_state():
    adb = FakeADB(props={"ro.product.manufacturer": "sony"})
    f = fingerprint_device(adb)
    assert f.oem == "generic"
    assert f.bootloader_state == "unknown"


@pytest.mark.parametrize(
    ("manufacturer", "expected"),
    [
        ("Google", "pixel"),
        ("Pixel", "pixel"),
        ("samsung", "samsung"),
        ("Xiaomi", "xiaomi"),
        ("Redmi", "xiaomi"),
        ("OnePlus", "oneplus"),
        ("OPPO", "oppo"),
        ("vivo", "vivo"),
        ("Motorola", "generic"),
    ],
)
def test_normalize_oem(manufacturer, expected):
    from pehredar.agent.fingerprint import _normalize_oem

    assert _normalize_oem(manufacturer) == expected


def test_build_root_plan_locked_temporary():
    plan = build_root_plan(fp(), mode="temporary")
    ids = [s.id for s in plan.steps]
    assert ids == ["unlock", "extract_boot", "patch_boot", "apply", "reboot", "verify"]
    unlock = plan.steps[0]
    assert unlock.destructive and unlock.device_confirm
    apply = plan.steps[3]
    assert not apply.destructive  # fastboot boot is temporary


def test_build_root_plan_locked_permanent():
    plan = build_root_plan(fp(), mode="permanent")
    apply = next(s for s in plan.steps if s.id == "apply")
    assert apply.destructive


def test_build_root_plan_already_unlocked_skips_unlock():
    plan = build_root_plan(fp(bootloader_state="unlocked"))
    ids = [s.id for s in plan.steps]
    assert "unlock" not in ids
    assert any("already unlocked" in n for n in plan.notes)


def test_build_root_plan_bad_mode_defaults_temporary():
    plan = build_root_plan(fp(), mode="banana")
    assert plan.mode == "temporary"


def test_support_matrix_unlock_commands():
    from pehredar.agent.magisk import UNLOCK_COMMANDS

    assert UNLOCK_COMMANDS["pixel"] == ["flashing", "unlock"]
    assert UNLOCK_COMMANDS["samsung"] == ["oem", "unlock"]
    assert UNLOCK_COMMANDS["vivo"] == ["oem", "unlock"]


def test_has_root_detects_su(mocker):
    adb = FakeADB(responses={"su -c id": SimpleNamespace(stdout="uid=0(root)", stderr="", returncode=0)})
    assert has_root(adb)


def test_has_root_clean(mocker):
    adb = FakeADB()
    assert not has_root(adb)


def test_build_lock_recovery_plan_modern():
    plan = build_lock_recovery_plan(fp(sdk="34"), rooted=True)
    ids = [s.id for s in plan.steps]
    assert "clear" in ids
    assert "remove_keys" in ids
    clear = next(s for s in plan.steps if s.id == "clear")
    assert "locksettings" in clear.detail
    assert any("USB debugging" in n for n in plan.notes)


def test_build_lock_recovery_plan_old_sdk_unrooted():
    plan = build_lock_recovery_plan(fp(sdk="27"), rooted=False)
    assert plan.steps[0].id == "none"
    assert any("not rooted" in n for n in plan.notes)


def test_run_lock_recovery_executes_clear():
    events = []
    adb = FakeADB(responses={"locksettings clear": SimpleNamespace(stdout="", stderr="", returncode=0)})
    result = run_lock_recovery(adb, fp(sdk="34"), on_event=events.append, confirm=lambda s: True)
    assert result["ok"] is True
    types = [e["type"] for e in events]
    assert "plan" in types and "verify" in types


def test_run_lock_recovery_declined_removal_skips():
    adb = FakeADB()
    result = run_lock_recovery(adb, fp(sdk="34"), on_event=lambda e: None, confirm=lambda s: False)
    assert result["ok"] is True


def test_cli_plan_only_json_stream(mocker):
    class CliADB(FakeADB):
        def connect(self):
            return "XYZ"

        def list_devices(self):
            return [SimpleNamespace(serial="XYZ", status="device")]

    mocker.patch("pehredar.agent_cli.ADBConnection", return_value=CliADB())
    runner = CliRunner()
    result = runner.invoke(
        main,
        ["--plan-only", "--json-stream", "--adb-path", "adb"],
    )
    assert result.exit_code == 0
    lines = [json.loads(l) for l in result.output.strip().splitlines()]
    types = [l["type"] for l in lines]
    assert "fp" in types
    assert "plan" in types
    assert types[-1] == "done"


def test_cli_no_device_fails_fast(mocker):
    from pehredar.adb import NoDeviceError

    mocker.patch("pehredar.agent_cli.ADBConnection", side_effect=NoDeviceError("No devices connected"))
    runner = CliRunner()
    result = runner.invoke(main, ["--lock-recovery"])
    assert result.exit_code == 1  # fails fast without a device


def test_cli_lock_recovery_plan_only_does_not_execute(mocker):
    class CliADB(FakeADB):
        def connect(self):
            return "XYZ"

        def list_devices(self):
            return [SimpleNamespace(serial="XYZ", status="device")]

    mocker.patch("pehredar.agent_cli.ADBConnection", return_value=CliADB(props={"ro.build.version.sdk": "34"}))
    mocked = mocker.patch("pehredar.agent_cli.run_lock_recovery")
    runner = CliRunner()
    result = runner.invoke(main, ["--lock-recovery", "--plan-only", "--json-stream"])
    assert result.exit_code == 0
    mocked.assert_not_called()
    lines = [json.loads(l) for l in result.output.strip().splitlines()]
    assert lines[-1]["type"] == "done" and lines[-1].get("plan_only") is True


def test_root_agent_plan_flow(mocker):
    events = []
    adb = FakeADB(
        props={"ro.product.manufacturer": "Google", "ro.boot.vbmeta.device_state": "unlocked"},
        responses={"su -c id": SimpleNamespace(stdout="", stderr="", returncode=0)},
    )
    fb = MockFastboot()
    mocker.patch("pehredar.agent.extract_boot_image", return_value="boot.img")
    mocker.patch("pehredar.agent.find_magiskboot", return_value="magiskboot")
    mocker.patch("pehredar.agent.patch_boot_image", return_value="boot_patched.img")
    mocker.patch("pehredar.agent.wait_for_adb", return_value=True)

    from pehredar.agent import run_root_agent

    result = run_root_agent(adb, fb, on_event=events.append, confirm=lambda s: True, mode="temporary")
    assert result["ok"] is True
    steps = [e["id"] for e in events if e["type"] == "step"]
    assert "extract_boot" in steps