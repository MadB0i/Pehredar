from __future__ import annotations

import json
from datetime import datetime, timezone

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .checks import CheckResult
from .scoring import get_summary

console = Console()


def print_results_table(results: list[CheckResult], device_serial: str) -> None:
    table = Table(title=f"Pehredar Root Detection Results - {device_serial}", show_header=True, header_style="bold magenta")
    table.add_column("Check", style="cyan", width=30)
    table.add_column("Status", justify="center", width=12)
    table.add_column("Severity", justify="center", width=10)
    table.add_column("Evidence", style="dim")

    for result in results:
        if result.status == "inconclusive":
            status_text = Text("INCONCLUSIVE", style="yellow")
        else:
            status_text = Text("PASS", style="green") if result.status == "pass" else Text("FAIL", style="red bold")
        severity_colors = {"high": "red", "medium": "yellow", "low": "blue", "info": "green"}
        sev_color = severity_colors.get(result.severity, "white")
        severity_text = Text(result.severity.upper(), style=sev_color)
        evidence_text = Text(result.evidence, style="dim")
        table.add_row(result.name, status_text, severity_text, evidence_text)

    console.print(table)


def print_summary_panel(results: list[CheckResult]) -> None:
    summary = get_summary(results)

    risk_colors = {"High": "red bold", "Medium": "yellow bold", "Low": "green bold"}
    risk_color = risk_colors.get(summary["risk_level"], "white")

    content = f"""[bold]Total Checks:[/bold] {summary['total_checks']}
[bold]Passed:[/bold] {summary['passed']}  [bold]Failed:[/bold] {summary['failed']}  [bold]Inconclusive:[/bold] {summary['inconclusive']}
[bold]High Severity:[/bold] {summary['high_severity']}  [bold]Medium:[/bold] {summary['medium_severity']}  [bold]Low:[/bold] {summary['low_severity']}
[bold]Risk Level:[/bold] [{risk_color}]{summary['risk_level']}[/{risk_color}]  [bold]Score:[/bold] {summary['risk_score']}"""

    console.print(Panel(content, title="Summary", border_style=risk_color, expand=False))


def generate_json_report(results: list[CheckResult], device_serial: str, output_path: str) -> None:
    summary = get_summary(results)

    report = {
        "tool": "Pehredar",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "device_serial": device_serial,
        "summary": summary,
        "checks": [
            {
                "name": r.name,
                "passed": r.passed,
                "outcome": r.status,
                "severity": r.severity,
                "evidence": r.evidence,
                "packages": list(r.packages),
            }
            for r in results
        ],
    }

    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)

    console.print(f"[green]JSON report saved to:[/green] {output_path}")