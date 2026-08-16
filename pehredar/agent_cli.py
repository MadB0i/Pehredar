from __future__ import annotations

import json
import sys

import click

from .adb import ADBConnection, ADBError
from .agent import FastbootConnection, build_root_plan, fingerprint_device, has_root, run_root_agent
from .agent.lockrecovery import build_lock_recovery_plan, run_lock_recovery


def _emit(payload: dict, json_stream: bool) -> None:
    if json_stream:
        click.echo(json.dumps(payload))
        sys.stdout.flush()


def _do_lock_recovery(adb: ADBConnection, json_stream: bool, auto_yes: bool, plan_only: bool = False) -> None:
    fp = fingerprint_device(adb)
    _emit({"type": "fp", "fp": fp.as_dict()}, json_stream)
    rooted = has_root(adb)
    plan = build_lock_recovery_plan(fp, rooted)
    _emit({"type": "plan", "plan": plan.as_dict()}, json_stream)
    if plan_only:
        _emit({"type": "done", "ok": True, "plan_only": True}, json_stream)
        return

    def on_event(payload: dict) -> None:
        _emit(payload, json_stream)

    def confirm(step) -> bool:
        if auto_yes:
            return True
        return click.confirm(f"Step '{step.title}' will {step.detail} Continue?")

    result = run_lock_recovery(adb, fp, on_event=on_event, confirm=confirm, rooted=rooted)
    _emit({"type": "done", **result}, json_stream)


@click.command()
@click.option("--serial", "-s", default=None, help="Target device serial (optional, uses first authorized device)")
@click.option("--adb-path", default=None, help="Path to adb executable (default: 'adb' from PATH)")
@click.option("--fastboot-path", default=None, help="Path to fastboot executable (default: 'fastboot' from PATH)")
@click.option(
    "--mode",
    type=click.Choice(["temporary", "permanent"]),
    default="temporary",
    help="temporary = fastboot boot (default); permanent = fastboot flash boot (wipes data on unlock)",
)
@click.option("--plan-only", is_flag=True, help="Fingerprint + emit plan, then exit without executing")
@click.option("--yes", "auto_yes", is_flag=True, help="Auto-confirm destructive steps (pre-authorize in UI)")
@click.option("--workdir", default=".pehredar-agent", help="Working dir for boot image + patched image artifacts")
@click.option("--magiskboot", default=None, help="Path to magiskboot (default: discover from PATH / Magisk)")
@click.option("--boot-img", default=None, help="Path to a boot.img if it cannot be extracted automatically")
@click.option("--lock-recovery", is_flag=True, help="Run USB lock recovery (clear PIN/pattern/password) instead of root")
@click.option("--json-stream", is_flag=True, help="Emit one JSON line per event to stdout")
def main(
    serial: str,
    adb_path: str,
    fastboot_path: str,
    mode: str,
    plan_only: bool,
    auto_yes: bool,
    workdir: str,
    magiskboot: str,
    boot_img: str,
    lock_recovery: bool,
    json_stream: bool,
) -> None:
    """Pehredar Agent - automated Android root + USB lock recovery for owned/authorized devices"""
    try:
        adb = ADBConnection(serial=serial, adb_path=adb_path or "adb")
        device_serial = adb.connect()
    except ADBError as e:
        _emit({"type": "error", "error": str(e)}, json_stream)
        click.echo(f"Error: {e}", err=True)
        raise click.Abort()

    try:
        if lock_recovery:
            _do_lock_recovery(adb, json_stream, auto_yes, plan_only)
            return

        fp = fingerprint_device(adb)
        _emit({"type": "fp", "fp": fp.as_dict()}, json_stream)

        if plan_only:
            plan = build_root_plan(fp, mode)
            _emit({"type": "plan", "plan": plan.as_dict()}, json_stream)
            _emit({"type": "done", "ok": True, "plan_only": True}, json_stream)
            return

        fb = FastbootConnection(fastboot_path or "fastboot")
        fb._serial = device_serial
        result = run_root_agent(
            adb,
            fb,
            mode=mode,
            workdir=workdir,
            magiskboot_path=magiskboot or None,
            boot_img=boot_img or None,
            on_event=lambda p: _emit(p, json_stream),
            confirm=lambda step: auto_yes or click.confirm(f"{step.title}: {step.detail}\nContinue?"),
        )
        _emit({"type": "done", **result}, json_stream)
    except ADBError as e:
        _emit({"type": "error", "error": str(e)}, json_stream)
        click.echo(f"ADB Error: {e}", err=True)
        raise click.Abort()


if __name__ == "__main__":
    main()