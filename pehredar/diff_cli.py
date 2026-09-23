from __future__ import annotations

import json
import sys

import click

from .diff import diff_reports, format_diff_text, load_report
from .version import __version__


@click.command()
@click.version_option(__version__, prog_name="pehredar-diff")
@click.argument("old_report", type=click.Path(exists=True, dir_okay=False))
@click.argument("new_report", type=click.Path(exists=True, dir_okay=False))
@click.option(
    "--format",
    "out_format",
    type=click.Choice(["text", "json"]),
    default="text",
    show_default=True,
    help="Output format",
)
@click.option("--output", "-o", default=None, help="Write output to file instead of stdout")
def main(old_report: str, new_report: str, out_format: str, output: str | None) -> None:
    """Compare two Pehredar JSON reports: what changed since the last scan?

    Exit code is 1 when new failures or newly flagged apps appear,
    otherwise 0. This makes it usable in scripts and QA pipelines.
    """
    try:
        old = load_report(old_report)
        new = load_report(new_report)
    except (OSError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise click.Abort()

    diff = diff_reports(old, new)

    if out_format == "json":
        text = json.dumps(diff, indent=2)
    else:
        text = format_diff_text(diff)

    if output:
        with open(output, "w", encoding="utf-8") as fh:
            fh.write(text + ("\n" if not text.endswith("\n") else ""))
        click.echo(f"Diff written to: {output}")
    else:
        click.echo(text)

    signal = bool(diff.get("new_failures") or diff.get("new_packages"))
    # Risk increase alone (score up with no new named failure) also signals.
    if diff.get("risk_score_delta", 0) > 0:
        signal = True
    sys.exit(1 if signal else 0)


if __name__ == "__main__":
    main()
