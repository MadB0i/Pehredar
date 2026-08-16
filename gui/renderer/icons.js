(function () {
  "use strict";

  const PATHS = {
    dashboard:
      '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="5"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    settings:
      '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    about: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    export: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  };

  window.icon = function (name, size) {
    size = size || 20;
    return (
      '<svg class="icon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (PATHS[name] || "") +
      "</svg>"
    );
  };

  // shield + eye brand mark (fills currentColor for the shield, accents for the eye)
  window.brandIcon = function (size) {
    size = size || 28;
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none">' +
      '<path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" fill="currentColor"/>' +
      '<ellipse cx="12" cy="12" rx="3.6" ry="2.2" fill="#0a0e14"/>' +
      '<circle cx="12" cy="12" r="1.2" fill="currentColor"/>' +
      "</svg>"
    );
  };

  function wireNavIcons() {
    document.getElementById("brand-icon").innerHTML = window.brandIcon(26);
    document.getElementById("nav-ico-dashboard").innerHTML = window.icon("dashboard", 19);
    document.getElementById("nav-ico-scan").innerHTML = window.icon("scan", 19);
    document.getElementById("nav-ico-history").innerHTML = window.icon("history", 19);
    document.getElementById("nav-ico-settings").innerHTML = window.icon("settings", 19);
    document.getElementById("nav-ico-about").innerHTML = window.icon("about", 19);
    document.getElementById("splash-mark").innerHTML = window.brandIcon(64);
    document.getElementById("btn-ico-export").innerHTML = window.icon("export", 15);
  }

  window.wireNavIcons = wireNavIcons;
})();