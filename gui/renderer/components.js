(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function riskBadge(level) {
    const lvl = String(level || "Low").toUpperCase();
    return '<span class="badge badge-' + lvl.toLowerCase() + '">' + lvl + "</span>";
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function renderResults(container, rec) {
    const checks = rec.checks || [];
    const summary = rec.summary || {};
    const device = rec.device || {};
    const model = device.model || device.serial || "Unknown";

    let html = "";
    html += '<div class="res-header">';
    html += "<div>";
    html += '<div class="res-title">Device: <span class="mono">' + esc(model) + "</span></div>";
    html += '<div class="res-sub mono">' + esc(device.serial || "") + " · " + esc(fmtTime(rec.timestamp)) + "</div>";
    html += "</div>";
    html += '<div class="res-risk">' + riskBadge(rec.risk_level) + '<span class="res-score mono">' + esc(String(rec.risk_score ?? "")) + "</span></div>";
    html += "</div>";
    html +=
      '<div class="res-stats mono">' +
      (summary.passed ?? 0) +
      " PASS · " +
      (summary.failed ?? 0) +
      " FAIL · " +
      (summary.high_severity ?? 0) +
      " HIGH</div>";
    html += '<div class="res-list">';
    for (const c of checks) {
      html += '<div class="res-row ' + (c.passed ? "pass" : "fail") + '">';
      html += '<span class="res-status">' + (c.passed ? "PASS" : "FAIL") + "</span>";
      html += '<span class="res-name">' + esc(c.check || c.name || "") + "</span>";
      html += '<span class="res-sev sev-' + esc(String(c.severity || "info").toLowerCase()) + '">' + esc(String(c.severity || "info").toUpperCase()) + "</span>";
      html += '<span class="res-evidence mono">' + esc(c.evidence || "") + "</span>";
      html += "</div>";
    }
    html += "</div>";

    container.innerHTML = html;
  }

  window.Components = { esc, riskBadge, fmtTime, renderResults };
})();