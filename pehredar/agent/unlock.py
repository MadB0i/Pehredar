from __future__ import annotations

import re
import time
from dataclasses import dataclass

from ..adb import ADBConnection, ADBError, UnauthorizedError


class UnlockError(Exception):
    pass


@dataclass
class LockState:
    authorized: bool
    lockscreen_showing: bool
    secure_lock_configured: bool
    serial: str | None = None

    @property
    def unlocked(self) -> bool:
        return self.authorized and not self.lockscreen_showing


def _serial(adb: ADBConnection) -> str | None:
    return adb._device_serial or adb.serial  # noqa: PLW0212 - internal reuse


def _screen_size(adb: ADBConnection) -> tuple[int, int]:
    stdout, _, code = adb.run_command("wm size")
    if code == 0:
        m = re.search(r"Physical size:\s*(\d+)x(\d+)", stdout)
        if m:
            return int(m.group(1)), int(m.group(2))
    return 1080, 2340


def _wake_screen(adb: ADBConnection) -> None:
    """Turn the screen on (KEYCODE_WAKEUP) so the keyguard is actually visible."""
    try:
        adb.run_command("input keyevent 224")
    except ADBError:
        pass


def wait_for_boot(adb: ADBConnection, timeout: float = 90) -> bool:
    """Wait until Android reports sys.boot_completed=1."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            out, _, code = adb.run_command("getprop sys.boot_completed")
            if code == 0 and out.strip() == "1":
                return True
        except ADBError:
            pass
        time.sleep(2)
    return False


def detect_lock_state(adb: ADBConnection) -> LockState:
    """Read-only lock/crypt state. Never writes to the device."""
    authorized = False
    try:
        devices = adb.list_devices()
        authorized = any(d.status == "device" for d in devices)
    except ADBError:
        authorized = False

    if not authorized:
        return LockState(authorized=False, lockscreen_showing=False, secure_lock_configured=False, serial=_serial(adb))

    lockscreen = False
    try:
        out, _, _ = adb.run_command(
            "dumpsys window | grep -E 'mDreamingLockscreen|mShowingLockscreen|mKeyguardShowing|isStatusBarKeyguard|mCurrentFocus'"
        )
        # Flags are "true"/"false"; only count "true" values (a locked-off
        # keyguard still prints "mKeyguardShowing=false", which must NOT count).
        # mCurrentFocus pointing at a keyguard window also counts.
        for ln in out.splitlines():
            ln = ln.strip().lower()
            if not ln:
                continue
            if "mcurrentfocus" in ln:
                if "keyguard" in ln:
                    lockscreen = True
                    break
                continue
            head, sep, tail = ln.partition("=")
            if not sep:
                head, sep, tail = ln.partition(":")
            if sep and "true" in tail:
                lockscreen = True
                break
    except ADBError:
        pass

    secure = False
    try:
        out, _, _ = adb.run_command("locksettings get-disabled 2>/dev/null")
        secure = out.strip().lower() != "true" and bool(out.strip())
    except ADBError:
        secure = False

    return LockState(
        authorized=True,
        lockscreen_showing=lockscreen,
        secure_lock_configured=secure,
        serial=_serial(adb),
    )


def _swipe_up(adb: ADBConnection) -> None:
    w, h = _screen_size(adb)
    adb.run_command(f"input swipe {w // 2} {int(h * 0.85)} {w // 2} {int(h * 0.2)} 120")


def _type_pin(adb: ADBConnection, pin: str) -> None:
    """Type the PIN into the keyguard bouncer.

    Uses explicit keycodes for digits (KEYCODE_0 = 7 .. KEYCODE_9 = 16) because
    `input text` does not reach the PIN pad on many ROMs. Non-digit chars fall
    back to `input text`.
    """
    if pin.isdigit():
        for ch in pin:
            adb.run_command(f"input keyevent {7 + int(ch)}")
            time.sleep(0.12)
    else:
        adb.run_command(f"input text {pin}")


def _grid_point(seq_index: int, w: int, h: int) -> tuple[int, int]:
    # 3x3 pattern grid: indices 0..8, row-major. Coordinates are inset from
    # screen edges and centered on the pattern widget region.
    row = seq_index // 3
    col = seq_index % 3
    inset_x = int(w * 0.18)
    inset_y = int(h * 0.18)
    x = inset_x + int(col * (w - 2 * inset_x) / 2)
    y = inset_y + int(row * (h - 2 * inset_y) / 2)
    return x, y


def _draw_pattern(adb: ADBConnection, pattern: str) -> None:
    """Draw a 3x3 pattern as ONE continuous gesture.

    `input swipe` lifts the finger between segments, which a real pattern
    never does — so we send DOWN -> MOVE... -> UP via motionevent.
    """
    w, h = _screen_size(adb)
    pts = [int(c) for c in pattern if c.isdigit()]
    if len(pts) < 2:
        return
    coords = [_grid_point(p, w, h) for p in pts]
    x0, y0 = coords[0]
    adb.run_command(f"input motionevent DOWN {x0} {y0}")
    time.sleep(0.1)
    for i in range(1, len(coords) - 1):
        x, y = coords[i]
        adb.run_command(f"input motionevent MOVE {x} {y}")
        time.sleep(0.1)
    x1, y1 = coords[-1]
    adb.run_command(f"input motionevent UP {x1} {y1}")


def unlock_with_pin(adb: ADBConnection, pin: str, attempts: int = 1) -> bool:
    """Inject the user's own PIN via input events. Returns True once unlocked."""
    for _ in range(max(1, attempts)):
        detect = detect_lock_state(adb)
        if detect.unlocked:
            return True
        if not detect.lockscreen_showing:
            continue
        try:
            _wake_screen(adb)
            _swipe_up(adb)
            time.sleep(0.5)
            _type_pin(adb, pin)
            time.sleep(0.4)
            adb.run_command("input keyevent 66")
        except ADBError:
            pass
        time.sleep(1.0)
        if detect_lock_state(adb).unlocked:
            return True
    return False


def unlock_with_pattern(adb: ADBConnection, pattern: str, attempts: int = 1) -> bool:
    """Inject a 3x3 pattern (digits 0-8, e.g. '012578') as one gesture."""
    for _ in range(max(1, attempts)):
        detect = detect_lock_state(adb)
        if detect.unlocked:
            return True
        if not detect.lockscreen_showing:
            continue
        try:
            _wake_screen(adb)
            _swipe_up(adb)
            time.sleep(0.5)
            _draw_pattern(adb, pattern)
        except ADBError:
            pass
        time.sleep(1.0)
        if detect_lock_state(adb).unlocked:
            return True
    return False


def wait_until_unlocked(adb: ADBConnection, timeout: float = 90) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if detect_lock_state(adb).unlocked:
            return True
        time.sleep(2)
    return False


def wait_until_authorized(adb: ADBConnection, timeout: float = 180) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if detect_lock_state(adb).authorized:
            return True
        time.sleep(2)
    return False


__all__ = [
    "LockState",
    "UnauthorizedError",
    "UnlockError",
    "detect_lock_state",
    "unlock_with_pattern",
    "unlock_with_pin",
    "wait_for_boot",
    "wait_until_authorized",
    "wait_until_unlocked",
]