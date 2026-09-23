(function () {
  "use strict";

  // Safety-first presentation for known-stalkerware matches.
  //
  // Nothing here changes what the scan found or what removal does — it only
  // changes what is shown, and in what order, before a genuine stalkerware
  // match can lead to removal. The rule mirrors pehredar/safety.py::
  // safety_gate (stalkerware identity, never severity alone): a direct
  // Uninstall button is never the first thing shown for such findings.
  // Instead the user gets a real choice: preserve evidence, remove with
  // understanding, or see support options first.
  //
  // Tone is deliberately calm, factual and second-person. No red styling,
  // no alarm words, no clinical or legal claims beyond what the scan
  // supports. Support numbers were verified against official Indian
  // government pages before shipping (NCW 14490, cybercrime.gov.in/1930).

  var DISPLAY_SLUG = {
    "SU Binary": "check_su_binary",
    check_su_binary: "check_su_binary",
    "Root Packages": "check_root_packages",
    check_root_packages: "check_root_packages",
    "Build Tags": "check_build_tags",
    check_build_tags: "check_build_tags",
    "Debuggable/Secure Props": "check_debuggable_secure",
    check_debuggable_secure: "check_debuggable_secure",
    "Writable /system": "check_writable_system",
    check_writable_system: "check_writable_system",
    "BusyBox Binary": "check_busybox",
    check_busybox: "check_busybox",
    "Magisk Hide Indicators": "check_magisk_hide",
    check_magisk_hide: "check_magisk_hide",
    "Hidden Apps (No Icon)": "check_hidden_apps",
    check_hidden_apps: "check_hidden_apps",
    "Accessibility Services": "check_accessibility_services",
    check_accessibility_services: "check_accessibility_services",
    "Device Admin Privileges": "check_device_admin",
    check_device_admin: "check_device_admin",
    "Sensitive Permissions (No Icon)": "check_sensitive_permissions",
    check_sensitive_permissions: "check_sensitive_permissions",
    "Known Stalkerware Indicators": "check_known_stalkerware",
    check_known_stalkerware: "check_known_stalkerware",
  };

  function esc(s) {
    return window.Components.esc(s);
  }

  function gateApplies(checkName) {
    return DISPLAY_SLUG[String(checkName || "")] === "check_known_stalkerware";
  }

  function isStalkerware(checkName) {
    return DISPLAY_SLUG[String(checkName || "")] === "check_known_stalkerware";
  }

  function pkgList(packages) {
    if (!packages || !packages.length) return "";
    return (
      '<div class="safety-pkgs"><div class="safety-pkgs-title">Flagged in this check:</div>' +
      packages
        .map((p) => '<div class="safety-pkg mono">' + esc(p) + "</div>")
        .join("") +
      "</div>"
    );
  }

  function choiceButton(id, label) {
    return '<button class="btn btn-ghost" id="' + id + '">' + esc(label) + "</button>";
  }

  function renderSafety(body, opts) {
    var stalk = isStalkerware(opts.checkName);
    var intro = stalk
      ? "This phone shows signs that another person may be monitoring it — " +
        "an app here matches known monitoring software. Removing that app right now " +
        "could alert whoever put it there, especially if they also have access to this " +
        "phone or your accounts. There is no rush: think through what is safest for " +
        "you first, and come back to this screen when you are ready."
      : "An app here has powerful control over this phone. Removing the wrong app can " +
        "break things the phone needs to work, so it is worth understanding what each " +
        "app does before you act. If anything here looks unfamiliar, consider asking " +
        "someone you trust for a second opinion first. There is no rush — this finding " +
        "will still be here afterwards.";
    body.innerHTML =
      '<div class="safety-note">' +
      '<div class="safety-title">Before you remove anything</div>' +
      "<p>" + intro + "</p>" +
      pkgList(opts.packages) +
      '<div class="safety-choices">' +
      choiceButton("sf-preserve", "Preserve evidence first") +
      choiceButton("sf-remove", "I understand the risk — remove it") +
      choiceButton("sf-support", "See support options first") +
      "</div>" +
      "</div>";
    document.getElementById("sf-preserve").addEventListener("click", opts.onPreserve);
    document.getElementById("sf-remove").addEventListener("click", opts.onRemove);
    document.getElementById("sf-support").addEventListener("click", opts.onSupport);
  }

  function renderEvidence(body, opts) {
    body.innerHTML =
      '<div class="safety-note">' +
      '<div class="safety-title">Preserve evidence first</div>' +
      "<p>If you may later need to show what was on this phone — to police, a support " +
      "worker, or in court — collect proof before anything changes:</p>" +
      "<ol>" +
      "<li>Use <strong>Export Report</strong> in the scan results to save this scan as a file, " +
      "and take screenshots of these results.</li>" +
      "<li>Store those copies somewhere only you can reach. Do not keep them on this phone, " +
      "and do not put them in a shared or family cloud account — someone monitoring this " +
      "device may see them there.</li>" +
      "</ol>" +
      '<div class="safety-choices">' +
      '<button class="btn btn-danger" id="sf-continue">Continue to removal</button>' +
      '<button class="btn btn-ghost" id="sf-back">Back</button>' +
      "</div>" +
      "</div>";
    document.getElementById("sf-continue").addEventListener("click", opts.onContinue);
    document.getElementById("sf-back").addEventListener("click", opts.onBack);
  }

  function resourcesHTML() {
    function row(name, number, note) {
      return (
        '<div class="support-row">' +
        '<div class="support-name">' + esc(name) + "</div>" +
        '<a class="support-num mono" href="tel:' + esc(number.replace(/\s/g, "")) + '">' + esc(number) + "</a>" +
        '<div class="support-note">' + esc(note) + "</div>" +
        "</div>"
      );
    }
    return (
      '<div class="support-list">' +
      row("Emergency — all emergencies", "112", "Single national emergency number, 24×7.") +
      row("Women Helpline", "181", "National helpline for women in distress, 24×7.") +
      row("National Commission for Women", "14490", "24×7 helpline; complaint registration and counselling referrals.") +
      row("Cyber Crime Helpline", "1930", "National cyber-crime helpline, handled with state police.") +
      "</div>" +
      '<div class="support-row">' +
      '<div class="support-name">Report online</div>' +
      '<a class="support-num mono" href="https://cybercrime.gov.in">cybercrime.gov.in</a>' +
      '<div class="support-note">National Cyber Crime Reporting Portal — file the full complaint here.</div>' +
      "</div>" +
      '<p class="support-foot">These are general starting points, not a replacement for local ' +
      "police or legal help. Pehredar works fully offline — nothing on this screen is " +
      "tracked or transmitted anywhere.</p>"
    );
  }

  function renderSupport(body, opts) {
    body.innerHTML =
      '<div class="safety-note">' +
      '<div class="safety-title">Support options — India</div>' +
      "<p>If you feel unsafe, consider reaching out. You do not have to decide anything about this phone today.</p>" +
      resourcesHTML() +
      '<div class="safety-choices">' +
      '<button class="btn btn-ghost" id="sf-back">Back</button>' +
      "</div>" +
      "</div>";
    document.getElementById("sf-back").addEventListener("click", opts.onBack);
  }

  window.Safety = {
    gateApplies: gateApplies,
    isStalkerware: isStalkerware,
    resourcesHTML: resourcesHTML,
    renderSafety: renderSafety,
    renderEvidence: renderEvidence,
    renderSupport: renderSupport,
  };
})();
