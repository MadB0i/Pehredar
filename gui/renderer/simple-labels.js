(function () {
  "use strict";

  // Display-layer only: relabels check names and rewrites evidence strings in
  // plain language for non-technical users. Simple Mode does NOT touch the
  // Python core, check results, pass/fail logic, scoring, or the exported
  // JSON report — it only changes what is shown in the Scan / Scan Detail
  // views. Technical reports stay accurate and unchanged.

  var SIMPLE = {
    check_su_binary: {
      name: "Hidden super-user tools",
      pass: "No tools that let apps take full control of your phone were found.",
      fail: "A hidden tool that lets apps run with full control was found.",
    },
    check_root_packages: {
      name: "Apps that bypass security",
      pass: "No apps that bypass your phone's security were found.",
      fail: "An app that bypasses your phone's security (like Magisk) is installed.",
    },
    check_build_tags: {
      name: "Official software check",
      pass: "Your phone is running an official, signed version of its software.",
      fail: "Your phone's software was not signed by the official maker — it may have been modified.",
    },
    check_debuggable_secure: {
      name: "Deep-access debugging check",
      pass: "No extra computer-debugging access was found.",
      fail: "Your phone allows deeper computer access than normal — a sign of modified software.",
    },
    check_writable_system: {
      name: "Protected storage check",
      pass: "Your phone's protected system area is locked as it should be.",
      fail: "Your phone's protected system area can be written to — a strong sign of tampering.",
    },
    check_busybox: {
      name: "Hacking toolbox check",
      pass: "No hacking toolkits were found.",
      fail: "A hacking toolkit (BusyBox) was found on your phone.",
    },
    check_magisk_hide: {
      name: "Root-hiding tool check",
      pass: "No tools for hiding root access were found.",
      fail: "A tool used to hide root access was found.",
      inconclusive: "This check couldn't finish, so nothing was confirmed.",
    },
    check_hidden_apps: {
      name: "Apps hiding from your app list",
      pass: "No apps are hiding their icon from your app list.",
      fail: "Some apps are hiding their icon from your app list.",
    },
    check_accessibility_services: {
      name: "Apps that can see your screen",
      pass: "No app can read your screen or what you type.",
      fail: "An app can see your screen and read what you type.",
    },
    check_device_admin: {
      name: "Apps with special device control",
      pass: "No outside app has special control over your phone.",
      fail: "An app has special control over your phone — it could lock or wipe it.",
    },
    check_sensitive_permissions: {
      name: "Apps that could spy on everything",
      pass: "No hidden app has full access to your messages, camera, microphone and location.",
      fail: "A hidden app can access your messages, camera, microphone and location.",
    },
  };

  var FALLBACK = {
    name: "Unknown check",
    pass: "This check passed.",
    fail: "This check found something worth reviewing.",
    inconclusive: "This check couldn't complete, so nothing is confirmed.",
  };

  var nameToSlug = {};
  function index() {
    (window.CHECK_CATALOG || []).forEach(function (c) {
      nameToSlug[c.name] = c.slug;
    });
  }
  index();

  function slugOf(check) {
    if (!check) return null;
    if (SIMPLE[check]) return check;
    return nameToSlug[check] || null;
  }

  function outcomeOf(c) {
    return c.outcome || (c.passed ? "pass" : "fail");
  }

  function apply(c) {
    var meta = SIMPLE[slugOf(c.check || c.name)] || FALLBACK;
    var outcome = outcomeOf(c);
    return {
      check: meta.name,
      outcome: outcome,
      passed: c.passed,
      severity: c.severity,
      evidence: meta[outcome] || (outcome === "pass" ? meta.pass : meta.fail),
      packages: c.packages,
    };
  }

  function simpleName(slug) {
    var meta = SIMPLE[slug];
    return meta ? meta.name : null;
  }

  window.SimpleLabels = { apply: apply, simpleName: simpleName, enabled: false };
})();