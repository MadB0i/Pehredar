"""Full end-to-end integration tests for AUTO-UNLOCK AFTER REBOOT.

Drives the real CLI (agent_cli.main via Click) and the real run_root_agent /
run_lock_recovery / auto_unlock chain against a stateful fake ADB that
simulates: authorized device -> host reboot -> device offline -> device back
online (authorized, lockscreen showing) -> PIN injection -> unlocked.
"""

import json
from types import SimpleNamespace

import pytest
from click.testing import CliRunner

PROPS = {
    "ro.product.manufacturer": "Google",
    "ro.product.model": "Pixel 7",
    "ro.build.version.release": "14",
    "ro.build.version.sdk": "34",
    "ro.build.id": "UP1A.231005.007",
    "ro.build.version.security_patch": "2024-01-05",
    "ro.boot.vbmeta.device_state": "unlocked",
}


class StatefulFakeADB:
    def __init__(self, pin="1234", pattern=None, rooted=True, locked=True):
        self.pin = pin
        self.pattern = pattern
        self.rooted = rooted
        self.locked = locked
        self.boot_completed = "1"
        self.boot_pending = 0
        self.offline_polls = 0
        self.commands = []
        self.swipes = 0
        self.typed_pin = ""

    # ---- adb surface ----
    def connect(self):
        self._device_serial = "FAKE"
        return "FAKE"

    def list_devices(self):
        if self.offline_polls > 0:
            self.offline_polls -= 1
            return [SimpleNamespace(serial="FAKE", status="offline")]
        return [SimpleNamespace(serial="FAKE", status="device")]

    def getprop(self, prop):
        return PROPS.get(prop, "")

    def run_command(self, command, timeout=30):
        self.commands.append(command)
        if command.startswith("wm size"):
            return "Physical size: 1080x2340", "", 0
        if command.startswith("dumpsys window"):
            return "mKeyguardShowing=" + ("true" if self.locked else "false"), "", 0
        if command.startswith("getprop sys.boot_completed"):
            if self.boot_completed == "0":
                self.boot_pending -= 1
                if self.boot_pending <= 0:
                    self.boot_completed = "1"
            return self.boot_completed, "", 0
        if command.startswith("locksettings get-disabled"):
            return ("false" if self.locked else "true"), "", 0
        if command.startswith("locksettings clear"):
            self.locked = False
            return "", "", 0
        if command.startswith("su -c id"):
            return "uid=0(root) gid=0(root)", "", 0 if self.rooted else 1
        if command.startswith("su -c 'rm -f"):
            return "", "", 0
        if command.startswith("input swipe"):
            self.swipes += 1
            return "", "", 0
        if command.startswith("input keyevent"):
            code = int(command.split("input keyevent ", 1)[1].strip())
            if 7 <= code <= 16:  # KEYCODE_0..KEYCODE_9 -> digit
                self.typed_pin += str(code - 7)
            elif code == 66 and self.typed_pin == self.pin:  # ENTER
                self.locked = False
            return "", "", 0
        if command.startswith("input motionevent UP") and self.pattern:
            self.locked = False
            return "", "", 0
        return "", "", 0

    def host(self, *args, timeout=60):
        if args and args[0] == "reboot":
            self.boot_completed = "0"
            self.boot_pending = 3
            self.offline_polls = 2  # adb drops briefly, then comes back
            self.locked = True
        return "", "", 0

    @property
    def serial(self):
        return "FAKE"

    _device_serial = "FAKE"


def _fast(mocker):
    mocker.patch("pehredar.agent.verify.time.sleep", lambda s: None)
    mocker.patch("pehredar.agent.unlock.time.sleep", lambda s: None)


def test_lock_recovery_full_cli_run_unlocks_with_pin(mocker):
    """Real CLI: --lock-recovery --yes --unlock-pin <file> through reboot+unlock."""
    from pehredar.agent_cli import main

    _fast(mocker)
    adb = StatefulFakeADB(pin="4321", rooted=True, locked=True)
    mocker.patch("pehredar.agent_cli.ADBConnection", return_value=adb)

    runner = CliRunner()
    result = runner.invoke(
        main,
        ["-s", "FAKE", "--lock-recovery", "--yes", "--unlock-pin", "4321", "--json-stream"],
        catch_exceptions=False,
    )
    assert result.exit_code == 0, result.output
    lines = [json.loads(l) for l in result.output.strip().splitlines()]

    unlock_events = [e for e in lines if e.get("type") == "unlock"]
    assert unlock_events[0]["state"] == "start"
    assert any(e["state"] == "action" and "booting" in e.get("detail", "") for e in unlock_events)
    assert any(e["state"] == "action" and "PIN" in e.get("detail", "") for e in unlock_events)
    assert unlock_events[-1]["state"] == "ok"
    assert all(e.get("type") != "device-action" for e in lines)

    steps = [e for e in lines if e.get("type") == "step"]
    assert all(s["state"] != "error" for s in steps)
    assert any(s["id"] == "reboot" and s["state"] == "ok" for s in steps)

    assert "input keyevent 66" in adb.commands
    assert adb.typed_pin == "4321"
    assert any(c.startswith("input swipe") for c in adb.commands)
    assert adb.locked is False


