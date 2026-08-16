# For Developers

Developer-oriented documentation for Pehredar. For end-user basics see the [README](../README.md).

## CLI reference

```bash
pehredar                       # scan the first authorized device
pehredar -s <serial>           # target a specific device
pehredar -o report.json        # custom report path
pehredar --json-stream -o r.json  # one JSON line per check (for GUI/CI)
pehredar --skip-check check_build_tags   # skip specific checks
pehredar --adb-path "C:\platform-tools\adb.exe"   # custom adb
pehredar --help
```

## Extending checks

Each check is a standalone function returning a `CheckResult`. Add yours in `pehredar/checks/__init__.py`:

```python
def check_custom_indicator(adb: ADBConnection) -> CheckResult:
    # your detection logic
    return CheckResult(
        name="Custom Check",
        passed=True,          # or False
        evidence="...",
        severity="medium",    # high / medium / low / info
        packages=[],          # app package IDs involved (optional)
    )

ALL_CHECKS.append(check_custom_indicator)
```

Larger groups belong in a dedicated module (see `pehredar/checks/spyware.py`) — define a list and `ALL_CHECKS.extend(...)` it.

## Running tests

```bash
pip install -e .[dev]
pytest          # mocked ADB — no device needed
```

## JSON report format

```json
{
  "tool": "Pehredar",
  "version": "1.0.0",
  "device_serial": "ABC123DEF",
  "summary": {
    "total_checks": 11, "passed": 10, "failed": 1, "inconclusive": 0,
    "high_severity": 0, "medium_severity": 1, "low_severity": 0,
    "risk_level": "High", "risk_score": 2
  },
  "checks": [
    {
      "name": "Hidden Apps (No Icon)",
      "passed": false,
      "outcome": "fail",
      "severity": "medium",
      "evidence": "Third-party apps with no launcher icon: com.example.spy",
      "packages": ["com.example.spy"]
    }
  ]
}
```

## Detection reference

| Check | Description | Severity |
|-------|-------------|----------|
| **SU Binary** | Scans common paths for `su` | High |
| **Root Packages** | Magisk, SuperSU, etc. via `pm list packages` | High |
| **Build Tags** | `test-keys` vs `release-keys` in `ro.build.tags` | Medium |
| **Debuggable/Secure** | `ro.debuggable=1` / `ro.secure=0` | Medium |
| **Writable /system** | `/system` mount flags | High |
| **BusyBox** | BusyBox in common paths | Medium |
| **Magisk Hide** | Mount namespaces + Magisk device nodes | Medium |
| **Hidden Apps** | Third-party packages with no launcher icon | Medium |
| **Accessibility Services** | Enabled services that aren't known screen readers | High |
| **Device Admin** | Third-party device admin / owner apps | High |
| **Sensitive Permissions** | Hidden apps with SMS + Camera + Mic + Location | High |

`INCONCLUSIVE` results (e.g. a timed-out probe) are never counted as failures and never inflate the risk score.

## Agent CLI (`pehredar-agent`)

Automated bootloader unlock + Magisk root and USB lock recovery, for owned/authorized devices. Every event is emitted as one JSON line when `--json-stream` is set, so the GUI can drive it as a subprocess.

```bash
pehredar-agent -s <serial> --plan-only --json-stream   # fingerprint + plan, no execution
pehredar-agent -s <serial> --mode temporary            # fastboot boot patched image (non-destructive)
pehredar-agent -s <serial> --mode permanent --yes      # unlock + fastboot flash boot (ERASES ALL DATA)
pehredar-agent -s <serial> --lock-recovery --yes       # clear forgotten PIN/pattern/password
pehredar-agent -s <serial> --boot-img boot.img         # provide boot image when it can't be extracted
pehredar-agent -s <serial> --magiskboot magiskboot     # explicit magiskboot path
pehredar-agent --help
```

Event types: `fp`, `plan`, `step` (`start|ok|error|skipped`), `detail`, `verify`, `done`, `error`. `confirm(step)` gates destructive steps in-process; the GUI collects consent up front and passes `--yes`.

### Agent internals (`pehredar/agent/`)

| Module | Purpose |
|--------|---------|
| `fastboot.py` | `FastbootConnection` wrapper over the fastboot binary |
| `fingerprint.py` | Non-invasive device identity (getprop only, no reboot) + OEM normalization |
| `root_planner.py` | Support matrix → `RootPlan` of `PlanStep`s |
| `magisk.py` | `has_root`, boot-image extract, magiskboot patch, unlock/apply |
| `lockrecovery.py` | Lock-recovery method matrix + executor |
| `verify.py` | `wait_for_adb`, re-run detection checks to confirm root/unlock |

Honest scope: OEM unlock requires a **physical confirmation on the device screen** (volume key / tap) — the agent makes it a checkpoint and waits. Lock recovery only works when USB debugging is already enabled and authorized (you can't enable debugging on a locked phone — that's the natural safety gate).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your check and a regression test in `tests/` (mocked ADB)
4. Run `pytest` and `ruff check pehredar tests`
5. Submit a PR

For full setup instructions (dev environment, test commands, PR expectations) see [CONTRIBUTING.md](../CONTRIBUTING.md).