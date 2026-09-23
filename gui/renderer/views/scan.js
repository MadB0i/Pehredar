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
      '<div class="card checklist-card">' +
      '<div class="card-title">CHECK PROGRESS</div>' +
      '<div id="scan-checklist" class="checklist"></div>' +
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

    buildChecklist(new Set());
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

  function checkLabel(slug) {
    if (window.SimpleLabels && window.SimpleLabels.enabled && window.SimpleLabels.simpleName(slug)) {
      return window.SimpleLabels.simpleName(slug);
    }
    const found = (window.CHECK_CATALOG || []).find((c) => c.slug === slug);
    return found ? found.name : slug;
  }

  // Live checklist. Rows are created in catalog order at scan start and
  // flip pending → running → pass/fail/inconclusive purely from backend
  // scan-progress events — no timers, so the UI can never desync from a
  // check that runs slower or faster than expected.
  function buildChecklist(skipped) {
    const box = el().querySelector("#scan-checklist");
    if (!box) return;
    // Snapshot live states first: if a backend event somehow lands before
    // this rebuild, re-apply it so the row can never desync backwards.
    const live = {};
    box.querySelectorAll(".cl-row").forEach((row) => {
      const state = row.getAttribute("data-state");
      if (state && state !== "pending" && state !== "skipped") live[row.getAttribute("data-slug")] = state;
    });
    box.innerHTML = (window.CHECK_CATALOG || [])
      .map((c) => {
        const state = live[c.slug] || (skipped.has(c.slug) ? "skipped" : "pending");
        return (
          '<div class="cl-row" data-slug="' + c.slug + '" data-state="' + state + '">' +
          '<span class="cl-glyph"></span>' +
          '<span class="cl-name">' + window.Components.esc(checkLabel(c.slug)) + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function setRowState(slug, state) {
    const row = el().querySelector('#scan-checklist .cl-row[data-slug="' + slug + '"]');
    if (row) row.setAttribute("data-state", state);
  }

  // Mirrors main.js skippedChecks(): a category toggle or per-check toggle
  // means the backend never emits events for that slug, so the row would
  // sit on "pending" forever. Marking it skipped up front keeps the
  // checklist truthful.
  function skippedSlugs(settings) {
    const skipped = new Set();
    const checks = (settings && settings.checks) || {};
    const categories = checks.categories || {};
    const enabled = checks.enabled || {};
    for (const c of window.CHECK_CATALOG || []) {
      if (categories[c.category] === false || enabled[c.slug] === false) skipped.add(c.slug);
    }
    return skipped;
  }

  function markRunning(slug) {
    if (graph) graph.markRunning(slug);
    setRowState(slug, "running");
    const status = el().querySelector("#scan-status");
    status.textContent = "running · " + checkLabel(slug);
    status.classList.add("running");
  }

  function markDone(slug, outcome) {
    if (graph) graph.markDone(slug, outcome);
    setRowState(slug, outcome === "pass" ? "pass" : outcome === "inconclusive" ? "inconclusive" : "fail");
  }

  function setStatus(text, running) {
    const status = el().querySelector("#scan-status");
    status.textContent = text;
    status.classList.toggle("running", Boolean(running));
  }

  function onStart() {
    if (scanning) return;
    resetView();
    scanning = true;
    refreshButtons();
    setStatus("starting…", true);
    // Resolve skipped checks so their rows never fake "pending". The local
    // settings IPC resolves long before the first backend event arrives.
    window.pehredar.settings
      .get()
      .catch(() => null)
      .then((s) => {
        buildChecklist(skippedSlugs(s));
        window.pehredar.startScan();
      });
  }

  function onCancel() {
    window.pehredar.cancelScan();
    scanning = false;
    refreshButtons();
    setStatus("cancelled", false);
    // A cancelled run leaves no more events coming: rows still marked
    // running would lie, so settle them back to pending. Finished rows
    // keep their real outcomes.
    el()
      .querySelectorAll('#scan-checklist .cl-row[data-state="running"]')
      .forEach((row) => row.setAttribute("data-state", "pending"));
  }

  function resetView() {
    if (graph) graph.reset();
    buildChecklist(new Set());
    const panel = el().querySelector("#risk-panel");
    panel.classList.add("hidden");
    panel.classList.remove("revealing");
    const riskValue = el().querySelector("#risk-value");
    riskValue.className = "risk-value";
    riskValue.textContent = "—";
    el().querySelector("#risk-stats").textContent = "";
    const results = el().querySelector("#scan-results");
    results.classList.add("hidden");
    results.innerHTML = "";
  }

  // Score/result numbers count up over ~350ms so the reveal reads as one
  // moment, not a spreadsheet flash. Under prefers-reduced-motion the
  // final values are set instantly — same information, no motion.
  function countUp(els, targets) {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      els.forEach((node, i) => {
        if (node) node.textContent = String(targets[i]);
      });
      return;
    }
    const duration = 350;
    let start = null;
    function frame(now) {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      els.forEach((node, i) => {
        if (node) node.textContent = String(Math.round(targets[i] * t));
      });
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function onComplete(msg) {
    scanning = false;
    refreshButtons();
    setStatus("complete", false);

    const panel = el().querySelector("#risk-panel");
    const riskValue = el().querySelector("#risk-value");
    const level = String(msg.risk_level || "Low");
    riskValue.textContent = level.toUpperCase();
    riskValue.className = "risk-value level-" + level.toLowerCase();
    const stats = el().querySelector("#risk-stats");
    const passed = msg.summary ? msg.summary.passed || 0 : 0;
    const failed = msg.summary ? msg.summary.failed || 0 : 0;
    const inconclusive = msg.summary ? msg.summary.inconclusive || 0 : 0;
    const score = msg.risk_score || 0;
    stats.innerHTML =
      'PASS <span id="rs-pass">0</span> · FAIL <span id="rs-fail">0</span> · ' +
      'INCONCLUSIVE <span id="rs-inc">0</span> · SCORE <span id="rs-score">0</span>';
    panel.classList.remove("hidden");
    // Restart entrance animations even on repeat scans.
    void panel.offsetWidth;
    panel.classList.add("revealing");
    riskValue.classList.add("pop");
    if (level.toLowerCase() === "high") riskValue.classList.add("pulse-calm");
    countUp(
      [stats.querySelector("#rs-pass"), stats.querySelector("#rs-fail"), stats.querySelector("#rs-inc"), stats.querySelector("#rs-score")],
      [passed, failed, inconclusive, score]
    );

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