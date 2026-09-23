"""Safety layer: plain-language summaries reflect real results, and the
safety gate fires only for a genuine known-stalkerware match — never for
severity alone and never for merely having removable packages."""

from pehredar.checks import CheckResult
from pehredar.safety import attach_safety, plain_summary, safety_gate, stalkerware_labels


def _result(name, status="pass", severity="info", packages=()):
    return CheckResult(
        name=name,
        passed=(status == "pass"),
        evidence="evidence",
        severity=severity,
        status=status,
        packages=list(packages),
    )


def _all(names, **kwargs):
    return [_result(n, **kwargs) for n in names]


CLEAN_NAMES = [
    "SU Binary",
    "Root Packages",
    "Build Tags",
    "Debuggable/Secure Props",
    "Writable /system",
    "BusyBox Binary",
    "Magisk Hide Indicators",
    "Hidden Apps (No Icon)",
    "Accessibility Services",
    "Device Admin Privileges",
    "Sensitive Permissions (No Icon)",
    "Known Stalkerware Indicators",
]


def test_low_summary_is_reassuring_and_gate_closed():
    results = _all(CLEAN_NAMES)
    plain = plain_summary(results)
    assert plain["level"] == "Low"
    assert "No signs of tampering" in plain["headline"]
    assert "nothing that looks like" in plain["body"]
    # no jargon leaks into the plain summary
    for word in ("Magisk", "ADB", "/system", "su binary"):
        assert word not in plain["headline"] + plain["body"]
    assert safety_gate(results) is False


def test_medium_summary_is_neutral_and_names_real_findings():
    # NOTE: with today's info-on-pass checks, any real failure scores High;
    # Medium is only reachable if a check ever passes with graded severity.
    # The branch is covered here so the tone stays neutral IF scoring says so.
    results = [
        _result("Build Tags", status="fail", severity="medium"),
        _result("SU Binary", status="pass", severity="medium"),
    ]
    plain = plain_summary(results)
    assert plain["level"] == "Medium"
    assert "worth a look" in plain["headline"]
    # generated from the actual failing check, not a static string
    assert "not officially signed" in plain["body"]
    assert "do not show that someone else is watching" in plain["body"]
    assert safety_gate(results) is False


def test_high_stalkerware_summary_and_gate():
    results = _all(CLEAN_NAMES)
    results[-1] = _result(
        "Known Stalkerware Indicators",
        status="fail",
        severity="high",
        packages=["com.mspy.basic"],
    )
    plain = plain_summary(results)
    assert plain["level"] == "High"
    assert "monitored by someone else" in plain["headline"]
    assert "mSpy" in plain["body"]
    assert "Removing it could alert" in plain["body"]
    assert "Review step" in plain["body"]
    assert safety_gate(results) is True


def test_high_non_stalkerware_skips_gate_without_monitoring_claim():
    # Serious, but a different situation from suspected monitoring:
    # root tooling goes straight to the normal flow, whatever its severity.
    results = _all(CLEAN_NAMES)
    results[0] = _result("SU Binary", status="fail", severity="high")
    plain = plain_summary(results)
    assert plain["level"] == "High"
    assert "strong signs of tampering" in plain["headline"]
    assert "does not prove another person is monitoring" in plain["body"]
    assert safety_gate(results) is False


def test_high_root_packages_with_removable_package_skips_gate():
    # Removable packages alone must never trigger the gate either.
    results = _all(CLEAN_NAMES)
    results[1] = _result(
        "Root Packages", status="fail", severity="high", packages=["com.example.magiskmanager"]
    )
    assert safety_gate(results) is False


def test_medium_only_never_opens_gate():
    results = _all(CLEAN_NAMES)
    results[5] = _result("BusyBox Binary", status="fail", severity="medium")
    assert safety_gate(results) is False


def test_inconclusive_adds_caveat_not_alarm():
    results = _all(CLEAN_NAMES)
    results[6] = _result("Magisk Hide Indicators", status="inconclusive", severity="info")
    plain = plain_summary(results)
    assert "could not finish" in plain["body"]
    assert plain["level"] == "Low"


def test_unknown_check_names_do_not_crash_summary():
    results = [_result("Something Entirely New", status="fail", severity="medium")]
    plain = plain_summary(results)
    assert plain["body"]  # generic count-based phrasing, no KeyError


def test_stalkerware_labels_come_from_db():
    assert "mSpy" in stalkerware_labels(["com.mspy.basic"])
    assert stalkerware_labels(["com.example.clean"]) == []


def test_attach_safety_enriches_report_summary():
    from pehredar.scoring import get_summary

    results = _all(CLEAN_NAMES)
    summary = attach_safety(get_summary(results), results)
    assert summary["safety_gate"] is False
    assert summary["plain"]["headline"]
    assert summary["plain"]["body"]
