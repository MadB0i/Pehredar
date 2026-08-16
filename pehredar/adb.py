from __future__ import annotations

import subprocess
from dataclasses import dataclass


@dataclass
class Device:
    serial: str
    status: str


class ADBError(Exception):
    pass


class NoDeviceError(ADBError):
    pass


class UnauthorizedError(ADBError):
    pass


class ADBConnection:
    def __init__(self, serial: str | None = None):
        self.serial = serial
        self._device_serial: str | None = None

    def _run_adb(self, args: list[str], shell: bool = False) -> subprocess.CompletedProcess:
        cmd = ["adb"]
        if self._device_serial:
            cmd.extend(["-s", self._device_serial])
        elif self.serial:
            cmd.extend(["-s", self.serial])
        if shell:
            cmd.append("shell")
        cmd.extend(args)
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
        except FileNotFoundError:
            raise ADBError(
                "ADB not found on PATH. Install Android Platform Tools and ensure "
                "'adb' is available."
            )
        except subprocess.TimeoutExpired:
            raise ADBError(f"ADB command timed out: {' '.join(cmd)}")
        return result

    def list_devices(self) -> list[Device]:
        result = self._run_adb(["devices"])
        if result.returncode != 0:
            raise ADBError(f"adb devices failed: {result.stderr}")

        devices = []
        lines = result.stdout.strip().split("\n")[1:]
        for line in lines:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) == 2:
                devices.append(Device(serial=parts[0], status=parts[1]))
        return devices

    def connect(self) -> str:
        devices = self.list_devices()
        if not devices:
            raise NoDeviceError("No devices connected. Enable USB debugging and connect device.")

        authorized_devices = [d for d in devices if d.status == "device"]
        if not authorized_devices:
            unauthorized = [d for d in devices if d.status == "unauthorized"]
            if unauthorized:
                raise UnauthorizedError(
                    f"Device {unauthorized[0].serial} is unauthorized. "
                    "Accept the USB debugging prompt on the device."
                )
            raise ADBError(f"No authorized devices. Found: {devices}")

        self._device_serial = authorized_devices[0].serial
        return self._device_serial

    def shell(self, command: str) -> tuple[str, str, int]:
        result = self._run_adb([command], shell=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode

    def getprop(self, prop: str) -> str:
        stdout, _, code = self.shell(f"getprop {prop}")
        if code != 0:
            return ""
        return stdout

    def run_command(self, command: str) -> tuple[str, str, int]:
        return self.shell(command)