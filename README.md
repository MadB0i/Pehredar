# Pehredar

**Pehredar** (Hindi: पहरेदार, "watchman / guard") checks Android devices for root, jailbreak, and hidden-monitoring indicators over ADB — no on-device installation required.

![Build](https://img.shields.io/badge/build-pending-lightgrey) <!-- TODO: point at your CI workflow status badge -->
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-00e5ff)

## What is Pehredar?

Pehredar is two things in one tool:

- **For developers and QA teams** — a compliance testing tool that verifies how an Android app behaves against rooted or compromised devices. It runs 11 detection checks over ADB, needs nothing installed on the phone, and exports client-ready reports (JSON, plus printable HTML from the desktop app) you can hand to stakeholders.

- **For individuals** — a way to find out if your own phone has been tampered with or has hidden monitoring (spyware/stalkerware) apps installed. Plug in your phone, click a button, and read results in plain language — no technical knowledge needed.

Both audiences share the exact same detection engine; they differ only in how results are presented.

## Features

### Root / Jailbreak Detection
- **su binary** — scans common paths for the super-user binary
- **Root management apps** — detects Magisk, SuperSU, Xposed and similar
- **Build tags** — flags unofficial `test-keys` firmware
- **Debuggable / secure props** — catches userdebug / eng builds
- **Writable /system** — detects a remounted, writable system partition
- **BusyBox** — finds the common root toolkit
- **Magisk Hide** — checks for mount and device-node traces used to hide root

### Spyware / Stalkerware Detection
- **Hidden apps** — third-party apps with no launcher icon (with an allowlist of well-known, trusted apps)
- **Accessibility services** — apps that can read your screen and keystrokes
- **Device admin / owner** — apps that could lock or wipe the device
- **Sensitive permissions** — hidden apps holding SMS + Camera + Mic + Location at once

### Reporting
- **Risk scoring** — aggregates results into Low / Medium / High with a weighted score
- **JSON reports** — deterministic, machine-readable output for CI and compliance
- **JSON streaming** — one JSON line per check for live GUI / pipeline consumption
- **Electron desktop app** — animated scan graph, dashboard, history, and one-click HTML export

### Remediation
- **Review & Remove** — failed checks list the exact apps involved; select them and Pehredar uninstalls them over ADB with a live progress pass (system apps are protected)
- **Safe defaults** — nothing is ever uninstalled without an explicit confirm dialog

## Screenshots

| Scan | Dashboard | Detail |
| ---- | --------- | ------ |
| *(add scan view screenshot)* | *(add dashboard screenshot)* | *(add scan detail screenshot)* |

## Quick Start

### 1. Install

```bash
git clone https://github.com/MadB0i/Pehredar.git
cd Pehredar
pip install -e .
```

Prerequisites: **Python 3.8+** and **ADB (Android Debug Bridge)**.

### 2. Set up ADB

- Windows: install [Android Platform Tools](https://developer.android.com/studio/releases/platform-tools) and add `platform-tools` to your PATH
- macOS: `brew install android-platform-tools`
- Linux: `sudo apt install android-tools-adb`

Verify with `adb devices`.

### 3. Run your first scan

1. On your phone: **Settings → About Phone → tap "Build Number" 7 times** (enables Developer Options)
2. **Settings → Developer Options → USB Debugging** → on
3. Connect the phone over USB and **authorize the computer** when prompted
4. Run a scan:

```bash
pehredar
```

That's it. You'll get a per-check table and a risk summary:

```
╭──────────────────── Summary ────────────────────╮
│ Total Checks: 11                                 │
│ Passed: 10  Failed: 1  Inconclusive: 0           │
│ High Severity: 0  Medium: 1  Low: 0              │
│ Risk Level: HIGH  Score: 2                       │
╰──────────────────────────────────────────────────╯
```

Or launch the desktop app and click **New Scan**:

```bash
cd gui
npm install
npm start
```

### CLI reference

```bash
pehredar                       # scan the first authorized device
pehredar -s <serial>           # target a specific device
pehredar -o report.json        # custom report path
pehredar --json-stream -o r.json  # one JSON line per check (for GUI/CI)
pehredar --skip-check check_build_tags   # skip specific checks
pehredar --adb-path "C:\platform-tools\adb.exe"   # custom adb
pehredar --help
```

## For Developers

### Extending checks

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

### Running tests

```bash
pip install -e .[dev]
pytest          # mocked ADB — no device needed
```

### JSON report format

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

### Detection reference

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

### Contributing

1. Fork the repository
2. Create a feature branch
3. Add your check and a regression test in `tests/` (mocked ADB)
4. Run `pytest` and `ruff check pehredar tests`
5. Submit a PR

## For Personal Use

Pehredar checks your phone for two things: **signs that its security has been bypassed** (rooting/hacking) and **apps that could be spying on you** (hidden or overly powerful apps). Turn on **Simple Mode** in the desktop app's Settings to read results in everyday language.

A typical scan checks:

- **Is your phone's software official?** Tampered firmware usually shows up here.
- **Can apps take full control?** Root tools (like Magisk) give apps powers they shouldn't have.
- **Are any apps hiding from your app list?** Spyware often hides its icon so you can't find it.
- **Can any app see your screen or read what you type?** "Accessibility" access can do exactly that.
- **Does any app have special control over your phone?** Such apps could lock or even wipe your device.
- **Can any hidden app read your messages, camera, microphone and location all at once?** That combination is a strong spyware signature.

**What if something is flagged?**

- Don't panic — a flag is an *indicator*, not a verdict.
- Read the explanation in Simple Mode. Some flags are explained by things you already know (an unlocked bootloader you enabled, an app you installed knowingly).
- Pehredar can remove suspicious apps for you: in the scan results, tap **Review & Remove**, select the apps, and confirm. System apps are never touched.
- If you're unsure about a finding, ask someone technical before removing anything — uninstalling an app is permanent.

## License

MIT License — see [LICENSE](LICENSE).

## Disclaimer

Pehredar reports **indicators**, not a guarantee of security. A clean scan does not prove a device is safe, and a flagged item is not proof of wrongdoing. Always verify findings yourself before taking any action (such as uninstalling an app), and only use this tool on devices you own or are authorized to test.