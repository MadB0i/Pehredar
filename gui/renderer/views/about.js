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
      '<div class="about-desc">On-device Android root & spyware detection agent. Runs 11 live checks over ADB — root binaries, build tampering, accessibility abuse, device admin, hidden apps and more — then scores device risk through a weighted pass/fail engine.</div>' +
      '<div class="about-meta mono">v1.0.0 · Electron + Python</div>' +
      "</div>" +

      // how it works
      '<div class="card">' +
      '<div class="card-title">HOW IT WORKS</div>' +
      '<div class="steps">' +
      step(0, "usb", "1", "Connect via ADB", "Plug in the device with USB debugging enabled. Pehredar polls adb devices and picks the authorized device automatically.") +
      step(1, "scan", "2", "Run 11 automated checks", "A live network graph shows each check as it runs — su binaries, root managers, Magisk traces, hidden apps, accessibility and device-admin spies.") +
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
      link("history", "Changelog", "v1.0.0 — current release", null) +
      "</div>" +
      '<div class="changelog"><strong class="dim">v1.0.0</strong> · Initial release — 11-check engine (7 root, 4 spyware), JSON streaming, scored reports, multi-view Electron desktop app with persistent history and HTML report export.</div>' +
      "</div>" +

      "</div>";

    buildChecks(el);
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