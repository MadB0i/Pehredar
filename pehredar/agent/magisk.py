from __future__ import annotations

import os
import shutil
import subprocess

from ..adb import ADBConnection, ADBError
from .fastboot import FastbootConnection
from .root_planner import UNLOCK_COMMANDS


def has_root(adb: ADBConnection) -> bool:
    try:
        stdout, _, code = adb.run_command("su -c id 2>/dev/null")
        return code == 0 and "uid=0" in stdout
    except ADBError:
        return False


def extract_boot_image(adb: ADBConnection, workdir: str, boot_img: str | None = None) -> str:
    """Return a local path to boot.img, pulling it from the device when possible."""
    if boot_img and os.path.exists(boot_img):
        return boot_img
    os.makedirs(workdir, exist_ok=True)
    local = os.path.join(workdir, "boot.img")

    if has_root(adb):
        _, _, code = adb.run_command("dd if=/dev/block/by-name/boot of=/sdcard/boot.img bs=4096")
        if code == 0:
            adb.run_command("chmod 644 /sdcard/boot.img")
            _, _, pull_code = adb.host("pull", "/sdcard/boot.img", local)
            if pull_code == 0 and os.path.exists(local):
                return local
            raise ADBError("boot image pull failed over root dd")

    _, _, pull_code = adb.host("pull", "/dev/block/by-name/boot", local)
    if pull_code == 0 and os.path.exists(local):
        return local
    raise ADBError("Could not extract the boot image automatically. Provide one via --boot-img.")


def find_magiskboot(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    found = shutil.which("magiskboot")
    if found:
        return found
    raise ADBError("magiskboot not found. Install Magisk (it ships magiskboot) or pass --magiskboot.")


def patch_boot_image(magiskboot: str, boot_img: str, workdir: str) -> str:
    os.makedirs(workdir, exist_ok=True)
    base = os.path.join(workdir, "unpack")
    os.makedirs(base, exist_ok=True)
    shutil.copy(boot_img, os.path.join(base, "boot.img"))

    def run(cmd: list[str]) -> None:
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=base, check=False)
        if proc.returncode != 0:
            raise ADBError(f"magiskboot {cmd[1]} failed: {proc.stderr.strip() or proc.stdout.strip()}")

    run([magiskboot, "unpack", "boot.img"])
    run([magiskboot, "cpio", "ramdisk.cpio", "patch"])
    run([magiskboot, "repack", "boot.img"])

    patched = os.path.join(base, "new-boot.img")
    if not os.path.exists(patched):
        raise ADBError("magiskboot did not produce new-boot.img")
    out = os.path.join(workdir, "boot_patched.img")
    shutil.copy(patched, out)
    return out


def unlock_bootloader(fb: FastbootConnection, oem: str) -> None:
    args = UNLOCK_COMMANDS.get(oem, ["flashing", "unlock"])
    stdout, stderr, code = fb.run(*args)
    if code != 0:
        raise ADBError(f"bootloader unlock failed: {stderr or stdout}")


def apply_boot(fb: FastbootConnection, patched_img: str, mode: str) -> None:
    if mode == "permanent":
        stdout, stderr, code = fb.run("flash", "boot", patched_img)
        if code != 0:
            raise ADBError(f"fastboot flash boot failed: {stderr or stdout}")
        fb.run("reboot")
    else:
        stdout, stderr, code = fb.run("boot", patched_img)
        if code != 0:
            raise ADBError(f"fastboot boot failed: {stderr or stdout}")