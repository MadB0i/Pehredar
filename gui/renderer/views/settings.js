(function () {
  "use strict";

  let mounted = false;
  let settings = null;

  function mount(el) {
    el.innerHTML =
      '<h2 class="view-title">SETTINGS</h2>' +
      '<div class="settings-grid">' +

      // ---- Checks ----
      '<div class="card" id="set-checks-card">' +
      '<div class="card-title">CHECKS</div>' +
      '<p class="set-hint">Enable or disable whole categories or individual checks before a scan. Disabled checks are passed to the CLI as --skip-check.</p>' +
      '<div class="setting-sub">Categories</div>' +
      '<div id="set-categories"></div>' +
      '<div class="setting-sub">Individual Checks</div>' +
      '<div id="set-checks"></div>' +
      "</div>" +

      // ---- ADB ----
      '<div class="card">' +
      '<div class="card-title">ADB CONFIGURATION</div>' +
      '<div class="setting-sub">Detected Path</div>' +
      '<div class="adb-detect-row">' +
      '<span class="adb-path-display" id="adb-detected">detecting…</span>' +
      '<span class="adb-detect-status" id="adb-detect-status"></span>' +
      "</div>" +
      '<div class="setting-sub">Manual Override</div>' +
      '<div class="adb-override-row">' +
      '<input type="text" id="adb-override" placeholder="C:\\path\\to\\adb.exe" />' +
      '<button class="btn btn-ghost" id="adb-browse">' + window.icon("folder", 15) + " Browse</button>" +
      '<button class="btn btn-primary" id="adb-save">' + window.icon("refresh", 15) + " Save</button>" +
      "</div>" +
      '<div class="setting-row"><span class="slabel">Test Connection</span>' +
      '<button class="btn btn-ghost" id="adb-test">' + window.icon("settings", 15) + " Run adb devices</button></div>" +
      '<div class="adb-test-box" id="adb-test-box"></div>' +
      "</div>" +

      // ---- Appearance ----
      '<div class="card">' +
      '<div class="card-title">APPEARANCE</div>' +
      '<div class="setting-sub">Accent Color</div>' +
      '<div class="accent-row" id="set-accents">' +
      '<button class="swatch" data-accent="cyan"><span class="dot"></span>CYAN</button>' +
      '<button class="swatch" data-accent="purple"><span class="dot"></span>PURPLE</button>' +
      '<button class="swatch" data-accent="green"><span class="dot"></span>GREEN</button>' +
      "</div>" +
      '<div class="setting-sub">Language</div>' +
      '<div class="toggle-row">' +
      '<span class="lbl">Simple Mode<span class="sub">Plain-language check names and explanations (reports stay technical)</span></span>' +
      '<label class="toggle"><input type="checkbox" id="set-simple" />' +
      '<span class="track"><span class="thumb"></span></span></label>' +
      "</div>" +
      "</div>" +

      // ---- Storage ----
      '<div class="card">' +
      '<div class="card-title">SCAN HISTORY STORAGE</div>' +
      '<div class="setting-row"><span class="slabel">Storage dir</span><span class="svalue mono" id="set-dir">—</span></div>' +
      '<div class="setting-row"><span class="slabel">Records</span><span class="svalue mono" id="set-count">—</span></div>' +
      '<div class="setting-actions">' +
      '<button class="btn btn-ghost" id="set-open">' + window.icon("folder", 15) + " Open Folder</button>" +
      '<button class="btn btn-danger" id="set-clear">' + window.icon("trash", 15) + " Clear History</button>" +
      "</div>" +
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
      refreshStorage();
    });
    el.querySelector("#adb-browse").addEventListener("click", onBrowse);
    el.querySelector("#adb-save").addEventListener("click", onAdbSave);
    el.querySelector("#adb-test").addEventListener("click", onAdbTest);

    const accents = el.querySelectorAll(".swatch");
    accents.forEach((sw) => sw.addEventListener("click", () => setAccent(sw.dataset.accent)));
    el.querySelector("#set-simple").addEventListener("change", (e) => setSimple(e.target.checked));

    mounted = true;
  }

  function setAccent(name) {
    document.body.setAttribute("data-accent", name);
    const el = document.getElementById("view-settings");
    el.querySelectorAll(".swatch").forEach((sw) => sw.classList.toggle("active", sw.dataset.accent === name));
    window.pehredar.settings.set({ accent: name });
    window.App.toast("Accent set to " + name.toUpperCase());
  }

  function setSimple(on) {
    if (window.SimpleLabels) window.SimpleLabels.enabled = on;
    window.pehredar.settings.set({ simple: on });
    window.App.toast(on ? "Simple Mode on — plain-language results" : "Simple Mode off — technical results");
  }

  function renderChecks() {
    const el = document.getElementById("view-settings");
    const groups = window.Components.checksByCategory();

    let catHtml = "";
    for (const key of ["root", "spyware"]) {
      const label = key === "root" ? "Root / Jailbreak checks" : "Spyware checks";
      const count = (groups[key] || []).length;
      const on = settings.checks.categories[key] !== false;
      catHtml +=
        '<div class="toggle-row">' +
        '<span class="lbl">' + label + '<span class="sub">' + count + " checks</span></span>" +
        '<label class="toggle"><input type="checkbox" data-cat="' + key + '" ' + (on ? "checked" : "") + "/>" +
        '<span class="track"><span class="thumb"></span></span></label>' +
        "</div>";
    }
    el.querySelector("#set-categories").innerHTML = catHtml;
    el.querySelectorAll("#set-categories input").forEach((inp) =>
      inp.addEventListener("change", () => onCategoryToggle(inp.dataset.cat, inp.checked))
    );

    let checksHtml = "";
    for (const key of ["root", "spyware"]) {
      for (const c of groups[key] || []) {
        const on = settings.checks.enabled[c.slug] !== false;
        checksHtml +=
          '<div class="toggle-row indent">' +
          '<span class="lbl">' + window.Components.esc(c.name) + "</span>" +
          '<label class="toggle"><input type="checkbox" data-slug="' + c.slug + '" ' + (on ? "checked" : "") + "/>" +
          '<span class="track"><span class="thumb"></span></span></label>' +
          "</div>";
      }
    }
    el.querySelector("#set-checks").innerHTML = checksHtml;
    el.querySelectorAll("#set-checks input").forEach((inp) =>
      inp.addEventListener("change", () => onCheckToggle(inp.dataset.slug, inp.checked))
    );
  }

  function onCategoryToggle(cat, on) {
    settings.checks.categories[cat] = on;
    window.pehredar.settings.set({ checks: { categories: { [cat]: on } } });
    window.App.toast(on ? cat.toUpperCase() + " checks enabled" : cat.toUpperCase() + " checks disabled");
  }

  function onCheckToggle(slug, on) {
    settings.checks.enabled[slug] = on;
    window.pehredar.settings.set({ checks: { enabled: { [slug]: on } } });
  }

  async function onBrowse() {
    const el = document.getElementById("view-settings");
    const picked = await window.pehredar.dialog.file();
    if (picked) {
      el.querySelector("#adb-override").value = picked;
      onAdbSave(picked);
    }
  }

  async function onAdbSave(forceValue) {
    const el = document.getElementById("view-settings");
    const value = (forceValue !== undefined ? forceValue : el.querySelector("#adb-override").value).trim();
    settings.adbPath = value;
    await window.pehredar.settings.set({ adbPath: value });
    const active = value ? value : "adb";
    el.querySelector("#adb-detected").textContent = active;
    el.querySelector("#adb-detect-status").textContent = "";
    el.querySelector("#adb-detect-status").className = "adb-detect-status";
    window.App.toast(value ? "ADB override saved" : "ADB override cleared");
    await detectAdb();
  }

  async function detectAdb() {
    const el = document.getElementById("view-settings");
    const status = el.querySelector("#adb-detect-status");
    const display = el.querySelector("#adb-detected");
    const override = settings.adbPath && settings.adbPath.trim();
    if (override) {
      display.textContent = settings.adbPath.trim();
      status.textContent = "(override)";
      status.className = "adb-detect-status";
      return;
    }
    display.textContent = "detecting…";
    status.textContent = "";
    const res = await window.pehredar.adb.detect();
    if (res.found) {
      display.textContent = res.path;
      status.textContent = "found on PATH";
      status.className = "adb-detect-status ok";
    } else {
      display.textContent = "adb not found";
      status.textContent = "install Android Platform Tools";
      status.className = "adb-detect-status";
    }
  }

  async function onAdbTest() {
    const el = document.getElementById("view-settings");
    const box = el.querySelector("#adb-test-box");
    const input = el.querySelector("#adb-override");
    const btn = el.querySelector("#adb-test");
    const candidate = input.value.trim() || settings.adbPath || "adb";
    box.classList.add("show");
    box.textContent = "> " + candidate + " devices\nrunning…";
    btn.disabled = true;
    const res = await window.pehredar.adb.test(candidate);
    btn.disabled = false;
    if (res.ok) {
      const device = res.hasDevice ? "device detected" : "no device attached";
      box.innerHTML = "<div class='ok-line'>> " + window.Components.esc(candidate) + " devices — " + device + "</div>\n" + window.Components.esc(res.stdout);
    } else {
      box.innerHTML = "<div class='err-line'>ERROR: " + window.Components.esc(res.error || "unknown") + "</div>";
    }
  }

  async function refreshStorage() {
    const el = document.getElementById("view-settings");
    const dir = await window.pehredar.scans.dir();
    const list = await window.pehredar.scans.list();
    el.querySelector("#set-dir").textContent = dir || "—";
    el.querySelector("#set-count").textContent = String(list.length) + (list.length === 1 ? " record" : " records");
  }

  async function refresh() {
    const el = document.getElementById("view-settings");
    if (!mounted) mount(el);
    settings = await window.pehredar.settings.get();
    renderChecks();
    setAccentUI();
    el.querySelector("#set-simple").checked = Boolean(settings.simple);
    el.querySelector("#adb-override").value = settings.adbPath || "";
    await detectAdb();
    await refreshStorage();
  }

  function setAccentUI() {
    const el = document.getElementById("view-settings");
    const active = settings.accent || "cyan";
    el.querySelectorAll(".swatch").forEach((sw) => sw.classList.toggle("active", sw.dataset.accent === active));
  }

  window.Views = window.Views || {};
  window.Views.settings = { show: refresh };
})();