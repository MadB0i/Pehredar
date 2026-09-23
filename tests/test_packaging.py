"""Packaging guard: every file main.js requires at runtime must be shipped
inside app.asar (package.json build.files). This is the regression test
for the "Cannot find module './scripts/bundled-paths'" packaged crash —
dev mode reads from disk, so only this test catches files[] gaps.
"""

from __future__ import annotations

import fnmatch
import json
import re
from pathlib import Path

GUI_DIR = Path(__file__).resolve().parent.parent / "gui"

# main.js requires electron and node builtins too — only relative requires
# resolve to packaged files.
_REQUIRE_RE = re.compile(r"""require\(\s*["'](\.[^"']+)["']\s*\)""")

# Modules every Electron main process always has; never packaged files.
BUILTINS = {"electron", "child_process", "fs", "path", "os", "util", "events", "url"}


def _files_patterns() -> list[str]:
    config = json.loads((GUI_DIR / "package.json").read_text(encoding="utf-8"))
    return config["build"]["files"]


def _covered(relative_posix: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if pattern.endswith("/**/*"):
            if relative_posix == pattern[: -len("/**/*")] or relative_posix.startswith(
                pattern[: -len("**/*")]
            ):
                return True
        elif "*" in pattern:
            if fnmatch.fnmatchcase(relative_posix, pattern):
                return True
        elif relative_posix == pattern:
            return True
    return False


def _relative_requires(entry: Path) -> set[str]:
    found: set[str] = set()
    for match in _REQUIRE_RE.finditer(entry.read_text(encoding="utf-8")):
        spec = match.group(1)
        target = (entry.parent / spec).resolve()
        if target.suffix == "":
            target = target.with_suffix(".js")
        found.add(target.relative_to(GUI_DIR.resolve()).as_posix())
    return found


def test_main_requires_are_packaged():
    patterns = _files_patterns()
    missing = sorted(r for r in _relative_requires(GUI_DIR / "main.js") if not _covered(r, patterns))
    assert not missing, f"required at runtime by main.js but missing from build.files: {missing}"


def test_bundled_paths_explicitly_packaged():
    # The exact file behind the packaged-launch crash; belt and braces on
    # top of the generic test above.
    patterns = _files_patterns()
    assert _covered("scripts/bundled-paths.js", patterns)
    assert (GUI_DIR / "scripts" / "bundled-paths.js").exists()
