# Contributing to Pehredar

Thanks for helping improve Pehredar. This guide covers setting up your dev environment, running the checks, and what to keep in mind when opening a PR.

## Setting up the dev environment

### Python (CLI + detection engine)

```bash
# 1. Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 2. Install the package in editable mode with dev dependencies
pip install -e .[dev]
```

This gives you the `pehredar` CLI plus `pytest` and `ruff`.

### Electron GUI (desktop app)

```bash
cd gui
npm install
npm start          # run in dev mode
```

The GUI spawns `python -m pehredar.cli` as a subprocess, so make sure your Python virtual environment is active (or set the `PEHREDAR_PY` env var to your Python interpreter) when running it.

## Running tests and linting

```bash
# Python unit tests (mocked ADB — no device needed)
pytest

# Lint the Python code
ruff check pehredar tests

# Syntax-check the Electron renderer / main-process JS
cd gui
Get-ChildItem -Recurse -Filter *.js .\ | ForEach-Object { node --check $_.FullName }   # PowerShell
find . -name "*.js" -exec node --check {} \;                                            # macOS / Linux
```

## How to add a new check

Checks live in `pehredar/checks/`. A check is a plain function that takes an `ADBConnection` and returns a `CheckResult`:

```python
def check_custom_indicator(adb: ADBConnection) -> CheckResult:
    # your detection logic — run adb commands, interpret the output
    return CheckResult(
        name="Custom Check",
        passed=True,          # or False
        evidence="...",
        severity="medium",    # high / medium / low / info
        packages=[],          # involved app package IDs (optional, used by Review & Remove)
    )
```

Register it so the CLI and GUI know about it:

- **`pehredar/checks/__init__.py`** — append to `ALL_CHECKS` (or `ALL_CHECKS.extend(...)` with a module-level list like `SPYWARE_CHECKS`).
- **`gui/renderer/components.js`** — add a `{ slug, name, category, short, long }` entry to `CHECK_CATALOG` so it appears in the dashboard/settings.
- **`gui/renderer/graph.js`** — add the node to `NODES` so the scan graph shows it.
- **`gui/renderer/simple-labels.js`** — add plain-language `name` + `pass` / `fail` (and `inconclusive` if relevant) strings under the Simple Mode catalog.

### Test conventions

- Put tests in `tests/` using the mocked ADB fixtures (`FakeADB` / `TimeoutADB`) so they run without a device.
- Add a regression test for any realistic device-output format you handle (e.g. the different `query-activities` layouts).
- Prefer realistic command output in mocks over empty strings — that's how real-world parsing bugs get caught.

## PR expectations

- Keep changes scoped. The detection engine (`pehredar/checks/`, `scoring.py`), the display layer, and the docs are separate concerns — don't mix unrelated changes.
- Run the full suite locally before pushing: `pytest` + `ruff check pehredar tests`, and `node --check` on any JS you touched.
- Simple Mode and the exported JSON report must stay accurate for the technical/compliance audience — never let a display change alter raw results or scoring.
- Use the same language and tone as the README for docs changes.
- Write a short description in the PR body covering what changed and how you verified it.