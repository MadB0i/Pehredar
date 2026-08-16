from __future__ import annotations

import time

from ..adb import ADBConnection, ADBError
from ..checks import check_root_packages, check_su_binary
from .fingerprint import fingerprint_device


def wait_for_adb(adb: ADBConnection, timeout: float = 90) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            devices = adb.list_devices()
            present = [d for d in devices if d.status in ("device", "unauthorized")]
            if present:
                if not adb._device_serial:  # noqa: PLW0212 - internal helper reuse
                    try:
                        adb.connect()
                    except ADBError:
                        # unauthorized: the caller (auto_unlock) owns the checkpoint
                        pass
                return True
        except ADBError:
            pass
        time.sleep(2)
    return False


def verify_root(adb: ADBConnection) -> dict:
    su = check_su_binary(adb)
    rp = check_root_packages(adb)
    rooted = (not su.passed) or (not rp.passed)
    return {
        "rooted": rooted,
        "detail": "Root indicators detected" if rooted else "No root indicators found",
        "checks": [
            {
                "name": su.name,
                "passed": su.passed,
                "outcome": su.status,
                "evidence": su.evidence,
            },
            {
                "name": rp.name,
                "passed": rp.passed,
                "outcome": rp.status,
                "evidence": rp.evidence,
            },
        ],
    }


def verify_unlock(adb: ADBConnection) -> dict:
    fp = fingerprint_device(adb)
    return {"unlocked": fp.bootloader_state == "unlocked", "state": fp.bootloader_state}