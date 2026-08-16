import click

from .adb import ADBConnection, ADBError, NoDeviceError, UnauthorizedError
from .checks import run_all_checks
from .output import generate_json_report, print_results_table, print_summary_panel


@click.command()
@click.option("--serial", "-s", default=None, help="Target device serial (optional, uses first authorized device)")
@click.option("--output", "-o", default="pehredar_report.json", help="Output JSON report path")
@click.option("--no-table", is_flag=True, help="Suppress terminal table output")
@click.option("--quiet", "-q", is_flag=True, help="Minimal output (only summary)")
def main(serial: str, output: str, no_table: bool, quiet: bool) -> None:
    """Pehredar - Android Root/Jailbreak Detection via ADB"""
    try:
        adb = ADBConnection(serial=serial)
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

    if not quiet:
        click.echo(f"Connected to device: {device_serial}")
        click.echo("Running detection checks...")

    results = run_all_checks(adb)

    if not no_table and not quiet:
        print_results_table(results, device_serial)
        print_summary_panel(results)
    elif not quiet:
        print_summary_panel(results)

    generate_json_report(results, device_serial, output)


if __name__ == "__main__":
    main()