"""Build GitHub Release notes: static installer intro + CHANGELOG section.

Usage:  python scripts/release_notes.py --version 1.1.0 [--changelog CHANGELOG.md]

Fails loudly when the version section is missing, so a release never
ships with empty notes. The tag-to-changelog contract: CHANGELOG.md must
contain a `## [<version>]` section before tagging.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

INTRO = """## Pehredar Desktop (zero-dependency)

**Non-technical users:** download the installer below — Python and
ADB are bundled inside, so just install, plug in your phone with
USB Debugging on, and click Scan.

- Windows: `Pehredar-*.exe` (NSIS installer, unsigned — accept the SmartScreen prompt, then verify `SHA256SUMS-win.txt`)
- Linux: `Pehredar-*.AppImage` (`chmod +x` then run, verify `SHA256SUMS-linux.txt`)

> Note: installers are currently **unsigned**. Windows will show an "Unknown publisher" warning. Verify the SHA256 checksum before running.
> The installer embeds adb built from the Apache-2.0-licensed AOSP sources — see NOTICE-THIRD-PARTY.md for the licensing basis.

"""


def extract_section(changelog: Path, version: str) -> str:
    text = changelog.read_text(encoding="utf-8")
    prefix = f"## [{version}]"
    lines = text.splitlines()
    try:
        start = next(i for i, ln in enumerate(lines) if ln.strip() == prefix or ln.strip().startswith(prefix + " "))
    except StopIteration:
        raise SystemExit(f"CHANGELOG has no {prefix} section — add it before tagging.")
    body = []
    for ln in lines[start:]:
        if body and re.match(r"^##(?!#)\s", ln):
            break
        body.append(ln)
    section = "\n".join(body).strip()
    if len(section.splitlines()) < 2:
        raise SystemExit(f"{heading} section is empty — fill it in before tagging.")
    return section


def main() -> int:
    parser = argparse.ArgumentParser(description="Build release notes from CHANGELOG.")
    parser.add_argument("--version", required=True, help="App version without leading v")
    parser.add_argument("--changelog", default="CHANGELOG.md")
    args = parser.parse_args()
    print(INTRO + extract_section(Path(args.changelog), args.version))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
