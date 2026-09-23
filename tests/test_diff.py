from click.testing import CliRunner

from pehredar.diff import diff_reports, format_diff_text
from pehredar.diff_cli import main as diff_main


def _report(risk="Low", score=0, checks=None, serial="ABC", ts="2026-01-01T00:00:00+00:00"):
    return {
        "tool": "Pehredar",
        "version": "1.0.0",
        "timestamp": ts,
        "device_serial": serial,
        "summary": {"risk_level": risk, "risk_score": score},
        "checks": checks or [],
    }


def _check(name, outcome="pass", severity="info", packages=None):
    return {
        "name": name,
        "passed": outcome == "pass",
        "outcome": outcome,
        "severity": severity,
        "evidence": "",
        "packages": packages or [],
    }


def test_diff_no_changes():
    old = _report(checks=[_check("SU Binary")])
    new = _report(checks=[_check("SU Binary")])
    diff = diff_reports(old, new)
    assert diff["has_changes"] is False
    assert diff["new_failures"] == []
    assert "No changes" in format_diff_text(diff)


def test_diff_new_failure_and_package():
    old = _report(risk="Low", score=0, checks=[_check("Hidden Apps (No Icon)")])
    new = _report(
        risk="Medium",
        score=2,
        checks=[_check("Hidden Apps (No Icon)", outcome="fail", severity="medium", packages=["com.evil.spy"])],
    )
    diff = diff_reports(old, new)
    assert diff["has_changes"] is True
    assert diff["new_failures"] == ["Hidden Apps (No Icon)"]
    assert diff["new_packages"] == ["com.evil.spy"]
    assert diff["risk_changed"] is True
    text = format_diff_text(diff)
    assert "com.evil.spy" in text
    assert "Medium" in text


def test_diff_resolved_and_device_mismatch_warns():
    old = _report(
        serial="AAA",
        checks=[_check("SU Binary", outcome="fail", severity="high", packages=["com.topjohnwu.magisk"])],
    )
    new = _report(serial="BBB", checks=[_check("SU Binary")])
    diff = diff_reports(old, new)
    assert diff["resolved"] == ["SU Binary"]
    assert diff["removed_packages"] == ["com.topjohnwu.magisk"]
    assert diff["same_device"] is False
    assert "different devices" in format_diff_text(diff)


def test_diff_cli_exit_codes(tmp_path):
    import json

    old_p = tmp_path / "old.json"
    new_p = tmp_path / "new.json"
    old_p.write_text(json.dumps(_report(checks=[_check("SU Binary")])), encoding="utf-8")
    new_p.write_text(
        json.dumps(_report(checks=[_check("SU Binary", outcome="fail", severity="high")])),
        encoding="utf-8",
    )
    runner = CliRunner()
    res = runner.invoke(diff_main, [str(old_p), str(new_p), "--format", "json"])
    assert res.exit_code == 1
    res2 = runner.invoke(diff_main, [str(old_p), str(old_p)])
    assert res2.exit_code == 0
