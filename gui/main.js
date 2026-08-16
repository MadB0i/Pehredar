const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const POLL_INTERVAL_MS = 2000;

const CHECK_CATEGORIES = {
  root: [
    "check_su_binary",
    "check_root_packages",
    "check_build_tags",
    "check_debuggable_secure",
    "check_writable_system",
    "check_busybox",
    "check_magisk_hide",
  ],
  spyware: [
    "check_hidden_apps",
    "check_accessibility_services",
    "check_device_admin",
    "check_sensitive_permissions",
  ],
};

const DEFAULT_SETTINGS = {
  adbPath: "",
  accent: "cyan",
  simple: false,
  agentMode: "temporary",
  checks: {
    categories: { root: true, spyware: true },
    enabled: {},
  },
};

let mainWindow = null;
let devicePollTimer = null;
let currentDeviceSerial = null;
let currentDeviceModel = null;
let scanProcess = null;
let agentProcess = null;
let pendingAgent = null;

// ---- settings persistence ----
function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getSettings() {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    if (saved.adbPath !== undefined) base.adbPath = saved.adbPath;
    if (saved.accent !== undefined) base.accent = saved.accent;
    if (saved.simple !== undefined) base.simple = saved.simple;
    if (saved.agentMode !== undefined) base.agentMode = saved.agentMode;
    if (saved.checks) {
      if (saved.checks.categories) base.checks.categories = Object.assign({}, base.checks.categories, saved.checks.categories);
      if (saved.checks.enabled) base.checks.enabled = Object.assign({}, base.checks.enabled, saved.checks.enabled);
    }
  } catch {
    /* no settings yet */
  }
  return base;
}

function saveSettings(patch) {
  const current = getSettings();
  const merged = Object.assign({}, current, patch);
  if (patch.checks) {
    merged.checks = {
      categories: Object.assign({}, current.checks.categories, patch.checks.categories || {}),
      enabled: Object.assign({}, current.checks.enabled, patch.checks.enabled || {}),
    };
  }
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(merged, null, 2));
  } catch (e) {
    /* ignore write errors */
  }
  return merged;
}

function adbExecutable() {
  const s = getSettings();
  return s.adbPath && s.adbPath.trim() ? s.adbPath.trim() : "adb";
}

function skippedChecks() {
  const s = getSettings();
  const skip = [];
  for (const cat of Object.keys(CHECK_CATEGORIES)) {
    const categoryOn = s.checks.categories[cat] !== false;
    for (const slug of CHECK_CATEGORIES[cat]) {
      const individualOn = s.checks.enabled[slug] !== false;
      if (!categoryOn || !individualOn) skip.push(slug);
    }
  }
  return skip;
}

function scansDir() {
  return path.join(app.getPath("userData"), "scans");
}
function reportsDir() {
  return path.join(app.getPath("userData"), "reports");
}
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

function resolveProjectRoot() {
  // In dev the project root is one level above gui/. When packaged, the
  // bundled `pehredar` Python package lives in the app resources.
  if (app.isPackaged) return process.resourcesPath;
  return path.resolve(__dirname, "..");
}

function pythonCommand() {
  if (process.env.PEHREDAR_PY) return process.env.PEHREDAR_PY;
  return process.platform === "win32" ? "python" : "python3";
}

function appIconPath() {
  return path.join(__dirname, "assets", "icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0a0e14",
    title: "Pehredar",
    icon: appIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
    stopDevicePolling();
    killScan();
    killAgent();
  });
}

function sendDeviceUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("device-update", payload);
  }
}

function queryDeviceInfo(serial) {
  execFile(adbExecutable(), ["-s", serial, "shell", "getprop", "ro.product.model"], { timeout: 5000 }, (err, stdout) => {
    currentDeviceModel = err ? "" : String(stdout).trim();
    sendDeviceUpdate({ connected: true, serial, model: currentDeviceModel });
  });
}

