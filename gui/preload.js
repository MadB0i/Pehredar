const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pehredar", {
  startDevicePolling: () => ipcRenderer.send("device:start"),
  onDeviceUpdate: (callback) => {
    ipcRenderer.on("device-update", (_event, data) => callback(data));
  },
  startScan: () => ipcRenderer.send("scan:start"),
  cancelScan: () => ipcRenderer.send("scan:cancel"),
  onProgress: (callback) => {
    ipcRenderer.on("scan-progress", (_event, data) => callback(data));
  },
  onScanExit: (callback) => {
    ipcRenderer.on("scan-exit", (_event, data) => callback(data));
  },
  onScanError: (callback) => {
    ipcRenderer.on("scan-error", (_event, data) => callback(data));
  },
  onScanSaved: (callback) => {
    ipcRenderer.on("scan-saved", (_event, data) => callback(data));
  },
  onUninstallProgress: (callback) => {
    ipcRenderer.on("uninstall-progress", (_event, data) => callback(data));
  },
  packages: {
    system: () => ipcRenderer.invoke("app:system-packages"),
    labels: (pkgs) => ipcRenderer.invoke("app:labels", pkgs),
    uninstall: (pkgs) => ipcRenderer.invoke("app:uninstall", pkgs),
  },
  deviceInfo: () => ipcRenderer.invoke("device:info"),
  agent: {
    start: (kind, opts) => ipcRenderer.send("agent:start", kind, opts),
    cancel: () => ipcRenderer.send("agent:cancel"),
    onEvent: (callback) => {
      ipcRenderer.on("agent-event", (_event, data) => callback(data));
    },
  },
  fastboot: {
    detect: () => ipcRenderer.invoke("fastboot:detect"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch),
  },
  adb: {
    test: (adbPath) => ipcRenderer.invoke("adb:test", adbPath),
    detect: () => ipcRenderer.invoke("adb:detect"),
  },
  dialog: {
    file: () => ipcRenderer.invoke("dialog:file"),
  },
  scans: {
    list: () => ipcRenderer.invoke("scans:list"),
    get: (id) => ipcRenderer.invoke("scans:get", id),
    export: (id) => ipcRenderer.invoke("scans:export", id),
    dir: () => ipcRenderer.invoke("scans:dir"),
    clear: () => ipcRenderer.invoke("scans:clear"),
  },
  openPath: (p) => ipcRenderer.invoke("shell:open", p),
});