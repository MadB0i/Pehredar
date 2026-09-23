"use strict";
// Bundled-binary path resolution for the packaged app.
//
// Shared contract with pehredar/bundled.py (Python mirror used by the build
// scripts and pytest): <resources>/bin/<win|linux>/ holds pehredar-core,
// pehredar-agent-core and adb/fastboot. Keep the two in sync.
//
// This module is pure (no electron dependency) so the platform mapping is
// mockable: pass explicit `platform` ("win32"/"linux"/...) and an `exists`
// predicate in tests.

const path = require("path");

const CORE_SCAN_BASENAME = "pehredar-core";
const CORE_AGENT_BASENAME = "pehredar-agent-core";

function platformDir(platform) {
  if (platform === "win32") return "win";
  if (platform === "linux") return "linux";
  return null;
}

function coreFileName(dirName, kind) {
  const base = kind === "agent" ? CORE_AGENT_BASENAME : CORE_SCAN_BASENAME;
  return dirName === "win" ? `${base}.exe` : base;
}

function adbFileName(dirName) {
  return dirName === "win" ? "adb.exe" : "adb";
}

function fastbootFileName(dirName) {
  return dirName === "win" ? "fastboot.exe" : "fastboot";
}

function binDir(resourcesPath, platform) {
  const dir = platformDir(platform);
  return dir ? path.join(resourcesPath, "bin", dir) : null;
}

function bundledCorePath(resourcesPath, platform, kind) {
  const dir = binDir(resourcesPath, platform);
  if (!dir) return null;
  return path.join(dir, coreFileName(platformDir(platform), kind || "scan"));
}

function bundledAdbPath(resourcesPath, platform) {
  const dir = binDir(resourcesPath, platform);
  if (!dir) return null;
  return path.join(dir, adbFileName(platformDir(platform)));
}

function bundledFastbootPath(resourcesPath, platform) {
  const dir = binDir(resourcesPath, platform);
  if (!dir) return null;
  return path.join(dir, fastbootFileName(platformDir(platform)));
}

function missingCoreError(corePath) {
  return (
    `Bundled scanner is missing (${corePath}). ` +
    "Reinstall Pehredar from the latest GitHub Release — " +
    "if the problem persists, file an issue with your installer version."
  );
}

function missingAdbError(adbPath) {
  return (
    `Bundled adb is missing (${adbPath}). The scanner cannot talk to your phone. ` +
    "Reinstall Pehredar from the latest GitHub Release, or point " +
    "Settings → ADB path at a manual platform-tools install."
  );
}

function unsupportedPlatformError(platform) {
  return (
    `Pehredar's packaged app does not support this platform ('${platform}'). ` +
    "Run from source instead: install Python 3.8+ and adb, then " +
    "`pip install -e .` (see README Quick Start)."
  );
}

// Mirrors pehredar/bundled.py::resolve_launch. `opts.exists` defaults to
// fs.existsSync; tests inject a stub.
function resolveLaunch(opts) {
  const fs = require("fs");
  const {
    isPackaged,
    resourcesPath,
    platform,
    kind,
    settingsAdbPath,
    exists,
  } = Object.assign(
    { kind: "scan", settingsAdbPath: "", exists: fs.existsSync },
    opts || {}
  );
  const customAdb = (settingsAdbPath || "").trim();

  if (!isPackaged) {
    return {
      mode: "dev",
      command: null, // caller uses pythonCommand()
      argsPrefix: ["-m", kind === "agent" ? "pehredar.agent_cli" : "pehredar.cli"],
      adbPath: customAdb || "adb",
      error: null,
    };
  }

  if (!platformDir(platform)) {
    return {
      mode: "bundled",
      command: null,
      argsPrefix: [],
      adbPath: customAdb || "adb",
      error: unsupportedPlatformError(platform),
    };
  }

  const core = bundledCorePath(resourcesPath, platform, kind);
  if (!exists(core)) {
    return {
      mode: "bundled",
      command: null,
      argsPrefix: [],
      adbPath: customAdb || bundledAdbPath(resourcesPath, platform),
      error: missingCoreError(core),
    };
  }

  const adb = customAdb || bundledAdbPath(resourcesPath, platform);
  if (!customAdb && !exists(adb)) {
    return {
      mode: "bundled",
      command: core,
      argsPrefix: [],
      adbPath: adb,
      error: missingAdbError(adb),
    };
  }

  return { mode: "bundled", command: core, argsPrefix: [], adbPath: adb, error: null };
}

module.exports = {
  CORE_SCAN_BASENAME,
  CORE_AGENT_BASENAME,
  platformDir,
  coreFileName,
  adbFileName,
  fastbootFileName,
  binDir,
  bundledCorePath,
  bundledAdbPath,
  bundledFastbootPath,
  missingCoreError,
  missingAdbError,
  unsupportedPlatformError,
  resolveLaunch,
};