function pollDevice() {
  execFile(adbExecutable(), ["devices"], { timeout: 4000 }, (err, stdout) => {
    if (err) {
      currentDeviceSerial = null;
      sendDeviceUpdate({ connected: false, error: String(err.message) });
      return;
    }
    const lines = String(stdout).split(/\r?\n/).slice(1);
    let serial = null;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] === "device") {
        serial = parts[0];
        break;
      }
    }
    if (!serial) {
      currentDeviceSerial = null;
      currentDeviceModel = "";
      sendDeviceUpdate({ connected: false });
      return;
    }
    if (currentDeviceSerial !== serial) {
      currentDeviceSerial = serial;
      queryDeviceInfo(serial);
    } else {
      sendDeviceUpdate({ connected: true, serial, model: currentDeviceModel });
    }
  });
}

function startDevicePolling() {
  if (devicePollTimer) return;
  pollDevice();
  devicePollTimer = setInterval(pollDevice, POLL_INTERVAL_MS);
}

function stopDevicePolling() {
  if (devicePollTimer) {
    clearInterval(devicePollTimer);
    devicePollTimer = null;
  }
}

function reportPath() {
  return path.join(app.getPath("userData"), "pehredar_report.json");
}

function startScan() {
  if (!currentDeviceSerial || scanProcess) return;

  const root = resolveProjectRoot();
  const args = [
    "-m",
    "pehredar.cli",
    "-s",
    currentDeviceSerial,
    "-o",
    reportPath(),
    "--json-stream",
    "--quiet",
  ];
  const settings = getSettings();
  if (settings.adbPath && settings.adbPath.trim()) {
    args.push("--adb-path", settings.adbPath.trim());
  }
  for (const slug of skippedChecks()) {
    args.push("--skip-check", slug);
  }

  const env = Object.assign({}, process.env);
  if (app.isPackaged) {
    env.PYTHONPATH = process.resourcesPath + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : "");
  }

  scanProcess = spawn(pythonCommand(), args, {
    cwd: root,
    windowsHide: true,
    env,
  });

  let buffer = "";
  scanProcess.stdout.setEncoding("utf8");
  scanProcess.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj = null;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scan-progress", obj);
      }
      if (obj.status === "complete") {
        const id = new Date().toISOString().replace(/[:.]/g, "-");
        saveScan({
          id,
          timestamp: new Date().toISOString(),
          device: { serial: currentDeviceSerial, model: currentDeviceModel },
          risk_level: obj.risk_level,
          risk_score: obj.risk_score,
          summary: obj.summary || null,
          checks: obj.checks || [],
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("scan-saved", { id });
        }
      }
    }
  });

  let errorBuffer = "";
  scanProcess.stderr.setEncoding("utf8");
  scanProcess.stderr.on("data", (chunk) => {
    errorBuffer += chunk;
  });

  scanProcess.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("scan-error", { code: -1, error: String(err.message) });
    }
  });

  scanProcess.on("close", (code) => {
    const error = errorBuffer.trim();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (code !== 0 && error) {
        mainWindow.webContents.send("scan-error", { code, error });
      }
      mainWindow.webContents.send("scan-exit", { code });
    }
    scanProcess = null;
  });
}

function killScan() {
  if (scanProcess) {
    try {
      scanProcess.kill();
    } catch {
      /* already dead */
    }
    scanProcess = null;
  }
}

// ---- agent (root / lock recovery) ----
function agentEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-event", payload);
  }
}

function agentWorkdir() {
  return path.join(app.getPath("userData"), "agent-work");
}

// kind: "plan-root" | "run-root" | "plan-lock" | "run-lock"
function runAgent(kind, opts) {
  if (!currentDeviceSerial) return false;
  if (agentProcess) {
    // previous agent (e.g. a just-finished plan) is still shutting down —
    // replace it so a quick Plan -> Run works instead of silently no-oping.
    pendingAgent = { kind, opts };
    try {
      agentProcess.kill();
    } catch {
      /* already dead */
    }
    return true;
  }
  return spawnAgent(kind, opts);
}

