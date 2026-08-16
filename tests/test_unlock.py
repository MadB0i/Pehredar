import json
from types import SimpleNamespace

import pytest
from click.testing import CliRunner

from pehredar.agent import auto_unlock
from pehredar.agent.unlock import (
    _grid_point,
    _screen_size,
    detect_lock_state,
    unlock_with_pattern,
    unlock_with_pin,
    wait_until_authorized,
    wait_until_unlocked,
)


class FakeADB:
    def __init__(self, authorized=True, locked=True, secure=True, size="Physical size: 1080x2340", props=None):
        self.authorized = authorized
        self.locked = locked
        self.secure = secure
        self.size = size
        self.props = props or {}
        self.commands = []
        self._swipes = 0

    def list_devices(self):
        if self.authorized:
            return [SimpleNamespace(serial="XYZ", status="device")]
        return [SimpleNamespace(serial="XYZ", status="unauthorized")]

    def getprop(self, prop):
        return self.props.get(prop, "")

    def run_command(self, command, timeout=30):
        self.commands.append(command)
        if command.startswith("wm size"):
            return self.size, "", 0
        if command.startswith("dumpsys window"):
            return "mShowingLockscreen=" + ("true" if self.locked else "false"), "", 0
        if command.startswith("locksettings get-disabled"):
            return ("false" if self.secure else "true"), "", 0
        if command.startswith(("input swipe", "input text", "input keyevent")):
            if command.startswith("input swipe"):
                self._swipes += 1
                if self._swipes >= 2:  # first swipe lifts the lockscreen; pattern completes on touch-up
                    self.locked = False
            if command.startswith("input keyevent 66"):
                self.locked = False
            return "", "", 0
        return "", "", 0

    def host(self, *args, **kwargs):
        return "", "", 0

    @property
    def serial(self):
        return "XYZ"

    _device_serial = "XYZ"


def test_detect_lock_state_unauthorized():
    adb = FakeADB(authorized=False)
    state = detect_lock_state(adb)
    assert not state.authorized
    assert not state.unlocked


def test_detect_lock_state_locked():
    adb = FakeADB(authorized=True, locked=True, secure=True)
    state = detect_lock_state(adb)
    assert state.authorized
    assert state.lockscreen_showing
    assert state.secure_lock_configured
    assert not state.unlocked


def test_detect_lock_state_unlocked():
    adb = FakeADB(authorized=True, locked=False)
    state = detect_lock_state(adb)
    assert state.unlocked


def test_screen_size_parsing():
    adb = FakeADB(size="Physical size: 1440x3200\nOverride size: none")
    assert _screen_size(adb) == (1440, 3200)


def test_grid_point_math():
    assert _grid_point(0, 1080, 2340) == (int(1080 * 0.18), int(2340 * 0.18))
    assert _grid_point(4, 1080, 2340) == (540, 1170)
    assert _grid_point(8, 1080, 2340) == (1080 - int(1080 * 0.18), 2340 - int(2340 * 0.18))


def test_unlock_with_pin_sequence():
    adb = FakeADB(authorized=True, locked=True)
    ok = unlock_with_pin(adb, "1234", attempts=1)
    assert ok
    joined = " | ".join(adb.commands)
    assert "input swipe" in joined
    assert "input text 1234" in joined
    assert "input keyevent 66" in joined
    # keyevent comes after text
    assert joined.index("input text 1234") < joined.index("input keyevent 66")


def test_unlock_with_pattern_swipes():
    adb = FakeADB(authorized=True, locked=True)
    ok = unlock_with_pattern(adb, "0123", attempts=1)
    assert ok
    swipes = [c for c in adb.commands if c.startswith("input swipe")]
    assert len(swipes) >= 3  # swipe-up + 3 pattern segments


def test_wait_until_unlocked_timeout(mocker):
    adb = FakeADB(authorized=True, locked=True)
    mocker.patch("pehredar.agent.unlock.time.sleep", lambda s: None)
    assert not wait_until_unlocked(adb, timeout=0.5)


