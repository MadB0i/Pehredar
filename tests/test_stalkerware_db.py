from types import SimpleNamespace

from pehredar.checks import stalkerware_db
from pehredar.checks.stalkerware_db import (
    check_known_stalkerware,
    db_age_days,
    db_meta,
    load_entries,
    match_packages,
    merge_entries,
    validate_entry,
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


def _use_db(monkeypatch, tmp_path, doc):
    import json

    p = tmp_path / "stalkerware_db.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    monkeypatch.setattr(stalkerware_db, "DB_PATH", p)
    stalkerware_db.load_db.cache_clear()
    stalkerware_db.db_meta.cache_clear()
    stalkerware_db.load_entries.cache_clear()
    return p


def test_envelope_meta_reports_version():
    meta = db_meta()
    assert meta["version"] >= 1
    assert meta["updated"]


def test_legacy_bare_list_still_loads(monkeypatch, tmp_path):
    _use_db(monkeypatch, tmp_path, [{"package": "com.example.spy", "match": "exact"}])
    try:
        assert db_meta() == {"version": 0, "updated": "", "source": ""}
        assert [e["package"] for e in load_entries()] == ["com.example.spy"]
    finally:
        stalkerware_db.load_db.cache_clear()
        stalkerware_db.db_meta.cache_clear()
        stalkerware_db.load_entries.cache_clear()


def test_evidence_names_db_version():
    adb = FakeADB("package:com.android.chrome\n")
    assert f"db v{db_meta()['version']}" in check_known_stalkerware(adb).evidence


def test_validate_entry():
    assert validate_entry({"package": "com.x", "match": "exact", "severity": "high"}) is None
    assert validate_entry({"package": "com.x"}) is None  # defaults apply
    assert validate_entry({}) is not None
    assert validate_entry({"package": "com.x", "match": "bogus"}) is not None
    assert validate_entry({"package": "com.x", "severity": "bogus"}) is not None
    assert validate_entry("nope") is not None


def test_merge_entries_dedupes_and_normalizes():
    existing = [{"package": "com.a", "match": "exact", "label": "A", "source": "S", "severity": "high", "note": ""}]
    incoming = [
        {"package": "com.a", "match": "exact", "label": "Dupe", "source": "T", "severity": "high", "note": ""},
        {"package": "com.b", "match": "prefix"},
    ]
    merged, added = merge_entries(existing, incoming)
    assert added == 1
    assert len(merged) == 2
    assert merged[1] == {
        "package": "com.b",
        "match": "prefix",
        "label": "",
        "source": "",
        "severity": "high",
        "note": "",
    }


def test_merge_entries_rejects_bad_input():
    import pytest

    with pytest.raises(ValueError):
        merge_entries([], [{"package": ""}])


def test_db_age_days():
    from datetime import date

    assert db_age_days({"updated": "2026-01-01"}, today=date(2026, 1, 11)) == 10
    assert db_age_days({"updated": "not-a-date"}) is None
    assert db_age_days({}) is None
