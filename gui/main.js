const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const POLL_INTERVAL_MS = 2000;

let mainWindow = null;
let devicePollTimer = null;
let currentDeviceSerial = null;
let currentDeviceModel = null;
let scanProcess = null;

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
  });
}

function sendDeviceUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("device-update", payload);
  }
}

function queryDeviceInfo(serial) {
  execFile("adb", ["-s", serial, "shell", "getprop", "ro.product.model"], { timeout: 5000 }, (err, stdout) => {
    currentDeviceModel = err ? "" : String(stdout).trim();
    sendDeviceUpdate({ connected: true, serial, model: currentDeviceModel });
  });
}

function pollDevice() {
  execFile("adb", ["devices"], { timeout: 4000 }, (err, stdout) => {
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

ipcMain.handle("device:info", async () => {
  if (!currentDeviceSerial) return null;
  const serial = currentDeviceSerial;
  const model = currentDeviceModel;
  const android = await new Promise((resolve) => {
    execFile("adb", ["-s", serial, "shell", "getprop", "ro.build.version.release"], { timeout: 5000 }, (err, out) =>
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