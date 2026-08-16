(function () {
  "use strict";

  let graph = null;
  let mounted = false;
  let scanning = false;

  function mount(el) {
    el.innerHTML =
      '<h2 class="view-title">SCAN</h2>' +
      '<div class="scan-layout">' +
      '<div class="card graph-card">' +
      '<div class="card-title scan-head"><span>LIVE CHECK NETWORK</span><span id="scan-status" class="scan-status">idle</span></div>' +
      '<div class="graph-wrap"><canvas id="graph"></canvas></div>' +
      "</div>" +
      '<div class="scan-side">' +
      '<div id="risk-panel" class="card risk-card hidden">' +
      '<div class="risk-label">RISK LEVEL</div>' +
      '<div id="risk-value" class="risk-value">—</div>' +
      '<div id="risk-stats" class="risk-stats"></div>' +
      "</div>" +
      '<div class="scan-actions">' +
      '<button id="start-btn" class="btn btn-primary btn-lg" disabled>' + window.icon("scan", 18) + " New Scan</button>" +
      '<button id="cancel-btn" class="btn btn-danger" disabled>' + window.icon("trash", 16) + " Cancel</button>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div id="scan-results" class="results-panel hidden"></div>';

    graph = window.createPehredarGraph(el.querySelector("#graph"));
    graph.start();

    el.querySelector("#start-btn").addEventListener("click", onStart);
    el.querySelector("#cancel-btn").addEventListener("click", onCancel);

    window.App.scanController = {
      refreshButtons,
      markRunning,
      markDone,
      onComplete,
      onExit,
      onError,
      onSaved,
    };

    mounted = true;
    refreshButtons();
  }

  function el() {
    return document.getElementById("view-scan");
  }

  function refreshButtons() {
    if (!mounted) return;
    const startBtn = el().querySelector("#start-btn");
    const cancelBtn = el().querySelector("#cancel-btn");
    startBtn.disabled = !window.App.device.connected || scanning;
    cancelBtn.disabled = !scanning;
  }

  function markRunning(slug) {
    if (graph) graph.markRunning(slug);
    const status = el().querySelector("#scan-status");
    status.textContent = "running · " + slug;
    status.classList.add("running");
  }

  function markDone(slug, passed) {
    if (graph) graph.markDone(slug, passed);
  }

  function setStatus(text, running) {
    const status = el().querySelector("#scan-status");
    status.textContent = text;
    status.classList.toggle("running", Boolean(running));
  }

  function onStart() {
    resetView();
    scanning = true;
    refreshButtons();
    setStatus("starting…", true);
    window.pehredar.startScan();
  }

  function onCancel() {
    window.pehredar.cancelScan();
    scanning = false;
    refreshButtons();
    setStatus("cancelled", false);
  }

  function resetView() {
    if (graph) graph.reset();
    el().querySelector("#risk-panel").classList.add("hidden");
    el().querySelector("#risk-value").className = "risk-value";
    el().querySelector("#risk-value").textContent = "—";
    el().querySelector("#risk-stats").textContent = "";
    const results = el().querySelector("#scan-results");
    results.classList.add("hidden");
    results.innerHTML = "";
  }

  function onComplete(msg) {
    scanning = false;
    refreshButtons();
    setStatus("complete", false);

    const riskValue = el().querySelector("#risk-value");
    const level = String(msg.risk_level || "Low");
    riskValue.textContent = level.toUpperCase();
    riskValue.className = "risk-value level-" + level.toLowerCase();
    const stats = el().querySelector("#risk-stats");
    stats.textContent =
      "PASS " + (msg.summary ? msg.summary.passed : "?") +
      " · FAIL " + (msg.summary ? msg.summary.failed : "?") +
      " · SCORE " + (msg.risk_score ?? 0);
    el().querySelector("#risk-panel").classList.remove("hidden");

    const rec = {
      device: { serial: window.App.device.serial, model: window.App.device.model },
      timestamp: new Date().toISOString(),
      risk_level: msg.risk_level,
      risk_score: msg.risk_score,
      summary: msg.summary,
      checks: msg.checks || [],
    };
    const results = el().querySelector("#scan-results");
    results.classList.remove("hidden");
    window.Components.renderResults(results, rec);
    window.App.toast("Scan complete");
  }

  function onExit(data) {
    scanning = false;
    refreshButtons();
    if (data.code !== 0) setStatus("failed (" + data.code + ")", false);
  }

  function onError(data) {
    setStatus("error", false);
    if (data.error) window.App.toast("CLI error: " + data.error);
  }

  function onSaved() {
    // history/dashboard refresh on next visit
  }

  function show() {
    if (!mounted) mount(el());
    else refreshButtons();
  }

  window.Views = window.Views || {};
  window.Views.scan = { show };
})();