from __future__ import annotations

from .checks import CheckResult

SEVERITY_WEIGHTS = {
    "high": 3,
    "medium": 2,
    "low": 1,
    "info": 0,
}


def calculate_risk_score(results: list[CheckResult]) -> tuple[str, int]:
    total_score = 0
    max_possible = 0

    for result in results:
        # Inconclusive checks carry no signal either way and must not inflate
        # or dilute the risk verdict.
        if result.status == "inconclusive":
            continue
        weight = SEVERITY_WEIGHTS.get(result.severity, 0)
        max_possible += weight
        if result.status == "fail":
            total_score += weight

    if max_possible == 0:
        return "Low", 0

    ratio = total_score / max_possible

    if ratio >= 0.6:
        return "High", total_score
    elif ratio >= 0.3:
        return "Medium", total_score
    else:
        return "Low", total_score


def get_summary(results: list[CheckResult]) -> dict:
    passed = sum(1 for r in results if r.status == "pass")
    failed = sum(1 for r in results if r.status == "fail")
    inconclusive = sum(1 for r in results if r.status == "inconclusive")
    high_sev = sum(1 for r in results if r.status == "fail" and r.severity == "high")
    medium_sev = sum(1 for r in results if r.status == "fail" and r.severity == "medium")
    low_sev = sum(1 for r in results if r.status == "fail" and r.severity == "low")

    risk_level, score = calculate_risk_score(results)

    return {
        "total_checks": len(results),
        "passed": passed,
        "failed": failed,
        "inconclusive": inconclusive,
        "high_severity": high_sev,
        "medium_severity": medium_sev,
        "low_severity": low_sev,
        "risk_level": risk_level,
        "risk_score": score,
    }