function spawnAgent(kind, opts) {
  const root = resolveProjectRoot();
  const args = ["-m", "pehredar.agent_cli", "-s", currentDeviceSerial, "--json-stream"];
  const settings = getSettings();
  if (settings.adbPath && settings.adbPath.trim()) {
    args.push("--adb-path", settings.adbPath.trim());
  }
  args.push("--workdir", agentWorkdir());

  // unlock secrets travel via temp files so they never appear in the process list
  const tempFiles = [];
  try {
    if (opts && opts.pin) {
      const f = path.join(app.getPath("temp"), `pehredar-pin-${process.pid}.txt`);
      fs.writeFileSync(f, String(opts.pin), "utf8");
      tempFiles.push(f);
      args.push("--unlock-pin-file", f);
    }
    if (opts && opts.pattern) {
      const f = path.join(app.getPath("temp"), `pehredar-pat-${process.pid}.txt`);
      fs.writeFileSync(f, String(opts.pattern), "utf8");
      tempFiles.push(f);
      args.push("--unlock-pattern-file", f);
    }
  } catch (e) {
    /* ignore temp write errors */
  }

  if (kind === "plan-root" || kind === "run-root") {
    args.push("--mode", settings.agentMode === "permanent" ? "permanent" : "temporary");
  }
  if (kind === "plan-root") {
    args.push("--plan-only");
  } else if (kind === "plan-lock") {
    args.push("--lock-recovery", "--plan-only");
  } else if (kind === "run-lock") {
    args.push("--lock-recovery", "--yes");
  } else if (kind === "run-root") {
    args.push("--yes");
  }

  const env = Object.assign({}, process.env);
  if (app.isPackaged) {
    env.PYTHONPATH = process.resourcesPath + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : "");
  }

  agentProcess = spawn(pythonCommand(), args, { cwd: root, windowsHide: true, env });

  let buffer = "";
  agentProcess.stdout.setEncoding("utf8");
  agentProcess.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj = null;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }
      agentEvent(obj);
    }
  });

  let errorBuffer = "";
  agentProcess.stderr.setEncoding("utf8");
  agentProcess.stderr.on("data", (chunk) => {
    errorBuffer += chunk;
  });

  agentProcess.on("error", (err) => {
    agentEvent({ type: "error", error: String(err.message) });
  });

  agentProcess.on("close", (code) => {
    const err = errorBuffer.trim();
    if (code !== 0 && err) {
      agentEvent({ type: "error", error: err });
    }
    agentEvent({ type: "exit", code });
    agentProcess = null;
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* already gone */
      }
    }
    if (pendingAgent) {
      const next = pendingAgent;
      pendingAgent = null;
      spawnAgent(next.kind, next.opts);
    }
  });
  return true;
}

function killAgent() {
  pendingAgent = null;
  if (agentProcess) {
    try {
      agentProcess.kill();
    } catch {
      /* already dead */
    }
    agentProcess = null;
  }
}

// ---- scan history persistence ----
function listScans() {
  ensureDir(scansDir());
  const out = [];
  let names;
  try {
    names = fs.readdirSync(scansDir());
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(scansDir(), name), "utf8"));
      out.push({
        id: rec.id,
        timestamp: rec.timestamp,
        device: rec.device,
        risk_level: rec.risk_level,
        risk_score: rec.risk_score,
        summary: rec.summary,
      });
    } catch {
      /* skip corrupt file */
    }
  }
  out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return out;
}

