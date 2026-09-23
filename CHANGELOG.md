# Changelog

All notable changes to Pehredar are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **First-run onboarding**: 3-step USB-debugging guide overlay on first launch (persisted flag, replayable from Settings → ADB Configuration), plus a matching section in the personal-use guide.
- **Stalkerware DB updates**: versioned envelope (`version`/`updated`/`source`), `scripts/update_stalkerware_db.py` (`--check` freshness with exit 2 when stale, `--merge` for validated curator additions with auto version-bump), DB version stamped in scan evidence (`[db vN]`), warning-only CI freshness step.
- **Scan-compare in the GUI**: History detail view gains a Compare button that diffs the scan against the previous one (new/resolved failures, new/removed flagged apps, risk change) — renderer-side port of `pehredar/diff.py`, verified field-identical against the Python output.
- **GUI boot smoke test**: `electron . --smoke-test` boots the full app headlessly and exits 0 on `SMOKE-OK` (catches startup-crash class bugs like a module missing from `app.asar`); new `gui-smoke` CI job runs it under xvfb on every push/PR.

### Removed
- Removed the Advanced/Root Agent feature — out of scope for this tool's detection-focused positioning.

### Changed
- UI consistency pass: dashboard stat/last-scan skeletons, Checks Overview rows in the checklist's visual language, exact-shape history skeletons, detail-overlay crossfade on the standard token, Settings focus treatment aligned, Chart.js animation disabled under reduced-motion.

### Fixed
- **Packaged launch crash**: `scripts/bundled-paths.js` was missing from `app.asar` (`build.files` only listed `main.js`/`preload.js`/`assets`/`renderer`), so every production launch died with "Cannot find module './scripts/bundled-paths'". Now explicitly packaged, with a `tests/test_packaging.py` guard that fails if any runtime `require()` in `main.js` is not covered by `build.files`.

### Added
- **Purposeful motion design** (`gui/renderer/motion-tokens.css`): duration/easing tokens (120/240/360ms, ease-out entrances, ease-in exits), event-driven 12-row scan checklist (pending → running → pass/fail, skipped aware, desync-proof), risk reveal (panel rise, badge pop, 350ms count-up, calm HIGH pulse), crossfade tab navigation, shape-matched skeleton placeholders, one-shot device-connect ping. Live scan view: a slow radar sweep over the check network, visible only while a scan is actually running. Global `prefers-reduced-motion` guard collapses everything to instant state changes.
- **Missing 12th check wired into GUI**: `check_known_stalkerware` added to `CHECK_CATALOG` and the scan graph (previously silently ignored by both).
- Documented licensing basis for bundled adb/fastboot binaries (Apache 2.0, AOSP-sourced).
- **Zero-dependency installer**: `scripts/build_core.py` (PyInstaller `--onefile` → `pehredar-core(.exe)` + `pehredar-agent-core(.exe)` in `gui/resources/bin/<win|linux>/`) and `scripts/fetch-adb.py` (official platform-tools zip → bundled `adb`/`fastboot` + Windows DLLs, never committed to git). `gui/main.js` uses the bundle when `app.isPackaged` and falls back to system `python`/`adb` in dev; missing binaries or unsupported platforms produce an explicit in-app error instead of a silent crash. `release.yml` now fetches, builds, and smoke-tests (`--version` + `adb version`) before packaging. `NOTICE-THIRD-PARTY.md` records the licensing basis (Apache 2.0, AOSP-sourced, scrcpy precedent).
- **Release workflow**: `.github/workflows/release.yml` builds the Electron GUI on tag `v*` (Windows NSIS `.exe` + Linux AppImage) and publishes to GitHub Releases with `SHA256SUMS.txt`. GUI `package.json` gains stable `artifactName`s, `icon.ico` on Windows, and repo metadata. README gains a Download section.
- **Scan diffing**: new `pehredar/diff.py` (`diff_reports` + `format_diff_text`) and `pehredar-diff` CLI (`old.json new.json [--format text|json] [-o diff.json]`, exit 1 on new findings). Answers "since last scan, what changed" — new/resolved failures, added/removed flagged packages, risk delta.
- **Known-stalkerware check**: new `check_known_stalkerware` backed by manually curated `pehredar/checks/stalkerware_db.json` (Coalition Against Stalkerware + TinyCheck snapshot, exact + family-prefix matching). Wired into `ALL_CHECKS`, GUI spyware category, and Simple Mode labels.

## [1.0.0] - 2026-08-16

### Added
- **Root / jailbreak detection** (7 checks): SU binary, root management apps (Magisk / SuperSU / Xposed), build tags, debuggable/secure props, writable `/system`, BusyBox, and Magisk Hide indicators.
- **Spyware / stalkerware detection** (4 checks): hidden apps with no launcher icon (with a trusted-app allowlist), suspicious accessibility services, third-party device admin/owner apps, and hidden apps holding SMS + Camera + Mic + Location simultaneously.
- **Result model**: per-check `status` (`pass` / `fail` / `inconclusive`) and `packages` (involved app IDs). Inconclusive results never count as failures and never inflate the risk score.
- **CLI**: `--json-stream` (one JSON line per check), `--skip-check` (repeatable), `--adb-path`, custom report path, quiet and no-table modes.
- **Reporting**: weighted Low/Medium/High risk scoring, rich terminal table, JSON report export.
- **Electron desktop GUI**: dashboard (device info, quick stats, checks overview, risk trend), animated scan graph, history with detail overlays, settings (check toggles, ADB config, accent colors), about view, and one-click HTML report export.
- **Review & Remove** remediation: failed checks list the exact apps; select and uninstall over ADB with a live progress pass. System apps are protected and nothing is removed without explicit confirmation.
- **Simple Mode**: renderer-side plain-language toggle for scan results (check names + evidence) for non-technical users. Technical results, scoring, and exported reports are unchanged.
- **ADB robustness**: per-command timeouts, Magisk probe timeout handling, and parsing support for the different `query-activities` output formats seen across Android versions.
- **Repo scaffolding**: CI workflow (Python: pytest + ruff), LICENSE (MIT), CONTRIBUTING guide, CHANGELOG, and screenshots placeholder.

### Fixed
- Hidden-app false positives on well-known apps (Google, Facebook, etc.) caused by parsing the launcher-activity query output.
- Magisk-Hide check timing out and being reported as a high-severity failure; blocked probes now resolve to INCONCLUSIVE.

### Security
- No claim of guaranteed security: Pehredar reports indicators only; findings must always be verified before taking action.