(function () {
  "use strict";

  let mounted = false;

  function mount(el) {
    el.innerHTML =
      '<div class="card about-card">' +
      '<div class="about-mark">' + window.brandIcon(72) + "</div>" +
      '<div class="about-name">PEHREDAR</div>' +
      '<div class="about-desc">On-device Android root & spyware detection agent. Runs 11 live checks over ADB — root binaries, build tampering, accessibility abuse, device admin, hidden apps and more — then scores device risk through a weighted pass/fail engine.</div>' +
      '<div class="about-meta mono">v1.0.0 · Electron + Python</div>' +
      "</div>";
    mounted = true;
  }

  window.Views = window.Views || {};
  window.Views.about = {
    show() {
      const el = document.getElementById("view-about");
      if (!mounted) mount(el);
    },
  };
})();