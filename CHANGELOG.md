# Changelog

All notable changes to Pehredar are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-23

### Added
- Scan diffing: `pehredar-diff` CLI plus a Compare button in History that diffs a scan against the previous one (new/resolved failures, new/removed flagged apps, risk change).
- Known-stalkerware detection (12th check) backed by a curated, versioned indicator DB (`--check` freshness with exit 2 when stale, `--merge` curator workflow, DB version stamped in scan evidence).
- Safety-first presentation: calm plain-language summary on every scan result; genuine stalkerware matches open a choice screen (preserve evidence / remove with understanding / support options) instead of a direct Uninstall button; India support-resources panel (112, 181, NCW 14490, Cyber 1930).
- Trusted apps allowlist (per-device or global scope) and a first-run USB-debugging onboarding wizard.
- Auto-update via `electron-updater` against GitHub Releases, with a manual check in About.
- GUI boot smoke test (`electron . --smoke-test` plus a CI job) catching startup-crash class bugs.

### Changed
- Zero-dependency packaging: the installer bundles a standalone Python core (PyInstaller) and adb — no Python or platform-tools install needed; dev mode still uses system tools.
- Full motion/UI pass: event-driven scan checklist, risk reveal, crossfade navigation, skeleton loaders, connect ping, live-scan radar, reduced-motion support, and dashboard/history/settings visual consistency.

### Fixed
- Stalkerware check missing from the GUI catalog and scan graph (silently ignored).
- Safety-first gate narrowed to stalkerware identity (was over-triggering on any high-severity finding).
- Settings view crash from a pre-existing unterminated string.
- Packaged launch crash from `bundled-paths.js` missing in `app.asar` (with a packaging guard test).

### Removed
- The Advanced/Root Agent feature (bootloader unlock, root, lock-clear) — out of scope for this tool's detection-focused positioning.

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