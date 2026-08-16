from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass


class FastbootError(Exception):
    pass


@dataclass
class FastbootDevice:
    serial: str
    status: str


class FastbootConnection:
    """Thin wrapper around the `fastboot` host binary.

    Only used for authorized/owned devices during the Root Agent workflow
    (bootloader unlock, `fastboot boot` / `fastboot flash boot`).
    """

    def __init__(self, fastboot_path: str = "fastboot"):
        self.fastboot_path = fastboot_path or "fastboot"
        self._serial: str | None = None

    def _run(self, args: list[str], timeout: float = 30) -> subprocess.CompletedProcess:
        cmd = [self.fastboot_path]
        if self._serial:
            cmd.extend(["-s", self._serial])
        cmd.extend(args)
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        except FileNotFoundError:
            raise FastbootError(
                f"fastboot not found at '{self.fastboot_path}'. Install Android Platform Tools."
            )
        except subprocess.TimeoutExpired:
            raise FastbootError(f"fastboot timed out after {timeout:.1f}s: {' '.join(cmd)}")

    def list_devices(self) -> list[FastbootDevice]:
        result = self._run(["devices"])
        devices = []
        for line in result.stdout.strip().splitlines()[1:]:
            parts = line.strip().split()
            if len(parts) >= 2:
                devices.append(FastbootDevice(serial=parts[0], status=parts[1]))
        return devices

    def run(self, *args: str, timeout: float = 30) -> tuple[str, str, int]:
        result = self._run(list(args), timeout=timeout)
        return result.stdout.strip(), result.stderr.strip(), result.returncode

    def wait_for_device(self, timeout: float = 60) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.list_devices():
                return True
            time.sleep(1)
        return False
