(function () {
  "use strict";

  let mounted = false;

  function mount(el) {
    el.innerHTML =
      '<div class="history-head">' +
      '<h2 class="view-title">HISTORY</h2>' +
      "</div>" +
      '<div class="history-list" id="history-list">' + skeletonRows() + "</div>";

    el.querySelector("#history-list").addEventListener("click", (e) => {
      const row = e.target.closest(".history-row");
      if (row && row.dataset.id) window.App.detail.open(row.dataset.id);
    });
    mounted = true;
  }

  function skeletonRows() {
    let html = "";
    for (let i = 0; i < 3; i++) {
      html +=
        '<div class="history-skel" aria-hidden="true">' +
        '<span class="skeleton-bar" style="flex:0 0 150px;height:12px"></span>' +
        '<span class="skeleton-bar" style="flex:1;height:12px"></span>' +
        '<span class="skeleton-bar" style="flex:1;height:11px"></span>' +
        '<span class="skeleton-bar" style="flex:0 0 52px;height:20px;border-radius:10px"></span>' +
        '<span class="skeleton-bar" style="flex:0 0 40px;height:12px"></span>' +
        '<span class="skeleton-bar" style="flex:0 0 10px;height:18px"></span>' +
        "</div>";
    }
    return html;
  }

  async function show() {
    const el = document.getElementById("view-history");
    if (!mounted) mount(el);
    const listEl = el.querySelector("#history-list");
    // Shape-matched skeleton while the IPC round-trip resolves — no blank
    // flash, no generic spinner.
    listEl.innerHTML = skeletonRows();
    const list = await window.pehredar.scans.list();
    if (!list.length) {
      listEl.innerHTML = '<div class="empty-state dim">No scans recorded yet. Run a scan to see history here.</div>';
      return;
    }
    let html = "";
    for (const s of list) {
      const device = (s.device && (s.device.model || s.device.serial)) || "Unknown";
      const serial = (s.device && s.device.serial) || "";
      html +=
        '<div class="history-row" data-id="' + window.Components.esc(s.id) + '">' +
        '<span class="h-time mono">' + window.Components.fmtTime(s.timestamp) + "</span>" +
        '<span class="h-device">' + window.Components.esc(device) + "</span>" +
        '<span class="h-serial mono">' + window.Components.esc(serial) + "</span>" +
        window.Components.riskBadge(s.risk_level) +
        '<span class="h-score mono">' + window.Components.esc(s.risk_score ?? "") + "</span>" +
        '<span class="h-chevron">›</span>' +
        "</div>";
    }
    listEl.innerHTML = html;
  }

  window.Views = window.Views || {};
  window.Views.history = { show };
})();