(function () {
  "use strict";

  let mounted = false;

  function mount(el) {
    el.innerHTML =
      '<h2 class="view-title">SETTINGS</h2>' +
      '<div class="card settings-card">' +
      '<div class="card-title">SCAN HISTORY STORAGE</div>' +
      '<div class="setting-row"><span class="slabel">Storage dir</span><span class="svalue mono" id="set-dir">—</span></div>' +
      '<div class="setting-row"><span class="slabel">Records</span><span class="svalue mono" id="set-count">—</span></div>' +
      '<div class="setting-actions">' +
      '<button class="btn btn-ghost" id="set-open">' + window.icon("folder", 15) + " Open Folder</button>" +
      '<button class="btn btn-danger" id="set-clear">' + window.icon("trash", 15) + " Clear History</button>" +
      "</div>" +
      "</div>";

    el.querySelector("#set-open").addEventListener("click", async () => {
      const dir = await window.pehredar.scans.dir();
      if (dir) window.pehredar.openPath(dir);
    });
    el.querySelector("#set-clear").addEventListener("click", async () => {
      if (!confirm("Delete all saved scan records? This cannot be undone.")) return;
      const res = await window.pehredar.scans.clear();
      window.App.toast(res && res.ok ? "History cleared" : "Failed to clear history");
      refresh();
    });
    mounted = true;
  }

  async function refresh() {
    const el = document.getElementById("view-settings");
    if (!mounted) mount(el);
    const dir = await window.pehredar.scans.dir();
    const list = await window.pehredar.scans.list();
    el.querySelector("#set-dir").textContent = dir || "—";
    el.querySelector("#set-count").textContent = String(list.length) + (list.length === 1 ? " record" : " records");
  }

  window.Views = window.Views || {};
  window.Views.settings = { show: refresh };
})();