function getScan(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(scansDir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

function saveScan(record) {
  ensureDir(scansDir());
  const id = record.id || new Date().toISOString().replace(/[:.]/g, "-");
  record.id = id;
  fs.writeFileSync(path.join(scansDir(), `${id}.json`), JSON.stringify(record, null, 2));
  return id;
}

function clearScans() {
  ensureDir(scansDir());
  for (const name of fs.readdirSync(scansDir())) {
    if (name.endsWith(".json")) {
      try {
        fs.unlinkSync(path.join(scansDir(), name));
      } catch {
        /* ignore */
      }
    }
  }
  ensureDir(reportsDir());
  for (const name of fs.readdirSync(reportsDir())) {
    try {
      fs.unlinkSync(path.join(reportsDir(), name));
    } catch {
      /* ignore */
    }
  }
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(rec) {
  const checks = rec.checks || [];
  const summary = rec.summary || {};
  const device = rec.device || {};
  const rows = checks
    .map(
      (c) => `
      <tr class="${c.passed ? "pass" : "fail"}">
        <td class="status">${c.passed ? "PASS" : "FAIL"}</td>
        <td class="name">${escHtml(c.check || c.name || "")}</td>
        <td class="sev">${escHtml(String(c.severity || "info").toUpperCase())}</td>
        <td class="evidence">${escHtml(c.evidence || "")}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Pehredar Report - ${escHtml(rec.id || "")}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0e14; color: #e6edf7; font-family: "Segoe UI", system-ui, sans-serif; padding: 40px; }
  .mono { font-family: "Cascadia Code", Consolas, monospace; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(0,229,255,0.25); padding-bottom: 18px; margin-bottom: 28px; }
  .brand { color: #00e5ff; font-weight: 700; letter-spacing: 6px; font-size: 22px; font-family: "Cascadia Code", Consolas, monospace; }
  .badge { display: inline-block; padding: 6px 16px; border-radius: 8px; font-weight: 700; letter-spacing: 2px; }
  .badge.low { color: #00ff66; border: 1px solid rgba(0,255,102,0.5); background: rgba(0,255,102,0.08); }
  .badge.medium { color: #ffd700; border: 1px solid rgba(255,215,0,0.5); background: rgba(255,215,0,0.08); }
  .badge.high { color: #ff2d55; border: 1px solid rgba(255,45,85,0.5); background: rgba(255,45,85,0.08); }
  .info { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 30px; }
  .info .cell { background: rgba(20,28,43,0.6); border: 1px solid rgba(148,184,255,0.12); border-radius: 12px; padding: 14px 16px; }
  .info .k { font-size: 11px; color: #7d8aa0; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
  .info .v { font-size: 15px; }
  h2 { font-size: 13px; color: #7d8aa0; letter-spacing: 3px; margin: 26px 0 12px; }
  table { width: 100%; border-collapse: collapse; background: rgba(20,28,43,0.5); border: 1px solid rgba(148,184,255,0.12); border-radius: 12px; overflow: hidden; }
  th { text-align: left; padding: 12px 14px; font-size: 11px; letter-spacing: 2px; color: #7d8aa0; border-bottom: 1px solid rgba(148,184,255,0.15); }
  td { padding: 11px 14px; border-bottom: 1px solid rgba(148,184,255,0.07); font-size: 13px; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.status { font-weight: 700; width: 70px; }
  tr.pass td.status { color: #00ff66; }
  tr.fail td.status { color: #ff2d55; }
  td.name { width: 240px; }
  td.sev { width: 90px; color: #7d8aa0; font-size: 11px; }
  td.evidence { color: #b8c6d6; }
  .foot { margin-top: 30px; color: #4a5568; font-size: 12px; text-align: center; }
  @media print { body { background: #fff; color: #111; } .badge.low { color:#0a0; } .badge.medium { color:#a80; } .badge.high { color:#c00; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">PEHREDAR</div>
    <div><span class="badge ${escHtml((rec.risk_level || "Low").toLowerCase())}">${escHtml((rec.risk_level || "Low").toUpperCase())}</span></div>
  </div>

  <div class="info">
    <div class="cell"><div class="k">Device</div><div class="v mono">${escHtml(device.model || "Unknown")}</div></div>
    <div class="cell"><div class="k">Serial</div><div class="v mono">${escHtml(device.serial || "—")}</div></div>
    <div class="cell"><div class="k">Timestamp</div><div class="v mono">${escHtml(rec.timestamp || "")}</div></div>
    <div class="cell"><div class="k">Risk Score</div><div class="v mono">${escHtml(String(rec.risk_score ?? ""))}</div></div>
  </div>

  <h2>SUMMARY</h2>
  <div class="info">
    <div class="cell"><div class="k">Total Checks</div><div class="v mono">${escHtml(String(summary.total_checks ?? checks.length))}</div></div>
    <div class="cell"><div class="k">Passed</div><div class="v mono" style="color:#00ff66">${escHtml(String(summary.passed ?? 0))}</div></div>
    <div class="cell"><div class="k">Failed</div><div class="v mono" style="color:#ff2d55">${escHtml(String(summary.failed ?? 0))}</div></div>
    <div class="cell"><div class="k">High Severity</div><div class="v mono">${escHtml(String(summary.high_severity ?? 0))}</div></div>
  </div>

  <h2>CHECK RESULTS</h2>
  <table>
    <thead><tr><th>Status</th><th>Check</th><th>Severity</th><th>Evidence</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="foot">Generated by Pehredar — Android root / spyware detection.</div>
</body>
</html>`;
}

function exportScan(id) {
  const rec = getScan(id);
  if (!rec) return null;
  ensureDir(reportsDir());
  const out = path.join(reportsDir(), `${id}.html`);
  fs.writeFileSync(out, buildReportHtml(rec));
  shell.openExternal("file://" + encodeURI(out.replace(/\\/g, "/")));
  return out;
}

// ---- IPC ----
ipcMain.on("device:start", () => startDevicePolling());
ipcMain.on("scan:start", () => startScan());
ipcMain.on("scan:cancel", () => killScan());
ipcMain.on("agent:start", (_e, kind, opts) => runAgent(kind, opts));
ipcMain.on("agent:cancel", () => killAgent());

ipcMain.handle("fastboot:detect", async () => {
  return new Promise((resolve) => {
    const exe = process.platform === "win32" ? "where" : "which";
    execFile(exe, ["fastboot"], { timeout: 4000 }, (err, stdout) => {
      if (err || !String(stdout).trim()) resolve({ found: false, path: "" });
      else resolve({ found: true, path: String(stdout).trim().split(/\r?\n/)[0] });
    });
  });
});

ipcMain.handle("device:info", async () => {
  if (!currentDeviceSerial) return null;
  const serial = currentDeviceSerial;
  const model = currentDeviceModel;
  const android = await new Promise((resolve) => {
    execFile(adbExecutable(), ["-s", serial, "shell", "getprop", "ro.build.version.release"], { timeout: 5000 }, (err, out) =>
      resolve(err ? "" : String(out).trim())
    );
  });
  return { serial, model, android };
});

ipcMain.handle("scans:list", () => listScans());
ipcMain.handle("scans:get", (_e, id) => getScan(id));
ipcMain.handle("scans:clear", () => {
  clearScans();
  return true;
});
ipcMain.handle("scans:dir", () => scansDir());
ipcMain.handle("scans:export", (_e, id) => exportScan(id));
ipcMain.handle("shell:open", (_e, p) => (p ? shell.openPath(p) : null));

// ---- settings ----
ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:set", (_e, patch) => saveSettings(patch || {}));

// ---- adb configuration ----
function runAdbDevices(adbPath) {
  return new Promise((resolve) => {
    const exe = adbPath && adbPath.trim() ? adbPath.trim() : "adb";
    execFile(exe, ["devices"], { timeout: 6000 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === "ENOENT") {
          resolve({ ok: false, error: `adb not found at '${exe}'`, stdout: "", stderr: "" });
        } else {
          resolve({ ok: false, error: String(err.message), stdout: String(stdout || ""), stderr: String(stderr || "") });
        }
        return;
      }
      const text = String(stdout || "") + (String(stderr || "").trim() ? "\n[stderr] " + String(stderr) : "");
      const hasDevice = /(^|\n)([\w\-.:]+)\tdevice(\r|$|\n)/.test(String(stdout || ""));
      resolve({ ok: true, error: "", stdout: text.trim(), stderr: String(stderr || ""), hasDevice });
    });
  });
}

ipcMain.handle("adb:test", async (_e, adbPath) => {
  return runAdbDevices(adbPath);
});

ipcMain.handle("adb:detect", async () => {
  return new Promise((resolve) => {
    const exe = process.platform === "win32" ? "where" : "which";
    execFile(exe, ["adb"], { timeout: 4000 }, (err, stdout) => {
      if (err || !String(stdout).trim()) resolve({ found: false, path: "" });
      else resolve({ found: true, path: String(stdout).trim().split(/\r?\n/)[0] });
    });
  });
});

ipcMain.handle("dialog:file", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: "Select adb executable",
    properties: ["openFile"],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// ---- app remediation (review & remove) ----
function parseSystemPackages(stdout) {
  const set = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("package:")) set.add(t.slice("package:".length));
  }
  return set;
}

function systemPackages(serial) {
  return new Promise((resolve) => {
    execFile(adbExecutable(), ["-s", serial, "shell", "pm", "list", "packages", "-s"], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(new Set());
      resolve(parseSystemPackages(stdout));
    });
  });
}

