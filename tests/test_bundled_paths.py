"""Tests for pehredar/bundled.py — the testable mirror of the Electron
bundled-binary resolution (gui/scripts/bundled-paths.js + gui/main.js).

The JS side is mocked by parameter: ``is_packaged`` stands in for
``app.isPackaged``, ``resources_path`` for ``process.resourcesPath`` and
``platform`` for ``process.platform``.
"""

import os

from pehredar import bundled


def _exists_nothing(path):
    return False


def _exists_everything(path):
    return True


def test_platform_dir_mapping():
    assert bundled.platform_dir("win32") == "win"
    assert bundled.platform_dir("linux") == "linux"
    assert bundled.platform_dir("darwin") is None
    assert bundled.platform_dir("sunos") is None


def test_binary_names_per_platform():
    assert bundled.core_binary_name("win") == "pehredar-core.exe"
    assert bundled.core_binary_name("linux") == "pehredar-core"
    assert bundled.adb_binary_name("win") == "adb.exe"
    assert bundled.adb_binary_name("linux") == "adb"


def test_bundled_paths_layout_win():
    base = "C:\\Program Files\\Pehredar\\resources"
    assert bundled.bundled_bin_dir(base, "win32") == os.path.join(base, "bin", "win")
    assert bundled.bundled_core_path(base, "win32").endswith("pehredar-core.exe")
    assert bundled.bundled_adb_path(base, "win32").endswith("adb.exe")


def test_bundled_paths_layout_linux():
    base = "/opt/Pehredar/resources"
    assert bundled.bundled_bin_dir(base, "linux") == os.path.join(base, "bin", "linux")
    assert bundled.bundled_core_path(base, "linux") == os.path.join(
        base, "bin", "linux", "pehredar-core"
    )
    assert bundled.bundled_adb_path(base, "linux") == os.path.join(base, "bin", "linux", "adb")


def test_unsupported_platform_returns_none():
    assert bundled.bundled_bin_dir("/x", "darwin") is None
    assert bundled.bundled_core_path("/x", "darwin") is None
    assert bundled.bundled_adb_path("/x", "darwin") is None


def test_dev_fallback_uses_system_python_and_path_adb():
    res = bundled.resolve_launch(is_packaged=False, resources_path="/x", platform="win32")
    assert res["mode"] == "dev"
    assert res["error"] is None
    assert res["args_prefix"] == ["-m", "pehredar.cli"]
    assert res["adb_path"] == "adb"


def test_dev_respects_settings_adb_override():
    res = bundled.resolve_launch(
        is_packaged=False,
        resources_path="/x",
        platform="linux",
        settings_adb_path="C:\\tools\\adb.exe",
    )
    assert res["adb_path"] == "C:\\tools\\adb.exe"


def test_packaged_picks_bundled_binaries():
    res = bundled.resolve_launch(
        is_packaged=True,
        resources_path="/res",
        platform="win32",
        exists=_exists_everything,
    )
    assert res["mode"] == "bundled"
    assert res["error"] is None
    assert res["command"] == os.path.join("/res", "bin", "win", "pehredar-core.exe")
    assert res["args_prefix"] == []
    assert res["adb_path"] == os.path.join("/res", "bin", "win", "adb.exe")


def test_packaged_missing_core_is_clear_error_not_crash():
    res = bundled.resolve_launch(
        is_packaged=True, resources_path="/res", platform="win32", exists=_exists_nothing
    )
    assert res["command"] is None
    assert res["error"] is not None
    assert "Reinstall" in res["error"]
    assert "pehredar-core" in res["error"]


def test_packaged_missing_adb_is_clear_error():
    def exists(path):
        return "pehredar-core" in path

    res = bundled.resolve_launch(
        is_packaged=True, resources_path="/res", platform="linux", exists=exists
    )
    assert res["command"] is not None  # core is fine
    assert res["error"] is not None
    assert "adb" in res["error"].lower()


def test_packaged_settings_override_wins_over_bundled():
    res = bundled.resolve_launch(
        is_packaged=True,
        resources_path="/res",
        platform="linux",
        settings_adb_path="/custom/adb",
        exists=_exists_everything,
    )
    assert res["adb_path"] == "/custom/adb"
    assert res["error"] is None


def test_packaged_unsupported_platform_is_clear_error():
    res = bundled.resolve_launch(is_packaged=True, resources_path="/res", platform="darwin")
    assert res["command"] is None
    assert "darwin" in res["error"]
    assert "from source" in res["error"]


def test_paths_survive_spaces_in_resources():
    # e.g. C:\Program Files\... — spawn() with an args array needs no quoting,
    # so the raw path must be preserved verbatim.
    base = "C:\\Program Files\\Pehredar\\resources"
    res = bundled.resolve_launch(
        is_packaged=True, resources_path=base, platform="win32", exists=_exists_everything
    )
    assert res["command"] == os.path.join(base, "bin", "win", "pehredar-core.exe")
    assert " " in res["command"]


def test_js_mirror_stays_in_sync():
    """Guard the shared contract: every layout symbol in bundled.py
    must exist in gui/scripts/bundled-paths.js."""

    from pathlib import Path

    js = (Path(__file__).resolve().parent.parent / "gui" / "scripts" / "bundled-paths.js").read_text(
        encoding="utf-8"
    )
    for symbol in [
        "platformDir",
        "coreFileName",
        "adbFileName",
        "binDir",
        "bundledCorePath",
        "bundledAdbPath",
        "resolveLaunch",
        "pehredar-core",
    ]:
        assert symbol in js, f"JS mirror missing: {symbol}"
    # error-wording parity so users get the same guidance on both sides
    assert "Reinstall Pehredar" in js
    # no removed surface may drift back in on either side
    for gone in ["pehredar-agent-core", "agent_cli", "fastbootFileName", "bundledFastbootPath"]:
        assert gone not in js, f"JS mirror still references removed surface: {gone}"


def test_meipass_db_fallback_paths(monkeypatch, tmp_path):
    """The PyInstaller onefile fallback must point inside sys._MEIPASS."""
    import sys

    from pehredar.checks import stalkerware_db

    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    candidates = stalkerware_db._candidate_db_paths()
    assert stalkerware_db.DB_PATH in candidates
    assert tmp_path / "pehredar" / "checks" / "stalkerware_db.json" in candidates


def test_real_built_bundle_resolves():
    """If release binaries were built locally, the resolver must accept them.

    Skipped on machines without a built bundle (e.g. plain dev checkouts,
    CI unit-test jobs) — the release workflow builds before packaging.
    """
    import sys
    from pathlib import Path

    import pytest

    dir_name = "win" if sys.platform == "win32" else "linux"
    plat = "win32" if sys.platform == "win32" else "linux"
    resources = Path(__file__).resolve().parent.parent / "gui" / "resources"
    core = resources / "bin" / dir_name / bundled.core_binary_name(dir_name)
    adb = resources / "bin" / dir_name / bundled.adb_binary_name(dir_name)
    if not (core.exists() and adb.exists()):
        pytest.skip("no built bundle")
    res = bundled.resolve_launch(is_packaged=True, resources_path=str(resources), platform=plat)
    assert res["error"] is None
    assert res["command"] == str(core)
    assert res["adb_path"] == str(adb)
