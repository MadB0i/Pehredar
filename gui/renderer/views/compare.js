(function () {
  "use strict";

  // Scan-compare: "what changed since my last scan?" answered in the GUI.
  // This is a renderer-side port of pehredar/diff.py (same field names,
  // same semantics) because the frozen pehredar-core binary only ships
  // the scan CLI — no backend change needed, works packaged and in dev.
  // Handles both record shapes: GUI history records ({check, outcome})
  // and raw CLI reports ({name, outcome}).

  function esc(s) {
    return window.Components.esc(s);
  }

  function checkName(entry) {
    return String(entry.check || entry.name || "unknown");
  }

  function checkOutcome(entry) {
    if (entry.outcome) return String(entry.outcome);
    return entry.passed ? "pass" : "fail";
  }

  function checkPackages(entry) {
    const pkgs = entry.packages || [];
    return pkgs.map((p) => String(p));
  }

  function diffReports(oldRec, newRec) {
    const oldIdx = {};
    const newIdx = {};
    (oldRec.checks || []).forEach((c) => {
      oldIdx[checkName(c)] = c;
    });
    (newRec.checks || []).forEach((c) => {
      newIdx[checkName(c)] = c;
    });

    const oldSum = oldRec.summary || {};
    const newSum = newRec.summary || {};
    const oldLevel = String(oldSum.risk_level || oldRec.risk_level || "Low");
    const newLevel = String(newSum.risk_level || newRec.risk_level || "Low");
    const oldScore = Number(oldSum.risk_score ?? oldRec.risk_score ?? 0);
    const newScore = Number(newSum.risk_score ?? newRec.risk_score ?? 0);

    const names = Array.from(new Set([...Object.keys(oldIdx), ...Object.keys(newIdx)])).sort();
    const checkChanges = [];
    const newFailures = [];
    const resolved = [];
    const stillFailing = [];
    names.forEach((name) => {
      const o = oldIdx[name];
      const n = newIdx[name];
      const oOut = o ? checkOutcome(o) : "missing";
      const nOut = n ? checkOutcome(n) : "missing";
      if (oOut !== nOut) {
        checkChanges.push({
          name,
          old_outcome: oOut,
          new_outcome: nOut,
          old_severity: String((o && o.severity) || ""),
          new_severity: String((n && n.severity) || ""),
        });
      }
      if (nOut === "fail" && oOut !== "fail") newFailures.push(name);
      else if (oOut === "fail" && nOut !== "fail") resolved.push(name);
      else if (nOut === "fail" && oOut === "fail") stillFailing.push(name);
    });

    const oldPkgs = new Set();
    const newPkgs = new Set();
    Object.values(oldIdx).forEach((c) => checkPackages(c).forEach((p) => oldPkgs.add(p)));
    Object.values(newIdx).forEach((c) => checkPackages(c).forEach((p) => newPkgs.add(p)));
    const newPackages = [...newPkgs].filter((p) => !oldPkgs.has(p)).sort();
    const removedPackages = [...oldPkgs].filter((p) => !newPkgs.has(p)).sort();

    const oldSerial = String(oldRec.device_serial || (oldRec.device && oldRec.device.serial) || "");
    const newSerial = String(newRec.device_serial || (newRec.device && newRec.device.serial) || "");
    const riskChanged = oldLevel !== newLevel || oldScore !== newScore;

    return {
      old_timestamp: oldRec.timestamp || "",
      new_timestamp: newRec.timestamp || "",
      old_serial: oldSerial,
      new_serial: newSerial,
      same_device: !oldSerial || !newSerial || oldSerial === newSerial,
      risk_level_old: oldLevel,
      risk_level_new: newLevel,
      risk_score_old: oldScore,
      risk_score_new: newScore,
      risk_score_delta: newScore - oldScore,
      risk_changed: riskChanged,
      new_failures: newFailures.sort(),
      resolved: resolved.sort(),
      still_failing: stillFailing.sort(),
      new_packages: newPackages,
      removed_packages: removedPackages,
      check_changes: checkChanges,
      has_changes: Boolean(checkChanges.length || newPackages.length || removedPackages.length || riskChanged),
    };
  }

  function section(title, items, cls) {
    if (!items.length) return "";
    return (
      '<div class="cmp-section"><div class="cmp-title">' + esc(title) + "</div>" +
      items.map((t) => '<div class="cmp-row ' + (cls || "") + '">' + esc(t) + "</div>").join("") +
      "</div>"
    );
  }

  function renderDiff(container, diff, oldRec, newRec) {
    let html = '<div class="cmp-head">';
    html += '<div class="cmp-versus mono">' +
      esc(window.Components.fmtTime(oldRec.timestamp)) + " → " + esc(window.Components.fmtTime(newRec.timestamp)) +
      "</div>";
    html += '<div class="cmp-risk">' + window.Components.riskBadge(diff.risk_level_old) +
      '<span class="cmp-arrow">→</span>' + window.Components.riskBadge(diff.risk_level_new) +
      '<span class="res-score mono">score ' + esc(diff.risk_score_old) + " → " + esc(diff.risk_score_new) + "</span></div>";
    html += "</div>";

    if (!diff.same_device) {
      html += '<div class="cmp-warn">Warning: different devices (' +
        esc(diff.old_serial) + " → " + esc(diff.new_serial) + ").</div>";
    }
    if (!diff.has_changes) {
      html += '<div class="empty-state dim">No changes since last scan. Nothing new to review.</div>';
      container.innerHTML = html;
      return;
    }
    html += section("New flagged apps since last scan", diff.new_packages, "bad");
    html += section("No longer flagged", diff.removed_packages, "ok");
    html += section("Newly failing checks", diff.new_failures, "bad");
    html += section("Fixed since last scan", diff.resolved, "ok");
    html += section("Still failing", diff.still_failing, "");
    const other = diff.check_changes
      .filter((c) => diff.new_failures.indexOf(c.name) === -1 && diff.resolved.indexOf(c.name) === -1)
      .map((c) => c.name + ": " + c.old_outcome + " → " + c.new_outcome);
    html += section("Other changes", other, "");
    container.innerHTML = html;
  }

  async function openCompare(currentId) {
    if (!currentId) return;
    const list = await window.pehredar.scans.list();
    const idx = list.findIndex((s) => s.id === currentId);
    if (idx === -1 || idx + 1 >= list.length) {
      window.App.toast("No earlier scan to compare with");
      return;
    }
    const content = document.getElementById("detail-content");
    content.innerHTML = '<div class="dim">Comparing…</div>';
    const [newRec, oldRec] = await Promise.all([
      window.pehredar.scans.get(currentId),
      window.pehredar.scans.get(list[idx + 1].id),
    ]);
    if (!newRec || !oldRec) {
      content.innerHTML = '<div class="dim">Scan record not found.</div>';
      return;
    }
    const diff = diffReports(oldRec, newRec);
    renderDiff(content, diff, oldRec, newRec);
    const back = document.createElement("button");
    back.className = "btn btn-ghost btn-sm";
    back.textContent = "← Back to scan";
    back.addEventListener("click", () => window.Views.detail.open(currentId));
    content.prepend(back);
  }

  window.Views = window.Views || {};
  window.Views.compare = { diffReports, renderDiff, openCompare };
})();
