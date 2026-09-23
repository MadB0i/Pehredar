(function () {
  "use strict";

  let mounted = false;

  function mount(el) {
    el.innerHTML =
      '<div class="about-wrap">' +

      // branded header (kept as-is)
      '<div class="card about-card">' +
      '<div class="about-mark">' + window.brandIcon(72) + "</div>" +
      '<div class="about-name">PEHREDAR</div>' +
      '<div class="about-desc">On-device Android root & spyware detection agent. Runs 12 live checks over ADB — root binaries, build tampering, accessibility abuse, device admin, hidden apps and more — then scores device risk through a weighted pass/fail engine.</div>' +
      '<div class="about-meta mono">v1.1.0 · Electron + Python</div>' +
      "</div>" +

      // updates
      '<div class="card">' +
      '<div class="card-title">UPDATES</div>' +
      '<div class="setting-row"><span class="slabel" id="about-update-status">Not checked yet</span>' +
      '<button class="btn btn-ghost" id="about-update-check">Check for updates</button></div>' +
      "</div>" +

      // how it works
      '<div class="card">' +
      '<div class="card-title">HOW IT WORKS</div>' +
      '<div class="steps">' +
      step(0, "usb", "1", "Connect via ADB", "Plug in the device with USB debugging enabled. Pehredar polls adb devices and picks the authorized device automatically.") +
      step(1, "scan", "2", "Run 12 automated checks", "A live network graph shows each check as it runs — su binaries, root managers, Magisk traces, hidden apps, accessibility and device-admin spies.") +
      step(2, "dashboard", "3", "Get a scored report", "Results are scored into a Low / Medium / High risk verdict with per-check evidence, saved to history, and exportable as a printable HTML report.") +
      "</div>" +
      "</div>" +

      // checks reference
      '<div class="card">' +
      '<div class="card-title">CHECKS REFERENCE</div>' +
      '<div id="about-checks"></div>' +
      "</div>" +

      // links
      '<div class="card">' +
      '<div class="card-title">LINKS</div>' +
      '<div class="about-links">' +
      link("github", "GitHub Repository", "github.com/MadB0i/Pehredar", "https://github.com/MadB0i/Pehredar") +
      link("about", "Report an Issue", "open a GitHub issue", "https://github.com/MadB0i/Pehredar/issues") +
      link("history", "Changelog", "v1.1.0 — current release", null) +
      "</div>" +
      '<div class="changelog"><strong class="dim">v1.0.0</strong> · Initial release — 11-check engine (7 root, 4 spyware), JSON streaming, scored reports, multi-view Electron desktop app with persistent history and HTML report export.</div>' +
      "</div>" +

      "</div>";

    buildChecks(el);
    el.querySelector("#about-update-check").addEventListener("click", onUpdateCheck);
    if (window.pehredar.updater && window.pehredar.updater.onStatus) {
      window.pehredar.updater.onStatus(onUpdaterStatus);
    }
    el.querySelectorAll(".about-links a").forEach((a) => {
      if (a.getAttribute("href")) a.setAttribute("target", "_blank");
    });
    mounted = true;
  }

  function step(i, iconName, num, title, desc) {
    return (
      '<div class="card step-card">' +
      '<span class="step-num">' + num + "</span>" +
      '<span class="step-icon">' + window.icon(iconName, 26) + "</span>" +
      '<div class="step-title">' + title + "</div>" +
      '<div class="step-desc">' + desc + "</div>" +
      "</div>"
    );
  }

  function link(iconName, label, hint, href) {
    const attrs = href ? ' href="' + href + '"' : "";
    return (
      '<a' + attrs + ">" +
      '<span class="lk-ico">' + window.icon(iconName, 18) + "</span>" +
      '<span class="lk-label">' + label + "</span>" +
      '<span class="lk-hint">' + hint + "</span>" +
      "</a>"
    );
  }

  async function onUpdateCheck() {
    const el = document.getElementById("view-about");
    const status = el.querySelector("#about-update-status");
    const btn = el.querySelector("#about-update-check");
    btn.disabled = true;
    status.textContent = "Checking…";
    try {
      const res = await window.pehredar.updater.check();
      if (!res || res.state === "unavailable") {
        status.textContent = "Update check unavailable in dev mode";
      } else if (res.state === "downloaded") {
        status.textContent = "Update v" + (res.version || "") + " downloaded — restart to install";
      } else if (res.state === "available") {
        status.textContent = "Update v" + (res.version || "") + " found — downloading…";
      } else if (res.state === "up-to-date") {
        status.textContent = "You're on the latest version";
      } else {
        status.textContent = "Check failed: " + (res.error || "unknown");
      }
    } catch (e) {
      status.textContent = "Check failed";
    }
    btn.disabled = false;
  }

  function onUpdaterStatus(d) {
    if (!d || d.state !== "downloaded") return;
    const el = document.getElementById("view-about");
    const status = el && el.querySelector("#about-update-status");
    if (status) status.textContent = "Update v" + (d.version || "") + " downloaded — restart to install";
    window.App.toast("Update downloaded — restart to install");
  }

  function buildChecks(el) {
    let html = "";
    for (const c of window.CHECK_CATALOG) {
      const cat = c.category === "root" ? "root" : "spyware";
      html +=
        "<details class='check-ref'>" +
        "<summary>" +
        "<span class='cat-tag'>" + cat + "</span>" +
        window.Components.esc(c.name) +
        "<span class='chev'>›</span>" +
        "</summary>" +
        '<div class="ref-body">' + window.Components.esc(c.long) + "</div>" +
        "</details>";
    }
    el.querySelector("#about-checks").innerHTML = html;
  }

  window.Views = window.Views || {};
  window.Views.about = {
    show() {
      const el = document.getElementById("view-about");
      if (!mounted) mount(el);
    },
  };
})();