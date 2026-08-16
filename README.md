# Pehredar

**Pehredar** (Hindi: पहरेदार, meaning "watchman/guard") is a Python CLI tool that tests Android devices for root/jailbreak indicators via ADB. It performs multiple detection checks and provides a risk assessment with detailed evidence.

## Features

- **Comprehensive Detection**: Checks for su binaries, root management apps, build tags, debuggable flags, writable partitions, busybox, Magisk hide indicators, plus spyware indicators (hidden apps, accessibility services, device admin, sensitive permissions)
- **Risk Scoring**: Aggregates results into Low/Medium/High risk levels
- **Dual Output**: Rich terminal table + JSON report file
- **JSON Streaming**: `--json-stream` emits one JSON line per check for GUI/CI consumption
- **Modular Design**: Each check is a separate function for easy extension
- **Graceful Error Handling**: Handles no-device, unauthorized, and ADB errors
- **Electron Desktop GUI**: Animated network graph of checks in `gui/`

## Installation

### Prerequisites

1. **Python 3.8+**
2. **ADB (Android Debug Bridge)** installed and in PATH
   - Windows: Download [Platform Tools](https://developer.android.com/studio/releases/platform-tools)
   - macOS: `brew install android-platform-tools`
   - Linux: `sudo apt install android-tools-adb` (or equivalent)
3. **USB Debugging** enabled on the Android device

### Install Pehredar

```bash
# Clone and install
git clone <repository-url>
cd Pehredar
pip install -e .

# Or install directly with pip
pip install -e .
```

### Device Setup

1. Enable **Developer Options** on Android: Settings → About Phone → Tap "Build Number" 7 times
2. Enable **USB Debugging**: Settings → Developer Options → USB Debugging
3. Connect device via USB
4. Authorize the computer when prompted on the device
5. Verify: `adb devices` should show your device as `device` (not `unauthorized`)

## Usage

```bash
# Basic scan (uses first authorized device)
pehredar

# Specify device serial
pehredar -s <serial>

# Custom output path
pehredar -o report.json

# Suppress table output (JSON only)
pehredar --no-table

# Quiet mode (summary only)
pehredar -q

# Stream one JSON line per check (for GUI / CI)
pehredar --json-stream -o report.json

# Help
pehredar --help
```

`--json-stream` prints a line per check as it completes:

```
{"check": "check_su_binary", "status": "running"}
{"check": "check_su_binary", "status": "done", "passed": true, "severity": "info", "evidence": "..."}
{"status": "complete", "risk_level": "Low", "risk_score": 0, "summary": {...}, "checks": [...]}
```

## Detection Checks

| Check | Description | Severity |
|-------|-------------|----------|
| **SU Binary** | Scans common paths for `su` binary | High |
| **Root Packages** | Checks for Magisk, SuperSU, etc. via `pm list packages` | High |
| **Build Tags** | Detects `test-keys` vs `release-keys` in `ro.build.tags` | Medium |
| **Debuggable/Secure** | Checks `ro.debuggable=1` and `ro.secure=0` | Medium |
| **Writable /system** | Verifies `/system` partition mount flags | High |
| **BusyBox** | Detects busybox binary in common paths | Medium |
| **Magisk Hide** | Checks for mount namespace anomalies and Magisk device nodes | Medium |
| **Hidden Apps** | Third-party apps with no launcher icon (`pm list packages -3` vs launchable activities) | Medium |
| **Accessibility Services** | Flags enabled accessibility services that aren't known screen readers | High |
| **Device Admin** | Flags third-party device admin / owner apps (`dpm list-owners`, `dumpsys device_policy`) | High |
| **Sensitive Permissions** | Hidden apps holding SMS + Camera + Mic + Location simultaneously | High |

## Output

### Terminal Table

```
╭────────────────────────────────────────────────────────────────────╮
│ Pehredar Root Detection Results - ABC123DEF                       │
├──────────────────────┬────────┬───────────┬────────────────────────┤
│ Check                │ Status │ Severity  │ Evidence               │
├──────────────────────┼────────┼───────────┼────────────────────────┤
│ SU Binary            │ FAIL   │ HIGH      │ Found su at /system/x… │
│ Root Packages        │ PASS   │ INFO      │ No root packages found │
│ Build Tags           │ FAIL   │ MEDIUM    │ test-keys detected     │
│ Debuggable/Secure    │ PASS   │ INFO      │ ro.debuggable=0...     │
│ Writable /system     │ PASS   │ INFO      │ /system is read-only   │
│ BusyBox Binary       │ FAIL   │ MEDIUM    │ Found at /system/xbin… │
│ Magisk Hide          │ PASS   │ INFO      │ No indicators detected │
╰──────────────────────┴────────┴───────────┴────────────────────────╯

╭──────────────────── Summary ────────────────────╮
│ Total Checks: 7                                  │
│ Passed: 4  Failed: 3                             │
│ High Severity: 1  Medium: 2  Low: 0              │
│ Risk Level: HIGH  Score: 7                       │
╰──────────────────────────────────────────────────╯
```

### JSON Report

```json
{
  "tool": "Pehredar",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "device_serial": "ABC123DEF",
  "summary": {
    "total_checks": 7,
    "passed": 4,
    "failed": 3,
    "high_severity": 1,
    "medium_severity": 2,
    "low_severity": 0,
    "risk_level": "High",
    "risk_score": 7
  },
  "checks": [
    {
      "name": "SU Binary",
      "passed": false,
      "severity": "high",
      "evidence": "Found su binary at: /system/xbin/su (-rwxr-xr-x...)"
    }
  ]
}
```

## Risk Scoring

- **High** (≥60% weighted failures): Strong indicators of root/jailbreak
- **Medium** (30-59%): Some suspicious indicators, further investigation recommended
- **Low** (<30%): Minimal or no root indicators detected

Weights: High=3, Medium=2, Low=1, Info=0

## Project Structure

```
pehredar/
├── pehredar/
│   ├── cli.py           # CLI entry point (click)
│   ├── adb.py           # ADB connection wrapper
│   ├── checks/          # Detection checks (add new ones here)
│   │   ├── __init__.py  # CheckResult + ALL_CHECKS registry
│   │   └── spyware.py   # Hidden apps, accessibility, device admin, permissions
│   ├── scoring.py       # Risk scoring
│   └── output.py        # Rich table + JSON report
├── gui/                 # Electron desktop app
│   ├── main.js          # Main process: device polling + CLI subprocess + scan storage
│   ├── preload.js       # contextBridge IPC
│   ├── assets/          # Generated shield/eye app icon (icon.png, icon.ico)
│   ├── scripts/         # gen-icon.js (dependency-free PNG/ICO generator)
│   └── renderer/        # Multi-view UI: views/, icons.js, components.js, app.js, graph.js
│       └── vendor/      # Vendored chart.umd.js (offline Chart.js)
├── tests/               # Pytest suite (mocked ADB)
├── pyproject.toml
└── README.md
```

## Desktop GUI (Electron)

The `gui/` folder contains a multi-view Electron app that wraps the Python CLI. It polls `adb devices` every 2s and surfaces connection status in the top bar. Views:

- **Dashboard** — device info, last scan summary, and a Chart.js risk trend line
- **Scan** — spawns `python -m pehredar.cli --json-stream` as a subprocess and visualizes each check as a node in an animated network graph (green = pass, red = fail, yellow = running), then shows the final risk score + full evidence panel
- **History** — persistent scan records (JSON files under the app's `userData/scans` dir); clicking a row opens a detail overlay
- **Settings** — storage folder, open folder, clear history
- **About** — app info

Scan detail views (in-app and the Dashboard "View Details") have an **Export Report** button that writes a printable HTML report to `userData/reports/<id>.html` and opens it in the default browser.

```bash
cd gui
npm install
npm start          # run in dev

# Build distributable installers
npm run build:win     # -> dist/Pehredar Setup *.exe (NSIS)
npm run build:linux   # -> dist/*.AppImage
```

The packaged app bundles the `pehredar` Python package via `extraResources`. The target machine still needs **Python** and **adb** on PATH (or set the `PEHREDAR_PY` env var to a custom Python interpreter).

## Extending Checks

Add new checks in `pehredar/checks/__init__.py`:

```python
def check_custom_indicator(adb: ADBConnection) -> CheckResult:
    # Your detection logic
    return CheckResult(
        name="Custom Check",
        passed=True/False,
        evidence="...",
        severity="high/medium/low/info"
    )

# Add to ALL_CHECKS list
ALL_CHECKS.append(check_custom_indicator)
```

Larger groups of related checks can live in a separate module (like `checks/spyware.py`) — define a `SPYWARE_CHECKS`-style list and `ALL_CHECKS.extend(...)` it from `checks/__init__.py`.

## Development

```bash
# Install dev dependencies
pip install -e .[dev]

# Run tests (uses a mocked ADB - no device needed)
pytest
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `No devices connected` | Check USB connection, enable USB debugging, try `adb kill-server && adb start-server` |
| `Device unauthorized` | Accept RSA fingerprint prompt on device screen |
| `Command not found: adb` | Install Platform Tools and add to PATH |
| `Permission denied` | Some checks require root on device (run as `adb shell` user) |

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your check in `checks/__init__.py`
4. Run tests: `pytest`
5. Submit a PR

## Disclaimer

This tool is for authorized security testing and educational purposes only. Only use on devices you own or have explicit permission to test. The authors are not responsible for misuse.