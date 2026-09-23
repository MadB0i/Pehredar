from types import SimpleNamespace

from pehredar.checks.stalkerware_db import (
    check_known_stalkerware,
    load_entries,
    match_packages,
)


def fake(stdout="", returncode=0):
    return SimpleNamespace(stdout=stdout, stderr="", returncode=returncode)


class FakeADB:
    def __init__(self, stdout="", code=0):
        self.stdout = stdout
        self.code = code

    def run_command(self, command, timeout=30):
        assert command.startswith("pm list packages")
        return self.stdout, "", self.code


def test_db_loads_curated_entries():
    entries = load_entries()
    assert len(entries) >= 20
    assert any(e["package"] == "com.mspy.basic" for e in entries)
    assert all(e.get("source") for e in entries)


def test_match_exact_and_prefix():
    hits = match_packages({"com.mspy.basic", "com.android.chrome"})
    assert [h["matched_package"] for h in hits] == ["com.mspy.basic"]

    hits = match_packages({"com.hoverwatch.android.v2"})
    assert hits and hits[0]["matched_package"] == "com.hoverwatch.android.v2"


def test_no_false_positive_on_clean_device():
    assert match_packages({"com.android.chrome", "com.whatsapp"}) == []


def test_check_flags_stalkerware():
    adb = FakeADB("package:com.android.chrome\npackage:com.flexispy.android\n")
    result = check_known_stalkerware(adb)
    assert not result.passed
    assert result.severity == "high"
    assert "com.flexispy.android" in result.evidence
    assert "com.flexispy.android" in result.packages


def test_check_clean():
    adb = FakeADB("package:com.android.chrome\n")
    result = check_known_stalkerware(adb)
    assert result.passed


def test_check_pm_failure_is_info_not_fail():
    adb = FakeADB("", code=1)
    result = check_known_stalkerware(adb)
    assert result.passed
    assert result.severity == "info"