function getAppLabel(serial, pkg) {
  return new Promise((resolve) => {
    execFile(adbExecutable(), ["-s", serial, "shell", "dumpsys", "package", pkg], { timeout: 6000 }, (err, stdout) => {
      if (err) return resolve(null);
      const text = String(stdout);
      // best-effort: resolved labels in the package dump (activity resolver /
      // applicationInfo sections). Falls back to the package ID when absent.
      const m = text.match(/Label=(.+?)(?:\r?\n|$)/);
      if (m && m[1].trim() && m[1].trim() !== pkg) return resolve(m[1].trim());
      resolve(null);
    });
  });
}

function runUninstall(serial, pkg) {
  return new Promise((resolve) => {
    execFile(adbExecutable(), ["-s", serial, "uninstall", pkg], { timeout: 20000 }, (err, stdout, stderr) => {
      const out = String(stdout || "").trim();
      if (!err && /^success$/i.test(out)) return resolve({ ok: true, reason: "" });
      const fm = out.match(/Failure\s*(?:\[([^\]]*)\])?/i);
      const reason = fm && fm[1] ? fm[1] : String(stderr || "").trim() || out || (err && err.message) || "unknown error";
      resolve({ ok: false, reason });
    });
  });
}

ipcMain.handle("app:system-packages", async () => {
  if (!currentDeviceSerial) return [];
  const set = await systemPackages(currentDeviceSerial);
  return Array.from(set);
});

