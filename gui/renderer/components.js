(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function riskBadge(level) {
    const lvl = String(level || "Low").toUpperCase();
    return '<span class="badge badge-' + lvl.toLowerCase() + '">' + lvl + "</span>";
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function renderResults(container, rec) {
    const checks = rec.checks || [];
    const summary = rec.summary || {};
    const device = rec.device || {};
    const model = device.model || device.serial || "Unknown";

    let html = "";
    html += '<div class="res-header">';
    html += "<div>";
    html += '<div class="res-title">Device: <span class="mono">' + esc(model) + "</span></div>";
    html += '<div class="res-sub mono">' + esc(device.serial || "") + " · " + esc(fmtTime(rec.timestamp)) + "</div>";
    html += "</div>";
    html += '<div class="res-risk">' + riskBadge(rec.risk_level) + '<span class="res-score mono">' + esc(String(rec.risk_score ?? "")) + "</span></div>";
    html += "</div>";
    html +=
      '<div class="res-stats mono">' +
      (summary.passed ?? 0) +
      " PASS · " +
      (summary.failed ?? 0) +
      " FAIL · " +
      (summary.inconclusive ?? 0) +
      " INCONCLUSIVE · " +
      (summary.high_severity ?? 0) +
      " HIGH</div>";
    html += '<div class="res-list">';
    for (const c of checks) {
      const display =
        window.SimpleLabels && window.SimpleLabels.enabled ? window.SimpleLabels.apply(c) : c;
      const outcome = display.outcome || (c.passed ? "pass" : "fail");
      const statusLabel = outcome === "pass" ? "PASS" : outcome === "fail" ? "FAIL" : "INCONCLUSIVE";
      html += '<div class="res-row ' + outcome + '">';
      html += '<span class="res-status">' + statusLabel + "</span>";
      html += '<span class="res-name">' + esc(display.check || "") + "</span>";
      html += '<span class="res-sev sev-' + esc(String(display.severity || "info").toLowerCase()) + '">' + esc(String(display.severity || "info").toUpperCase()) + "</span>";
      html += '<span class="res-evidence mono">' + esc(display.evidence || "") + "</span>";
      if (outcome === "fail" && Array.isArray(c.packages) && c.packages.length) {
        html +=
          '<button class="btn btn-ghost btn-sm rv-btn" data-check="' + esc(c.check || c.name || "") + '" data-pkgs="' + esc(JSON.stringify(c.packages)) + '">Review &amp; Remove</button>';
      }
      html += "</div>";
    }
    html += "</div>";

    container.innerHTML = html;
    container.querySelectorAll(".rv-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        let pkgs = [];
        try {
          pkgs = JSON.parse(btn.dataset.pkgs);
        } catch (e) {
          /* ignore malformed */
        }
        if (window.App && window.App.review) window.App.review.open(btn.dataset.check, pkgs);
      });
    });
  }

  window.CHECK_CATALOG = [
    {
      slug: "check_su_binary",
      name: "SU Binary",
      category: "root",
      short: "Looks for the su binary in common root install paths.",
      long: "Scans /system/bin, /system/xbin, /sbin and Magisk paths for the su binary. Its presence means a root daemon can be invoked — the most direct root indicator.",
    },
    {
      slug: "check_root_packages",
      name: "Root Packages",
      category: "root",
      short: "Detects Magisk, SuperSU and other root managers.",
      long: "Checks installed packages against known root tooling (Magisk, SuperSU, Xposed, RootCloak). Finding one strongly suggests the device has root-management software.",
    },
    {
      slug: "check_build_tags",
      name: "Build Tags",
      category: "root",
      short: "Checks whether the ROM is signed with test-keys.",
      long: "Reads ro.build.tags. test-keys indicates a custom or unofficial build, common on rooted and custom-ROM devices; release-keys means stock signing.",
    },
    {
      slug: "check_debuggable_secure",
      name: "Debuggable/Secure",
      category: "root",
      short: "Detects debuggable or insecure ADB builds.",
      long: "ro.debuggable=1 or ro.secure=0 reveal userdebug/eng builds that grant elevated ADB access — a sign the firmware has been tampered with.",
    },
    {
      slug: "check_writable_system",
      name: "Writable /system",
      category: "root",
      short: "Checks if /system is mounted read-write.",
      long: "Rooted devices often remount /system read-write to inject binaries. A writable system partition is a strong tampering signal.",
    },
    {
      slug: "check_busybox",
      name: "BusyBox Binary",
      category: "root",
      short: "Finds BusyBox, a common root toolkit.",
      long: "BusyBox bundles many Unix utilities and is frequently installed by root toolkits. Its presence supports a root verdict.",
    },
    {
      slug: "check_magisk_hide",
      name: "Magisk Hide",
      category: "root",
      short: "Looks for Magisk mount and device-node traces.",
      long: "Searches for Magisk mount-namespace references and /dev/magisk* device nodes used by Magisk Hide to evade detection.",
    },
    {
      slug: "check_hidden_apps",
      name: "Hidden Apps",
      category: "spyware",
      short: "Finds third-party apps with no launcher icon.",
      long: "Malware often hides its launcher icon to stay invisible. Compares installed third-party packages against launchable activities to find them.",
    },
    {
      slug: "check_accessibility_services",
      name: "Accessibility Services",
      category: "spyware",
      short: "Flags unknown enabled accessibility services.",
      long: "Accessibility can read screens and inject events — a powerful spyware channel. Flags any enabled service that isn't a known screen reader.",
    },
    {
      slug: "check_device_admin",
      name: "Device Admin",
      category: "spyware",
      short: "Flags third-party device admin / owner apps.",
      long: "Device-admin and device-owner apps can wipe, lock and control the phone. Flags any such app not owned by the system or Google.",
    },
    {
      slug: "check_sensitive_permissions",
      name: "Sensitive Permissions",
      category: "spyware",
      short: "Hidden apps holding SMS + Camera + Mic + Location.",
      long: "Spyware often silently grabs every sensitive permission. Flags hidden apps granted the full combination of SMS, camera, microphone and location.",
    },
  ];

  function checksByCategory() {
    const groups = { root: [], spyware: [] };
    for (const c of window.CHECK_CATALOG) {
      (groups[c.category] || (groups[c.category] = [])).push(c);
    }
    return groups;
  }

  window.Components = { esc, riskBadge, fmtTime, renderResults, checksByCategory };
})();