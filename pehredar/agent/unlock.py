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
            "dumpsys window | grep -E 'mDreamingLockscreen|mShowingLockscreen|mKeyguardShowing'"
        )
        lockscreen = "true" in out.lower()
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


def unlock_with_pin(adb: ADBConnection, pin: str, attempts: int = 1) -> bool:
    """Inject the user's own PIN via input events. Returns True once unlocked."""
    for _ in range(max(1, attempts)):
        detect = detect_lock_state(adb)
        if detect.unlocked:
            return True
        if not detect.lockscreen_showing:
            continue
        try:
            _swipe_up(adb)
            time.sleep(0.4)
            adb.run_command(f"input text {pin}")
            time.sleep(0.3)
            adb.run_command("input keyevent 66")
        except ADBError:
            pass
        time.sleep(1.0)
        if detect_lock_state(adb).unlocked:
            return True
    return False


def unlock_with_pattern(adb: ADBConnection, pattern: str, attempts: int = 1) -> bool:
    """Inject a 3x3 pattern (digits 0-8, e.g. '012578') as swipe gestures."""
    for _ in range(max(1, attempts)):
        detect = detect_lock_state(adb)
        if detect.unlocked:
            return True
        if not detect.lockscreen_showing:
            continue
        try:
            _swipe_up(adb)
            time.sleep(0.4)
            w, h = _screen_size(adb)
            pts = [int(c) for c in pattern if c.isdigit()]
            if len(pts) < 2:
                return False
            coords = [_grid_point(p, w, h) for p in pts]
            for i in range(len(coords) - 1):
                x1, y1 = coords[i]
                x2, y2 = coords[i + 1]
                adb.run_command(f"input swipe {x1} {y1} {x2} {y2} 180")
                time.sleep(0.25)
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