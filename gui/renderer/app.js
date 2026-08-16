(function () {
  "use strict";

  const VIEWS = ["dashboard", "scan", "history", "settings", "about"];
  const TITLES = {
    dashboard: "Dashboard",
    scan: "Scan",
    history: "History",
    settings: "Settings",
    about: "About",
  };

  const app = (window.App = {
    device: { connected: false, serial: "", model: "" },
    scanController: null,
    detail: window.Views.detail,
    review: null,
    toast: function (msg) {
      const t = document.createElement("div");
      t.className = "toast";
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => t.remove(), 300);
      }, 2600);
    },
  });

  // ---- device chip (top bar, always visible) ----
  function updateDeviceChip() {
    const chip = document.getElementById("device-chip");
    const model = document.getElementById("device-model");
    const serial = document.getElementById("device-serial");
    chip.classList.toggle("online", app.device.connected);
    if (app.device.connected) {
      model.textContent = (app.device.model || "ANDROID DEVICE").toUpperCase();
      serial.textContent = app.device.serial;
    } else {
      model.textContent = "NO DEVICE";
      serial.textContent = "polling adb…";
    }
  }

  window.pehredar.onDeviceUpdate((d) => {
    app.device.connected = Boolean(d.connected);
    app.device.serial = d.serial || "";
    app.device.model = d.model || "";
    updateDeviceChip();
    if (app.scanController && app.scanController.refreshButtons) app.scanController.refreshButtons();
    if (app.router.current === "dashboard" && window.Views.dashboard && window.Views.dashboard.refresh) {
      window.Views.dashboard.refresh();
    }
  });

  // ---- router ----
  const router = (app.router = {
    current: "dashboard",
    show(name) {
      if (!VIEWS.includes(name)) name = "dashboard";
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      const el = document.getElementById("view-" + name);
      el.classList.add("active");
      this.current = name;
      document.getElementById("page-title").textContent = TITLES[name];
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
      const view = window.Views[name];
      if (view && view.show) view.show();
    },
  });

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => router.show(btn.dataset.view));
  });

  // ---- scan progress plumbing -> current scan controller ----
  window.pehredar.onProgress((msg) => {
    const ctrl = app.scanController;
    if (!ctrl) return;
    if (msg.status === "running") ctrl.markRunning(msg.check);
    else if (msg.status === "done") ctrl.markDone(msg.check, msg.outcome);
    else if (msg.status === "complete") ctrl.onComplete(msg);
  });
  window.pehredar.onScanExit((d) => {
    if (app.scanController) app.scanController.onExit(d);
  });
  window.pehredar.onScanError((d) => {
    if (app.scanController) app.scanController.onError(d);
  });
  window.pehredar.onScanSaved(() => {
    if (app.scanController && app.scanController.onSaved) app.scanController.onSaved();
  });

  // ---- boot ----
  window.addEventListener("load", () => {
    window.wireNavIcons();
    window.Views.detail.bind();
    window.Views.review.bind();
    app.review = window.Views.review;
    window.pehredar.settings.get().then((s) => {
      if (s && s.accent) document.body.setAttribute("data-accent", s.accent);
      if (window.SimpleLabels) window.SimpleLabels.enabled = Boolean(s && s.simple);
    });
    updateDeviceChip();
    router.show("dashboard");
    window.pehredar.startDevicePolling();
    const splash = document.getElementById("splash");
    setTimeout(() => splash.classList.add("fade"), 1500);
    setTimeout(() => splash.remove(), 2100);
  });
})();