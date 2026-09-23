(function () {
  "use strict";

  let bound = false;
  let currentHandler = null;
  let state = { packages: [], labels: {}, system: new Set(), selected: new Set(), trusted: new Set() };

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
    state.trusted = new Set();
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
    // Trusted apps (this device, or trusted everywhere) are excluded from
    // removal but stay visible and marked — verdicts are never rewritten.
    if (window.Allowlist) {
      const allowed = await window.Allowlist.list().catch(() => []);
      const ser = window.Allowlist.serial();
      for (const pkg of state.packages) {
        if (allowed.some((e) => e.package === pkg && (!e.serial || !ser || e.serial === ser))) {
          state.trusted.add(pkg);
        }
      }
    }
    renderList();
  }

  function renderList() {
    const body = document.getElementById("review-body");
    const labelFor = (pkg) => state.labels[pkg] || pkg;
    const actionable = state.packages.filter((p) => !state.system.has(p) && !state.trusted.has(p));
    let rows = "";
    for (const pkg of state.packages) {
      const isSys = state.system.has(pkg);
      const isTrusted = state.trusted.has(pkg);
      rows +=
        '<div class="rv-row">' +
        (isSys || isTrusted
          ? '<span class="rv-lock">' + window.icon("settings", 16) + "</span>"
          : '<label class="toggle"><input type="checkbox" data-pkg="' + window.Components.esc(pkg) + '" /><span class="track"><span class="thumb"></span></span></label>') +
        '<div class="rv-info">' +
        '<div class="rv-name">' + window.Components.esc(labelFor(pkg)) + "</div>" +
        '<div class="rv-pkg mono">' + window.Components.esc(pkg) +
        (isSys ? ' <span class="rv-sys">System app — cannot remove</span>' : "") +
        (isTrusted ? ' <span class="rv-trusted">Trusted — excluded</span>' : "") +
        "</div>" +
        "</div>" +
        (!isSys && !isTrusted
          ? '<button class="btn btn-ghost btn-sm rv-trust" data-pkg="' + window.Components.esc(pkg) + '">Trust</button>'
          : "") +
        "</div>";
    }
    body.innerHTML =
      '<p class="set-hint">Select the apps you want to remove. Nothing is removed until you confirm.' +
      (state.trusted.size ? " " + state.trusted.size + " trusted app(s) excluded." : "") +
      "</p>" +
      '<div class="rv-list">' + rows + "</div>" +
      (actionable.length
        ? '<div class="rv-actions">' +
          '<button class="btn btn-danger btn-lg" id="rv-remove" disabled>Remove Selected (0)</button>' +
          "</div>"
        : '<div class="dim">Every flagged app here is trusted or a system app — nothing to remove.</div>');

    body.querySelectorAll('input[data-pkg]').forEach((inp) =>
      inp.addEventListener("change", () => {
        if (inp.checked) state.selected.add(inp.dataset.pkg);
        else state.selected.delete(inp.dataset.pkg);
        updateRemoveBtn();
      })
    );
    body.querySelectorAll(".rv-trust").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!window.Allowlist) return;
        btn.disabled = true;
        await window.Allowlist.allow(btn.dataset.pkg).catch(() => {});
        state.trusted.add(btn.dataset.pkg);
        state.selected.delete(btn.dataset.pkg);
        window.App.toast("Trusted — excluded from future removals on this device");
        renderList();
      })
    );
    const removeBtn = body.querySelector("#rv-remove");
    if (removeBtn) removeBtn.addEventListener("click", onRemove);
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