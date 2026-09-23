"""Fetch adb (and required libs) without committing binaries to git.

Downloads the official Android SDK Platform Tools zip for the target
platform, extracts only the needed files, and places them in
``gui/resources/bin/<win|linux>/`` for electron-builder to bundle.

Licensing rationale: the binaries originate from the Apache-2.0-licensed
AOSP sources (platform/packages/modules/adb) — the same basis established
Android tooling projects (e.g. Genymobile/scrcpy) rely on when bundling
these binaries. See NOTICE-THIRD-PARTY.md for the full rationale
(AOSP origin, Android.bp license declaration, scrcpy precedent, upstream
attribution) and re-verify it before publishing an installer that embeds
them.

Usage (from the repo root)::

    python scripts/fetch-adb.py                  # auto-detect platform
    python scripts/fetch-adb.py --platform win
    python scripts/fetch-adb.py --platform linux
    python scripts/fetch-adb.py --platform all   # both (needs no unzip conflicts)

The binaries are git-ignored (see ``.gitignore``) — they are downloaded at
release-build time, never stored in the repo.
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BIN_ROOT = REPO_ROOT / "gui" / "resources" / "bin"

BASE_URL = "https://dl.google.com/android/repository"

# zip name -> (platform dir, members to extract: zip path -> output name)
PLATFORMS = {
    "win": (
        "platform-tools-latest-windows.zip",
        {
            "platform-tools/adb.exe": "adb.exe",
            "platform-tools/AdbWinApi.dll": "AdbWinApi.dll",
            "platform-tools/AdbWinUsbApi.dll": "AdbWinUsbApi.dll",
        },
    ),
    "linux": (
        "platform-tools-latest-linux.zip",
        {
            "platform-tools/adb": "adb",
        },
    ),
}


def detect_platform_dir() -> str:
    system = platform.system().lower()
    if system == "windows":
        return "win"
    if system == "linux":
        return "linux"
    raise SystemExit(f"Unsupported platform: {platform.system()} (expected Windows or Linux)")


def download(url: str, dest: Path) -> None:
    print(f"Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Pehredar-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh)
    print(f"Saved {dest} ({dest.stat().st_size / (1024 * 1024):.1f} MiB)")


def fetch_one(platform_dir: str, out_root: Path) -> list[Path]:
    zip_name, members = PLATFORMS[platform_dir]
    out_dir = out_root / platform_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    url = f"{BASE_URL}/{zip_name}"
    produced: list[Path] = []
    with tempfile.TemporaryDirectory(prefix="pehredar-adb-") as tmp:
        zpath = Path(tmp) / zip_name
        download(url, zpath)
        with zipfile.ZipFile(zpath) as zf:
            names = set(zf.namelist())
            for member, out_name in members.items():
                if member not in names:
                    print(f"WARNING: {member} not found in {zip_name}; skipping")
                    continue
                target = out_dir / out_name
                with zf.open(member) as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                produced.append(target)
                print(f"Extracted {member} -> {target}")
    if platform_dir == "linux":
        for p in produced:
            os.chmod(p, 0o755)
    return produced


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch adb binaries for bundling.")
    parser.add_argument("--platform", choices=["win", "linux", "all", "auto"], default="auto")
    parser.add_argument("--out", default=str(BIN_ROOT), help="Bin root (default: gui/resources/bin)")
    args = parser.parse_args()

    if args.platform == "auto":
        targets = [detect_platform_dir()]
    elif args.platform == "all":
        targets = ["win", "linux"]
    else:
        targets = [args.platform]

    all_produced: list[Path] = []
    for target in targets:
        all_produced.extend(fetch_one(target, Path(args.out)))

    if not all_produced:
        raise SystemExit("Nothing was extracted — aborting.")
    print("\nDone. Binaries ready for electron-builder:")
    for p in all_produced:
        print(f"  {p}")


if __name__ == "__main__":
    main()
