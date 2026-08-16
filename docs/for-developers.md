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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your check and a regression test in `tests/` (mocked ADB)
4. Run `pytest` and `ruff check pehredar tests`
5. Submit a PR

For full setup instructions (dev environment, test commands, PR expectations) see [CONTRIBUTING.md](../CONTRIBUTING.md).