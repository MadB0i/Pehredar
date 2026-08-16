from __future__ import annotations

from dataclasses import asdict, dataclass

from ..adb import ADBConnection


@dataclass
class DeviceFingerprint:
    manufacturer: str
    model: str
    android_version: str
    sdk: str
    build_id: str
    security_patch: str
    bootloader_state: str
    oem: str

    def as_dict(self) -> dict:
        return asdict(self)


def _normalize_oem(manufacturer: str) -> str:
    m = manufacturer.lower()
    if "google" in m or "pixel" in m:
        return "pixel"
    if "samsung" in m:
        return "samsung"
    if "xiaomi" in m or "redmi" in m or "poco" in m:
        return "xiaomi"
    if "oneplus" in m:
        return "oneplus"
    if "oppo" in m or "realme" in m:
        return "oppo"
    if "vivo" in m or "bbk" in m:
        return "vivo"
    return "generic"


def _read_bootloader_state(adb: ADBConnection) -> str:
    vbmeta = adb.getprop("ro.boot.vbmeta.device_state").strip().lower()
    if vbmeta in ("locked", "unlocked"):
        return vbmeta
    flash = adb.getprop("ro.boot.flash.locked").strip()
    if flash == "1":
        return "locked"
    if flash == "0":
        return "unlocked"
    verified = adb.getprop("ro.boot.verifiedbootstate").strip().lower()
    if verified == "green":
        return "locked"
    if verified == "orange":
        return "unlocked"
    return "unknown"


def fingerprint_device(adb: ADBConnection) -> DeviceFingerprint:
    """Gather device identity without rebooting (all read-only getprop)."""
    manufacturer = (adb.getprop("ro.product.manufacturer") or adb.getprop("ro.product.brand") or "unknown").strip()
    model = (adb.getprop("ro.product.model") or "unknown").strip()
    version = (adb.getprop("ro.build.version.release") or "unknown").strip()
    sdk = (adb.getprop("ro.build.version.sdk") or "unknown").strip()
    build_id = (adb.getprop("ro.build.id") or adb.getprop("ro.build.display.id") or "unknown").strip()
    patch = (adb.getprop("ro.build.version.security_patch") or "unknown").strip()
    return DeviceFingerprint(
        manufacturer=manufacturer,
        model=model,
        android_version=version,
        sdk=sdk,
        build_id=build_id,
        security_patch=patch,
        bootloader_state=_read_bootloader_state(adb),
        oem=_normalize_oem(manufacturer),
    )