ipcMain.handle("app:labels", async (_e, pkgs) => {
  if (!currentDeviceSerial) return {};
  const serial = currentDeviceSerial;
  const arr = (Array.isArray(pkgs) ? pkgs : []).filter((p) => typeof p === "string" && p);
  const out = {};
  for (const pkg of arr) {
    out[pkg] = await getAppLabel(serial, pkg);
  }
  return out;
});

ipcMain.handle("app:uninstall", async (_e, pkgs) => {
  if (!currentDeviceSerial) return { error: "No device connected" };
  const serial = currentDeviceSerial;
  const arr = (Array.isArray(pkgs) ? pkgs : []).filter((p) => typeof p === "string" && p);
  if (!arr.length) return { error: "No packages selected" };

  // final native confirmation per batch action
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "Confirm uninstall",
    message: `You are about to uninstall ${arr.length} app${arr.length === 1 ? "" : "s"}. This cannot be undone. Continue?`,
    detail: arr.join(", "),
    buttons: ["Cancel", "Uninstall"],
    defaultId: 0,
    cancelId: 0,
  });
  if (response !== 1) return { canceled: true };

  // safety: re-cross-check system apps before touching anything
  const system = await systemPackages(serial);
  const results = [];
  let removed = 0;
  let failed = 0;
  for (const pkg of arr) {
    if (system.has(pkg)) {
      const r = { pkg, ok: false, reason: "System app — cannot remove" };
      results.push(r);
      failed++;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("uninstall-progress", { pkg, state: "failed", reason: r.reason });
      }
      continue;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("uninstall-progress", { pkg, state: "removing" });
    }
    const res = await runUninstall(serial, pkg);
    if (res.ok) {
      removed++;
    } else {
      failed++;
    }
    results.push({ pkg, ok: res.ok, reason: res.reason });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("uninstall-progress", { pkg, state: res.ok ? "removed" : "failed", reason: res.reason });
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return { removed, failed, canceled: false, results };
});

app.setAppUserModelId("com.pehredar.desktop");

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});