def test_lock_recovery_unlock_pattern_via_file(mocker, tmp_path):
    """PIN file transport: pattern digits read from --unlock-pattern-file."""
    from pehredar.agent_cli import main

    _fast(mocker)
    pattern_file = tmp_path / "pattern.txt"
    pattern_file.write_text("012578", encoding="utf-8")

    adb = StatefulFakeADB(pin="012578", pattern="012578", rooted=True, locked=True)
    mocker.patch("pehredar.agent_cli.ADBConnection", return_value=adb)

    runner = CliRunner()
    result = runner.invoke(
        main,
        ["-s", "FAKE", "--lock-recovery", "--yes", "--unlock-pattern-file", str(pattern_file), "--json-stream"],
        catch_exceptions=False,
    )
    assert result.exit_code == 0, result.output
    lines = [json.loads(l) for l in result.output.strip().splitlines()]
    unlock_events = [e for e in lines if e.get("type") == "unlock"]
    assert unlock_events[-1]["state"] == "ok"
    # unlock_with_pattern draws one continuous motionevent gesture
    assert any(c.startswith("input motionevent DOWN") for c in adb.commands)
    assert any(c.startswith("input motionevent MOVE") for c in adb.commands)
    assert any(c.startswith("input motionevent UP") for c in adb.commands)
    action = [e for e in unlock_events if e.get("method") == "pattern"]
    assert action and action[0]["secret"] == "012578"
    assert adb.locked is False


def test_lock_recovery_unauthorized_emits_device_action_then_recovers(mocker):
    """Device is unauthorized after reboot -> checkpoint, then user unlocks -> ok."""
    from pehredar.agent_cli import main

    _fast(mocker)

    class ReauthFakeADB(StatefulFakeADB):
        def __init__(self):
            super().__init__(pin="1234", rooted=True, locked=True)
            self.reauth_polls = 3

        def list_devices(self):
            if self.reauth_polls > 0:
                self.reauth_polls -= 1
                return [SimpleNamespace(serial="FAKE", status="unauthorized")]
            return [SimpleNamespace(serial="FAKE", status="device")]

    adb = ReauthFakeADB()
    mocker.patch("pehredar.agent_cli.ADBConnection", return_value=adb)

    runner = CliRunner()
    result = runner.invoke(
        main,
        ["-s", "FAKE", "--lock-recovery", "--yes", "--unlock-pin", "1234", "--json-stream"],
        catch_exceptions=False,
    )
    assert result.exit_code == 0, result.output
    lines = [json.loads(l) for l in result.output.strip().splitlines()]
    assert any(e.get("type") == "device-action" for e in lines)
    unlock_events = [e for e in lines if e.get("type") == "unlock"]
    assert unlock_events[-1]["state"] == "ok"
    assert adb.locked is False


def test_root_agent_real_auto_unlock_on_reboot(mocker):
    """run_root_agent reboot step runs the REAL auto_unlock (not mocked)."""
    from pehredar.agent import run_root_agent

    _fast(mocker)
    adb = StatefulFakeADB(pin="9999", rooted=True, locked=True)
    adb.connect()

    mocker.patch("pehredar.agent.extract_boot_image", return_value="boot.img")
    mocker.patch("pehredar.agent.find_magiskboot", return_value="magiskboot")
    mocker.patch("pehredar.agent.patch_boot_image", return_value="boot_patched.img")
    mocker.patch("pehredar.agent.apply_boot", return_value=None)
    mocker.patch("pehredar.agent.verify_root", return_value={"rooted": True, "detail": "ok", "checks": []})

    class MockFB:
        def run(self, *a, **k):
            return "", "", 0

        def wait_for_device(self, timeout=60):
            return True

    events = []
    result = run_root_agent(
        adb,
        MockFB(),
        mode="temporary",
        on_event=events.append,
        confirm=lambda s: True,
        unlock_config={"pin": "9999", "timeout": 30, "attempts": 1},
    )
    assert result["ok"] is True
    unlock_events = [e for e in events if e.get("type") == "unlock"]
    assert unlock_events[-1]["state"] == "ok"
    assert adb.typed_pin == "9999"
    assert adb.locked is False


def test_auto_unlock_waits_for_boot_before_injecting(mocker):
    """Even with boot_completed=0 at first check, unlock still happens."""
    from pehredar.agent import auto_unlock

    _fast(mocker)

    class SlowBootADB(StatefulFakeADB):
        def __init__(self):
            super().__init__(pin="1111", rooted=True, locked=True)
            self.boot_checks = 0

        def run_command(self, command, timeout=30):
            if command.startswith("getprop sys.boot_completed"):
                self.boot_checks += 1
                return ("1" if self.boot_checks >= 3 else "0"), "", 0
            return super().run_command(command, timeout=timeout)

    adb = SlowBootADB()
    adb.connect()
    events = []
    auto_unlock(adb, {"pin": "1111", "timeout": 30, "attempts": 1}, on_event=events.append)
    assert events[-1]["type"] == "unlock" and events[-1]["state"] == "ok"
    assert adb.typed_pin == "1111"
    assert adb.locked is False


def test_auto_unlock_wrong_pin_raises_unlock_error(mocker):
    from pehredar.agent import UnlockError, auto_unlock

    _fast(mocker)
    adb = StatefulFakeADB(pin="0000", rooted=True, locked=True)  # device PIN differs
    adb.connect()
    events = []
    with pytest.raises(UnlockError):
        auto_unlock(adb, {"pin": "1234", "timeout": 0.5, "attempts": 1}, on_event=events.append)
    assert any(e.get("type") == "device-action" for e in events)
    assert adb.locked is True