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
from .unlock import (
    UnlockError,
    _wake_screen,
    detect_lock_state,
    unlock_with_pattern,
    unlock_with_pin,
    wait_for_boot,
    wait_until_authorized,
    wait_until_unlocked,
)
from .verify import verify_root, verify_unlock, wait_for_adb


def auto_unlock(
    adb: ADBConnection,
    unlock_config: dict | None = None,
    on_event=None,
) -> None:
    """Re-gain an authorized, unlocked session after a reboot.

    - Device reports `unauthorized` (credential-encrypted ADB key): emits a
      `device-action` checkpoint and waits for the user to unlock once on the
      screen — this cannot be automated.
    - Authorized but lockscreen showing: injects the user's own PIN/pattern if
      provided, otherwise emits a manual checkpoint and waits.
    """
    unlock_config = unlock_config or {}
    if on_event:
        on_event({"type": "unlock", "state": "start", "detail": "checking device state after reboot"})

    state = detect_lock_state(adb)
    if not state.authorized:
        if on_event:
            on_event(
                {
                    "type": "device-action",
                    "action": "unlock",
                    "detail": "ADB key is stored in encrypted storage. Unlock the device on its screen once to re-authorize this computer.",
                }
            )
        if not wait_until_authorized(adb, timeout=float(unlock_config.get("timeout", 180))):
            raise UnlockError("device did not re-authorize after reboot — unlock it on-screen and try again")

    # `adb devices` reports "device" before Android finishes booting, so the
    # keyguard is not up yet. Wait for boot to complete and wake the screen so
    # lockscreen detection sees the real state instead of falsely reporting an
    # unlocked (or pre-lockscreen) device.
    if on_event:
        on_event({"type": "unlock", "state": "action", "detail": "waiting for device to finish booting"})
    wait_for_boot(adb, timeout=float(unlock_config.get("timeout", 90)))
    _wake_screen(adb)
    state = detect_lock_state(adb)

    if state.lockscreen_showing:
        pin = unlock_config.get("pin")
        pattern = unlock_config.get("pattern")
        attempts = int(unlock_config.get("attempts", 1))
        unlocked = False
        if pin:
            if on_event:
                on_event(
                    {
                        "type": "unlock",
                        "state": "action",
                        "method": "pin",
                        "secret": pin,
                        "detail": f"typing PIN {pin} on device",
                    }
                )
            unlocked = unlock_with_pin(adb, pin, attempts=attempts)
        elif pattern:
            if on_event:
                on_event(
                    {
                        "type": "unlock",
                        "state": "action",
                        "method": "pattern",
                        "secret": pattern,
                        "detail": f"drawing pattern {pattern} on device",
                    }
                )
            unlocked = unlock_with_pattern(adb, pattern, attempts=attempts)
        else:
            if on_event:
                on_event(
                    {
                        "type": "device-action",
                        "action": "unlock",
                        "detail": "Enter the device lock on its screen to continue (or provide PIN/pattern to auto-unlock).",
                    }
                )
            unlocked = wait_until_unlocked(adb, timeout=float(unlock_config.get("timeout", 120)))
        if not unlocked:
            if on_event:
                on_event(
                    {
                        "type": "device-action",
                        "action": "unlock",
                        "detail": "Auto-unlock did not succeed. Unlock the device on its screen to continue.",
                    }
                )
            raise UnlockError("device did not unlock — check the PIN/pattern or unlock manually")
        if on_event:
            on_event({"type": "unlock", "state": "ok", "detail": "device unlocked"})
    else:
        if on_event:
            on_event({"type": "unlock", "state": "ok", "detail": "device already accessible"})


def run_root_agent(
    adb: ADBConnection,
    fb: FastbootConnection,
    mode: str = "temporary",
    workdir: str = ".pehredar-agent",
    magiskboot_path: str | None = None,
    boot_img: str | None = None,
    unlock_config: dict | None = None,
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
                # wait for the device to come back over adb, then re-establish an
                # authorized+unlocked session before verifying root.
                if not wait_for_adb(adb):
                    raise ADBError("device did not come back online after reboot")
                auto_unlock(adb, unlock_config, on_event)
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
    "UnlockError",
    "auto_unlock",
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