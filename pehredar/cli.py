from __future__ import annotations

import json
import sys

import click

from .adb import ADBConnection, ADBError, NoDeviceError, UnauthorizedError
from .checks import run_all_checks
from .output import generate_json_report, print_results_table, print_summary_panel
from .scoring import get_summary


@click.command()
@click.option("--serial", "-s", default=None, help="Target device serial (optional, uses first authorized device)")
@click.option("--output", "-o", default="pehredar_report.json", help="Output JSON report path")
@click.option("--no-table", is_flag=True, help="Suppress terminal table output")
@click.option("--quiet", "-q", is_flag=True, help="Minimal output (only summary)")
@click.option("--json-stream", is_flag=True, help="Emit one JSON line per check to stdout")
@click.option("--adb-path", default=None, help="Path to adb executable (default: 'adb' from PATH)")
@click.option("--skip-check", "skip_check", multiple=True, help="Skip a check by slug (repeatable)")
def main(
    serial: str,
    output: str,
    no_table: bool,
    quiet: bool,
    json_stream: bool,
    adb_path: str,
    skip_check: tuple[str, ...],
) -> None:
    """Pehredar - Android Root/Jailbreak Detection via ADB"""
    try:
        adb = ADBConnection(serial=serial, adb_path=adb_path or "adb")
        device_serial = adb.connect()
    except NoDeviceError as e:
        click.echo(f"Error: {e}", err=True)
        raise click.Abort()
    except UnauthorizedError as e:
        click.echo(f"Error: {e}", err=True)
        raise click.Abort()
    except ADBError as e:
        click.echo(f"ADB Error: {e}", err=True)
        raise click.Abort()

    def emit(status: str, slug: str, result=None) -> None:
        payload = {"check": slug, "status": status}
        if result is not None:
            payload["passed"] = result.passed
            payload["outcome"] = result.status
            payload["severity"] = result.severity
            payload["evidence"] = result.evidence
            payload["packages"] = list(result.packages)
        click.echo(json.dumps(payload))
        sys.stdout.flush()

    if not quiet and not json_stream:
        click.echo(f"Connected to device: {device_serial}")
        click.echo("Running detection checks...")

    results = run_all_checks(adb, on_check=emit if json_stream else None, skip=set(skip_check))

    if json_stream:
        summary = get_summary(results)
        payload = {
            "status": "complete",
            "risk_level": summary["risk_level"],
            "risk_score": summary["risk_score"],
            "summary": summary,
            "checks": [
                {
                    "check": r.name,
                    "passed": r.passed,
                    "outcome": r.status,
                    "severity": r.severity,
                    "evidence": r.evidence,
                    "packages": list(r.packages),
                }
                for r in results
            ],
        }
        click.echo(json.dumps(payload))
        sys.stdout.flush()
    elif not no_table and not quiet:
        print_results_table(results, device_serial)
        print_summary_panel(results)
    elif not quiet:
        print_summary_panel(results)

    generate_json_report(results, device_serial, output)


if __name__ == "__main__":
    main()