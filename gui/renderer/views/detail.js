(function () {
  "use strict";

  let currentId = null;
  let bound = false;

  function bind() {
    if (bound) return;
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-backdrop").addEventListener("click", close);
    document.getElementById("detail-close").addEventListener("click", close);
    document.getElementById("detail-export").addEventListener("click", exportCurrent);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
    });
    bound = true;
  }

  async function open(id) {
    currentId = id;
    const overlay = document.getElementById("detail-overlay");
    overlay.classList.remove("hidden");
    const content = document.getElementById("detail-content");
    content.innerHTML = '<div class="dim">Loading…</div>';
    const rec = await window.pehredar.scans.get(id);
    if (!rec) {
      content.innerHTML = '<div class="dim">Scan record not found.</div>';
      return;
    }
    window.Components.renderResults(content, rec);
  }

  function close() {
    document.getElementById("detail-overlay").classList.add("hidden");
    currentId = null;
  }

  async function exportCurrent() {
    if (!currentId) return;
    const res = await window.pehredar.scans.export(currentId);
    if (res && res.ok) window.App.toast("Report exported and opened");
    else window.App.toast("Export failed: " + (res ? res.error : "unknown"));
  }

  window.Views = window.Views || {};
  window.Views.detail = { bind, open, close, exportCurrent };
})();