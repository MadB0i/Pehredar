"""Bundled-binary path resolution (shared contract with the Electron GUI).

The packaged app ships a standalone ``pehredar-core`` binary plus an
``adb`` binary under::

    <resources>/bin/<platform-dir>/

where ``<platform-dir>`` is ``win`` on Windows and ``linux`` on Linux.
``gui/scripts/bundled-paths.js`` implements the same contract in JS for
``gui/main.js`` — keep the two in sync (names, layout, error wording).

In dev (``is_packaged=False``) the GUI falls back to ``python -m
pehredar.cli`` and ``adb`` from ``PATH``, exactly as before.
"""

from __future__ import annotations

import os
from collections.abc import Callable

CORE_SCAN_BASENAME = "pehredar-core"

#: Electron ``process.platform`` -> bundled ``bin/<dir>`` segment.
PLATFORM_DIR_MAP = {
    "win32": "win",
    "linux": "linux",
}


def platform_dir(platform: str) -> str | None:
    """Map an Electron ``process.platform`` value to a bundled bin dir."""
    return PLATFORM_DIR_MAP.get(platform)


def core_binary_name(dir_name: str) -> str:
    """File name of the bundled core binary for a platform dir."""
    return CORE_SCAN_BASENAME + (".exe" if dir_name == "win" else "")


def adb_binary_name(dir_name: str) -> str:
    """File name of the bundled adb binary for a platform dir."""
    return "adb.exe" if dir_name == "win" else "adb"


def bundled_bin_dir(resources_path: str, platform: str) -> str | None:
    """Absolute ``bin/<dir>`` path, or ``None`` on unsupported platforms."""
    dir_name = platform_dir(platform)
    if dir_name is None:
        return None
    return os.path.join(resources_path, "bin", dir_name)


def bundled_core_path(resources_path: str, platform: str) -> str | None:
    """Absolute path of the bundled core binary, or ``None`` if unsupported."""
    bin_dir = bundled_bin_dir(resources_path, platform)
    if bin_dir is None:
        return None
    dir_name = platform_dir(platform) or ""
    return os.path.join(bin_dir, core_binary_name(dir_name))


def bundled_adb_path(resources_path: str, platform: str) -> str | None:
    """Absolute path of the bundled adb binary, or ``None`` if unsupported."""
    bin_dir = bundled_bin_dir(resources_path, platform)
    if bin_dir is None:
        return None
    dir_name = platform_dir(platform) or ""
    return os.path.join(bin_dir, adb_binary_name(dir_name))


def resolve_launch(
    *,
    is_packaged: bool,
    resources_path: str,
    platform: str,
    settings_adb_path: str | None = None,
    exists: Callable[[str], bool] = os.path.exists,
) -> dict:
    """Decide how the GUI should launch the core and adb.

    Returns a dict with ``mode`` (``"bundled"`` | ``"dev"``), ``command``
    (binary or python), ``args_prefix`` (``[]`` bundled, ``["-m",
    "pehredar.cli"]`` dev), ``adb_path``, and ``error`` (``None`` when OK,
    otherwise a human-readable message for the GUI to display instead of
    crashing silently).
    """
    custom_adb = (settings_adb_path or "").strip()

    if not is_packaged:
        return {
            "mode": "dev",
            "command": "python-fallback",
            "args_prefix": ["-m", "pehredar.cli"],
            "adb_path": custom_adb or "adb",
            "error": None,
        }

    dir_name = platform_dir(platform)
    if dir_name is None:
        return {
            "mode": "bundled",
            "command": None,
            "args_prefix": [],
            "adb_path": custom_adb or "adb",
            "error": (
                f"Pehredar's packaged app does not support this platform ('{platform}'). "
                "Run from source instead: install Python 3.8+ and adb, then "
                "`pip install -e .` (see README Quick Start)."
            ),
        }

    core = bundled_core_path(resources_path, platform)
    assert core is not None  # guaranteed by the dir_name check above
    if not exists(core):
        return {
            "mode": "bundled",
            "command": None,
            "args_prefix": [],
            "adb_path": custom_adb or (bundled_adb_path(resources_path, platform) or "adb"),
            "error": (
                f"Bundled scanner is missing ({core}). "
                "Reinstall Pehredar from the latest GitHub Release — "
                "if the problem persists, file an issue with your installer version."
            ),
        }

    adb = custom_adb or (bundled_adb_path(resources_path, platform) or "adb")
    if not custom_adb and not exists(adb):
        return {
            "mode": "bundled",
            "command": core,
            "args_prefix": [],
            "adb_path": adb,
            "error": (
                f"Bundled adb is missing ({adb}). The scanner cannot talk to your phone. "
                "Reinstall Pehredar from the latest GitHub Release, or point "
                "Settings → ADB path at a manual platform-tools install."
            ),
        }

    return {
        "mode": "bundled",
        "command": core,
        "args_prefix": [],
        "adb_path": adb,
        "error": None,
    }