def test_wait_until_authorized_timeout(mocker):
    adb = FakeADB(authorized=False)
    mocker.patch("pehredar.agent.unlock.time.sleep", lambda s: None)
    assert not wait_until_authorized(adb, timeout=0.5)


def test_auto_unlock_already_accessible():
    events = []
    adb = FakeADB(authorized=True, locked=False)
    auto_unlock(adb, None, on_event=events.append)
    types = [e["type"] for e in events]
    assert types[-1] == "unlock"
    assert events[-1]["state"] == "ok"


def test_auto_unlock_injects_pin():
    events = []
    adb = FakeADB(authorized=True, locked=True, secure=True)
    auto_unlock(adb, {"pin": "4321", "timeout": 10, "attempts": 1}, on_event=events.append)
    states = [e.get("state") for e in events if e["type"] == "unlock"]
    assert states[-1] == "ok"
    assert any("input text 4321" in c for c in adb.commands)


def test_auto_unlock_unauthorized_emits_device_action(mocker):
    events = []
    adb = FakeADB(authorized=False, locked=False)
    mocker.patch("pehredar.agent.unlock.time.sleep", lambda s: None)
    # never becomes authorized -> raises after timeout
    from pehredar.agent import UnlockError

    with pytest.raises(UnlockError):
        auto_unlock(adb, {"timeout": 0.5}, on_event=events.append)
    assert any(e["type"] == "device-action" for e in events)


def test_auto_unlock_locked_no_pin_emits_device_action(mocker):
    events = []
    adb = FakeADB(authorized=True, locked=True, secure=True)
    mocker.patch("pehredar.agent.unlock.time.sleep", lambda s: None)
    from pehredar.agent import UnlockError

    with pytest.raises(UnlockError):
        auto_unlock(adb, {"timeout": 0.5}, on_event=events.append)
    assert any(e["type"] == "device-action" for e in events)


def test_root_agent_reboot_calls_auto_unlock(mocker):
    from pehredar.agent import run_root_agent

    events = []
    adb = FakeADB(
        authorized=True,
        locked=True,
        props={
            "ro.product.manufacturer": "Google",
            "ro.product.model": "Pixel 7",
            "ro.build.version.release": "14",
            "ro.build.version.sdk": "34",
            "ro.build.id": "UP1A.231005.007",
            "ro.build.version.security_patch": "2024-01-05",
            "ro.boot.vbmeta.device_state": "unlocked",
        },
    )
    mocker.patch("pehredar.agent.extract_boot_image", return_value="boot.img")
    mocker.patch("pehredar.agent.find_magiskboot", return_value="magiskboot")
    mocker.patch("pehredar.agent.patch_boot_image", return_value="boot_patched.img")
    mocker.patch("pehredar.agent.wait_for_adb", return_value=True)
    mocked = mocker.patch("pehredar.agent.auto_unlock")

    class MockFB:
        def run(self, *a, **k):
            return "", "", 0

        def wait_for_device(self, timeout=60):
            return True

    result = run_root_agent(adb, MockFB(), on_event=events.append, confirm=lambda s: True, mode="temporary")
    assert result["ok"] is True
    mocked.assert_called_once()


def test_cli_unlock_pin_file_transport(tmp_path, mocker):
    from pehredar.agent_cli import main

    pin_file = tmp_path / "pin.txt"
    pin_file.write_text("1357", encoding="utf-8")

    class CliADB(FakeADB):
        def connect(self):
            return "XYZ"

    mocker.patch("pehredar.agent_cli.ADBConnection", return_value=CliADB())
    runner = CliRunner()
    result = runner.invoke(main, ["--plan-only", "--json-stream", "--unlock-pin-file", str(pin_file)])
    assert result.exit_code == 0
    lines = [json.loads(l) for l in result.output.strip().splitlines()]
    assert lines[-1]["type"] == "done"