from __future__ import annotations

from ..adb import ADBConnection, ADBError
from .fastboot import FastbootConnection
from .fingerprint import DeviceFingerprint, fingerprint_device
from .lockrecovery import LockRecoveryPlan, build_lock_recovery_plan, run_lock_recovery
from .magisk import (
    apply_boot,
    extract_boot_image,
    find_magiskboot,
    has_root,
    patch_boot_image,
    unlock_bootloader,
)
from .root_planner import PlanStep, RootPlan, build_root_plan
from .verify import verify_root, verify_unlock, wait_for_adb


def run_root_agent(
    adb: ADBConnection,
    fb: FastbootConnection,
    mode: str = "temporary",
    workdir: str = ".pehredar-agent",
    magiskboot_path: str | None = None,
    boot_img: str | None = None,
    on_event=None,
    confirm=None,
) -> dict:
    """Run the Root Agent workflow for an owned/authorized device.

    `on_event` receives JSON-able payloads for progress/UI; `confirm(step)`
    gates destructive steps and returns whether to proceed.
    """
    fp = fingerprint_device(adb)
    if on_event:
        on_event({"type": "fp", "fp": fp.as_dict()})
    plan = build_root_plan(fp, mode)
    if on_event:
        on_event({"type": "plan", "plan": plan.as_dict()})

    patched_img = None
    local_boot = None
    for step in plan.steps:
        if on_event:
            on_event({"type": "step", "id": step.id, "title": step.title, "state": "start"})
        try:
            if step.id == "unlock":
                if confirm and not confirm(step):
                    if on_event:
                        on_event({"type": "step", "id": step.id, "title": step.title, "state": "skipped"})
                    return {"ok": False, "error": "bootloader unlock declined"}
                adb.host("reboot", "bootloader")
                if not fb.wait_for_device():
                    raise ADBError("device did not appear in fastboot mode")
                unlock_bootloader(fb, fp.oem)
                # after unlock the device wipes and re-enters bootloader
                fb.run("reboot", "bootloader")
                if not fb.wait_for_device():
                    raise ADBError("device did not return to fastboot mode after unlock")
            elif step.id == "extract_boot":
                local_boot = extract_boot_image(adb, workdir, boot_img)
                if on_event:
                    on_event({"type": "detail", "id": step.id, "text": local_boot})
            elif step.id == "patch_boot":
                magiskboot = find_magiskboot(magiskboot_path)
                patched_img = patch_boot_image(magiskboot, local_boot, workdir)
                if on_event:
                    on_event({"type": "detail", "id": step.id, "text": patched_img})
            elif step.id == "apply":
                apply_boot(fb, patched_img, mode)
            elif step.id == "reboot":
                # fastboot boot already boots the device; a flash already reboots.
                # wait for the device to come back over adb before verifying.
                if not wait_for_adb(adb):
                    raise ADBError("device did not come back online after reboot")
            elif step.id == "verify":
                result = verify_root(adb)
                if on_event:
                    on_event(
                        {
                            "type": "verify",
                            "rooted": result["rooted"],
                            "detail": result["detail"],
                            "checks": result["checks"],
                        }
                    )
            if on_event:
                on_event({"type": "step", "id": step.id, "title": step.title, "state": "ok"})
        except ADBError as e:
            if on_event:
                on_event({"type": "step", "id": step.id, "title": step.title, "state": "error", "error": str(e)})
            return {"ok": False, "error": str(e)}

    return {"ok": True}


__all__ = [
    "ADBConnection",
    "ADBError",
    "DeviceFingerprint",
    "FastbootConnection",
    "LockRecoveryPlan",
    "PlanStep",
    "RootPlan",
    "build_lock_recovery_plan",
    "build_root_plan",
    "fingerprint_device",
    "has_root",
    "run_lock_recovery",
    "run_root_agent",
    "verify_root",
    "verify_unlock",
    "wait_for_adb",
]