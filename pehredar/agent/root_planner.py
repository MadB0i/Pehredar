from __future__ import annotations

from dataclasses import dataclass, field

from .fingerprint import DeviceFingerprint


@dataclass
class PlanStep:
    id: str
    title: str
    detail: str
    destructive: bool = False
    device_confirm: bool = False

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "detail": self.detail,
            "destructive": self.destructive,
            "device_confirm": self.device_confirm,
        }


@dataclass
class RootPlan:
    mode: str
    steps: list[PlanStep]
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "mode": self.mode,
            "steps": [s.as_dict() for s in self.steps],
            "notes": self.notes,
        }


UNLOCK_COMMANDS = {
    "pixel": ["flashing", "unlock"],
    "oneplus": ["flashing", "unlock"],
    "generic": ["flashing", "unlock"],
    "samsung": ["oem", "unlock"],
    "xiaomi": ["oem", "unlock"],
    "oppo": ["oem", "unlock"],
    "vivo": ["oem", "unlock"],
}


def build_root_plan(fp: DeviceFingerprint, mode: str = "temporary") -> RootPlan:
    mode = mode if mode in ("temporary", "permanent") else "temporary"
    steps: list[PlanStep] = []
    notes: list[str] = []

    if fp.bootloader_state == "unknown":
        notes.append(
            "Bootloader state could not be read; the unlock step will be attempted if the device reports a locked state."
        )

    if fp.bootloader_state != "unlocked":
        steps.append(
            PlanStep(
                id="unlock",
                title="Unlock bootloader",
                detail="OEM-unlock so a custom boot image can be booted/flashed. This ERASES ALL DATA on the device and requires confirmation on the device screen.",
                destructive=True,
                device_confirm=True,
            )
        )
    else:
        notes.append("Bootloader is already unlocked — skipping the unlock step.")

    steps.append(
        PlanStep(
            id="extract_boot",
            title="Extract boot image",
            detail="Pull the boot partition from the device (via root) or use a provided boot.img path.",
        )
    )
    steps.append(
        PlanStep(
            id="patch_boot",
            title="Patch boot image with Magisk",
            detail="Run magiskboot to inject the Magisk ramdisk into the boot image.",
        )
    )
    if mode == "temporary":
        steps.append(
            PlanStep(
                id="apply",
                title="Boot patched image",
                detail="fastboot boot boot_patched.img — temporary root, does NOT modify the boot partition.",
            )
        )
    else:
        steps.append(
            PlanStep(
                id="apply",
                title="Flash patched boot image",
                detail="fastboot flash boot boot_patched.img — permanently replaces the boot partition.",
                destructive=True,
            )
        )
    steps.append(PlanStep(id="reboot", title="Reboot device", detail="Boot the device with the modified boot image."))
    steps.append(
        PlanStep(
            id="verify",
            title="Verify root",
            detail="Re-run Pehredar detection checks to confirm root is present.",
        )
    )

    return RootPlan(mode=mode, steps=steps, notes=notes)