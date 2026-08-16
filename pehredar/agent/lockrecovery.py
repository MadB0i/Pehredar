from __future__ import annotations

from dataclasses import dataclass, field

from ..adb import ADBConnection, ADBError
from .fingerprint import DeviceFingerprint
from .magisk import has_root
from .root_planner import PlanStep


@dataclass
class LockRecoveryPlan:
    steps: list[PlanStep]
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"steps": [s.as_dict() for s in self.steps], "notes": self.notes}


def _sdk_int(sdk: str) -> int:
    try:
        return int(sdk)
    except (TypeError, ValueError):
        return 0


def build_lock_recovery_plan(fp: DeviceFingerprint, rooted: bool) -> LockRecoveryPlan:
    steps: list[PlanStep] = []
    notes: list[str] = ["Only works when USB debugging is already enabled and authorized on the device."]

    if _sdk_int(fp.sdk) >= 28:
        steps.append(
            PlanStep(
                id="clear",
                title="Clear lock via ADB",
                detail="adb shell locksettings clear — removes the PIN/pattern/password on devices with authorized USB debugging.",
            )
        )
        steps.append(PlanStep(id="verify", title="Verify lock cleared", detail="Check whether a secure lock is still set."))
    else:
        notes.append("Android 9+ is required for locksettings clear; older builds use key-file removal below.")

    if rooted:
        steps.append(
            PlanStep(
                id="remove_keys",
                title="Remove lock key files",
                detail="Delete locksettings.db / gesture.key / password.key from /data/system (requires root).",
                destructive=True,
            )
        )
        steps.append(PlanStep(id="reboot", title="Reboot device", detail="Apply the cleared lock state."))
    else:
        notes.append("Device is not rooted; key-file removal is unavailable.")

    if not steps:
        steps.append(PlanStep(id="none", title="No recovery path", detail="No applicable method for this device state."))

    return LockRecoveryPlan(steps=steps, notes=notes)


def run_lock_recovery(
    adb: ADBConnection,
    fp: DeviceFingerprint,
    on_event=None,
    confirm=None,
    rooted: bool | None = None,
) -> dict:
    rooted = has_root(adb) if rooted is None else rooted
    plan = build_lock_recovery_plan(fp, rooted)
    if on_event:
        on_event({"type": "plan", "plan": plan.as_dict()})

    for step in plan.steps:
        if on_event:
            on_event({"type": "step", "id": step.id, "title": step.title, "state": "start"})
        try:
            if step.id == "clear":
                stdout, stderr, code = adb.run_command("locksettings clear")
                if code != 0:
                    raise ADBError(f"locksettings clear failed: {stderr or stdout}")
            elif step.id == "remove_keys":
                if confirm and not confirm(step):
                    if on_event:
                        on_event({"type": "step", "id": step.id, "title": step.title, "state": "skipped"})
                    continue
                adb.run_command(
                    "su -c 'rm -f /data/system/locksettings.db /data/system/gesture.key /data/system/password.key'"
                )
            elif step.id == "reboot":
                adb.host("reboot")
            elif step.id == "verify":
                stdout, _, code = adb.run_command("locksettings get-disabled 2>/dev/null")
                detail = (stdout or "unknown").strip()
                if on_event:
                    on_event({"type": "verify", "disabled": detail})
            if on_event:
                on_event({"type": "step", "id": step.id, "title": step.title, "state": "ok"})
        except ADBError as e:
            if on_event:
                on_event({"type": "step", "id": step.id, "title": step.title, "state": "error", "error": str(e)})
            return {"ok": False, "error": str(e)}

    return {"ok": True, "rooted": rooted}