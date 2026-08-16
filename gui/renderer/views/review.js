(function () {
  "use strict";

  let bound = false;
  let currentHandler = null;
  let state = { packages: [], labels: {}, system: new Set(), selected: new Set() };

  function bind() {
    if (bound) return;
    const overlay = document.getElementById("review-overlay");
    document.getElementById("review-backdrop").addEventListener("click", close);
    document.getElementById("review-close").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
    });
    window.pehredar.onUninstallProgress((d) => {
      if (currentHandler) currentHandler(d);
    });
    bound = true;
  }

  function close() {
    document.getElementById("review-overlay").classList.add("hidden");
    currentHandler = null;
  }

  async function open(checkName, packages) {
    bind();
    if (!packages || !packages.length) return;
    state.packages = packages.slice();
    state.selected = new Set();
    state.labels = {};
    state.system = new Set();
    currentHandler = null;

    const overlay = document.getElementById("review-overlay");
    overlay.classList.remove("hidden");
    document.getElementById("review-title").textContent = "REVIEW & REMOVE — " + String(checkName || "").toUpperCase();
    const body = document.getElementById("review-body");
    body.innerHTML = '<div class="dim">Loading package info…</div>';

    const [sys, labels] = await Promise.all([
      window.pehredar.packages.system().catch(() => []),
      window.pehredar.packages.labels(state.packages).catch(() => ({})),
    ]);
    state.system = new Set(sys || []);
    state.labels = labels || {};
    renderList();
  }

  function renderList() {
    const body = document.getElementById("review-body");
    const labelFor = (pkg) => state.labels[pkg] || pkg;
    let rows = "";
    for (const pkg of state.packages) {
      const isSys = state.system.has(pkg);
      rows +=
        '<div class="rv-row">' +
        (isSys
          ? '<span class="rv-lock">' + window.icon("settings", 16) + "</span>"
          : '<label class="toggle"><input type="checkbox" data-pkg="' + window.Components.esc(pkg) + '" /><span class="track"><span class="thumb"></span></span></label>') +
        '<div class="rv-info">' +
        '<div class="rv-name">' + window.Components.esc(labelFor(pkg)) + "</div>" +
        '<div class="rv-pkg mono">' + window.Components.esc(pkg) + (isSys ? ' <span class="rv-sys">System app — cannot remove</span>' : "") + "</div>" +
        "</div>" +
        "</div>";
    }
    body.innerHTML =
      '<p class="set-hint">Select the apps you want to remove. Nothing is removed until you confirm.</p>' +
      '<div class="rv-list">' + rows + "</div>" +
      '<div class="rv-actions">' +
      '<button class="btn btn-danger btn-lg" id="rv-remove" disabled>Remove Selected (0)</button>' +
      "</div>";

    body.querySelectorAll('input[data-pkg]').forEach((inp) =>
      inp.addEventListener("change", () => {
        if (inp.checked) state.selected.add(inp.dataset.pkg);
        else state.selected.delete(inp.dataset.pkg);
        updateRemoveBtn();
      })
    );
    body.querySelector("#rv-remove").addEventListener("click", onRemove);
  }

  function updateRemoveBtn() {
    const btn = document.getElementById("rv-remove");
    btn.disabled = state.selected.size === 0;
    btn.textContent = "Remove Selected (" + state.selected.size + ")";
  }

  async function onRemove() {
    const pkgs = Array.from(state.selected);
    if (!pkgs.length) return;
    const body = document.getElementById("review-body");

    // cleanup-pass visualization (uses the existing status colour language)
    body.innerHTML =
      '<p class="set-hint">Uninstall pass in progress — each app transitions queued → removing → removed / failed.</p>' +
      '<div class="rv-cleanup">' +
      pkgs
        .map(
          (p) =>
            '<div class="cleanup-node" data-pkg="' + window.Components.esc(p) + '">' +
            '<span class="cleanup-dot state-queued"></span>' +
            '<span class="cleanup-label mono">' + window.Components.esc(state.labels[p] || p) + "</span>" +
            "</div>"
        )
        .join("") +
      "</div>";

    currentHandler = (d) => {
      const node = body.querySelector('.cleanup-node[data-pkg="' + window.Components.esc(d.pkg) + '"]');
      if (!node) return;
      const dot = node.querySelector(".cleanup-dot");
      const label = node.querySelector(".cleanup-label");
      const name = state.labels[d.pkg] || d.pkg;
      if (d.state === "removing") {
        dot.className = "cleanup-dot state-removing";
        label.textContent = name + " — removing…";
      } else if (d.state === "removed") {
        dot.className = "cleanup-dot state-removed";
        label.textContent = name + " — removed";
      } else if (d.state === "failed") {
        dot.className = "cleanup-dot state-failed";
        label.textContent = name + " — " + (d.reason || "failed");
      }
    };

    const res = await window.pehredar.packages.uninstall(pkgs);
    currentHandler = null;

    if (res && res.canceled) {
      body.innerHTML =
        '<p class="dim">Uninstall canceled — no apps were removed.</p>' +
        '<div class="rv-actions"><button class="btn btn-ghost" id="rv-back">Back to list</button></div>';
      body.querySelector("#rv-back").addEventListener("click", renderList);
      return;
    }
    if (res && res.error) {
      body.innerHTML = '<div class="rv-fail mono">ERROR: ' + window.Components.esc(res.error) + "</div>";
      return;
    }

    const failures = (res.results || []).filter((r) => !r.ok);
    body.innerHTML =
      '<div class="rv-summary">' +
      '<div class="rv-sum-title">CLEANUP PASS COMPLETE</div>' +
      '<div class="rv-sum-stats">' +
      '<span class="sum-removed">' + (res.removed || 0) + " removed</span>" +
      '<span class="sum-failed">' + (res.failed || 0) + " failed</span>" +
      "</div>" +
      (failures.length
        ? failures
            .map((r) => '<div class="rv-fail mono">' + window.Components.esc(r.pkg) + " — " + window.Components.esc(r.reason || "unknown") + "</div>")
            .join("")
        : "") +
      "</div>";
  }

  window.Views = window.Views || {};
  window.Views.review = { bind, open, close };
})();