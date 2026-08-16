(function () {
  "use strict";

  let mounted = false;
  let bound = false;
  let activeKind = null; // "root" | "lock"
  let running = false;
  let fp = null;
  let plan = null;
  let stepStates = {};
  let agentMode = "temporary";

  function esc(s) {
    return window.Components.esc(s);
  }

  function mount(el) {
    el.innerHTML =
      '<h2 class="view-title">ADVANCED</h2>' +
      '<p class="set-hint">Power tools for phones you own or test in a lab. Root Agent automates bootloader unlock + Magisk; Lock Recovery clears a forgotten PIN/pattern on test devices. Both require an authorized ADB connection and will ERASE DATA where noted.</p>' +
      '<div class="advanced-grid">' +

      // ---- Root Agent ----
      '<div class="card">' +
      '<div class="card-title">ROOT AGENT</div>' +
      '<div class="agent-device mono" id="agent-fp">No device info yet.</div>' +
      '<div class="setting-sub">Root Mode</div>' +
      '<div class="mode-row" id="agent-mode">' +
      '<button class="mode-btn active" data-mode="temporary">TEMPORARY</button>' +
      '<button class="mode-btn" data-mode="permanent">PERMANENT</button>' +
      "</div>" +
      '<p class="set-hint">Temporary = fastboot boot patched image (non-destructive, reverts on reboot). Permanent = fastboot flash boot — unlocks the bootloader and ERASES ALL DATA on the device.</p>' +
      '<div class="agent-actions">' +
      '<button class="btn btn-ghost" id="agent-plan">' + window.icon("history", 15) + " Show Plan</button>" +
      '<button class="btn btn-danger" id="agent-run" disabled>' + window.icon("plus", 15) + " Run Root Agent</button>" +
      "</div>" +
      "</div>" +

      // ---- Lock Recovery ----
      '<div class="card">' +
      '<div class="card-title">USB LOCK RECOVERY</div>' +
      '<p class="set-hint">Clears a forgotten PIN / pattern / password on test or lab phones. Only works when USB debugging is already enabled and authorized on the device. Removing key files requires root.</p>' +
      '<div class="agent-actions">' +
      '<button class="btn btn-ghost" id="lock-plan">' + window.icon("history", 15) + " Show Plan</button>" +
      '<button class="btn btn-danger" id="lock-run" disabled>' + window.icon("plus", 15) + " Run Lock Recovery</button>" +
      "</div>" +
      "</div>" +

      "</div>" +

      // ---- shared plan panel ----
      '<div class="card agent-panel">' +
      '<div class="card-title">PLAN / PROGRESS</div>' +
      '<div id="agent-notes" class="agent-notes"></div>' +
      '<div id="agent-plan"></div>' +
      '<div class="agent-log" id="agent-log"></div>' +
      "</div>";

    el.querySelectorAll("#agent-mode .mode-btn").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode))
    );
    el.querySelector("#agent-plan").addEventListener("click", () => startPlan("root"));
    el.querySelector("#agent-run").addEventListener("click", () => startRun("root"));
    el.querySelector("#lock-plan").addEventListener("click", () => startPlan("lock"));
    el.querySelector("#lock-run").addEventListener("click", () => startRun("lock"));
    mounted = true;
  }

  function setMode(m) {
    agentMode = m;
    const el = document.getElementById("view-advanced");
    el.querySelectorAll("#agent-mode .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    window.pehredar.settings.set({ agentMode: m });
  }

  function reset(kind) {
    activeKind = kind;
    fp = null;
    plan = null;
    stepStates = {};
    const el = document.getElementById("view-advanced");
    el.querySelector("#agent-fp").textContent = "Working…";
    el.querySelector("#agent-notes").innerHTML = "";
    el.querySelector("#agent-plan").innerHTML = "";
    el.querySelector("#agent-log").innerHTML = "";
    el.querySelectorAll("#agent-run, #lock-run").forEach((b) => (b.disabled = true));
  }

  function setBusy(on) {
    running = on;
    const el = document.getElementById("view-advanced");
    el.querySelectorAll("#agent-plan, #agent-run, #lock-plan, #lock-run").forEach((b) => (b.disabled = on));
    if (on) el.querySelector(activeKind === "lock" ? "#lock-run" : "#agent-run").disabled = true;
  }

  function startPlan(kind) {
    if (!window.App.device.connected) {
      window.App.toast("Connect a device first");
      return;
    }
    reset(kind);
    setBusy(true);
    window.pehredar.agent.start(kind === "lock" ? "plan-lock" : "plan-root");
  }

  async function startRun(kind) {
    if (!window.App.device.connected) {
      window.App.toast("Connect a device first");
      return;
    }
    const destructive = kind === "root"
      ? agentMode === "permanent"
      : true;
    const msg = destructive
      ? "This will perform destructive actions on the connected device. Unlocking the bootloader or removing lock keys ERASES ALL DATA. Continue only on your own / authorized test device."
      : "Run the root agent? Data will not be wiped in temporary mode.";
    if (!confirm(msg)) return;
    reset(kind);
    setBusy(true);
    window.pehredar.agent.start(kind === "lock" ? "run-lock" : "run-root");
  }

  function renderFp() {
    if (!fp) return;
    const el = document.getElementById("view-advanced");
    el.querySelector("#agent-fp").textContent =
      fp.oem.toUpperCase() + " · " + esc(fp.manufacturer) + " " + esc(fp.model) +
      " · Android " + esc(fp.android_version) + " (SDK " + esc(fp.sdk) + ")" +
      " · BL: " + fp.bootloader_state.toUpperCase();
  }

  function renderPlan() {
    if (!plan) return;
    const el = document.getElementById("view-advanced");
    const notes = (plan.notes || []).map((n) => "<div class='agent-note'>" + esc(n) + "</div>").join("");
    el.querySelector("#agent-notes").innerHTML = notes;
    const list = (plan.steps || [])
      .map((s, i) => {
        const state = stepStates[s.id] || "queued";
        const extra = state === "error" && stepStates[s.id + ":err"] ? "<div class='agent-err mono'>" + esc(stepStates[s.id + ":err"]) + "</div>" : "";
        const detail = s.detail ? "<div class='agent-step-detail'>" + esc(s.detail) + "</div>" : "";
        return (
          '<div class="agent-step ' + state + '">' +
          '<span class="agent-step-dot"></span>' +
          '<div class="agent-step-body">' +
          '<div class="agent-step-title">' + (i + 1) + ". " + esc(s.title) + (s.destructive ? ' <span class="agent-warn">DESTRUCTIVE</span>' : "") + "</div>" +
          detail +
          extra +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    el.querySelector("#agent-plan").innerHTML = list;
    const enable = !running && activeKind;
    el.querySelector("#agent-run").disabled = !(enable && activeKind === "root");
    el.querySelector("#lock-run").disabled = !(enable && activeKind === "lock");
  }

  function markStep(id, state, extra) {
    stepStates[id] = state;
    if (extra !== undefined) stepStates[id + ":err"] = extra;
    renderPlan();
  }

  function logLine(text) {
    const el = document.getElementById("view-advanced");
    const log = el.querySelector("#agent-log");
    log.innerHTML += "<div class='agent-log-line'>" + esc(text) + "</div>";
    log.scrollTop = log.scrollHeight;
  }

  function onEvent(d) {
    if (!d) return;
    switch (d.type) {
      case "fp":
        fp = d.fp;
        renderFp();
        logLine("fingerprint: " + fp.oem + " · bootloader " + fp.bootloader_state);
        break;
      case "plan":
        plan = d.plan;
        renderPlan();
        logLine("plan ready — " + (plan.steps || []).length + " steps");
        break;
      case "step":
        markStep(d.id, d.state, d.error);
        if (d.state === "ok") logLine("ok: " + d.title);
        else if (d.state === "error") logLine("error: " + d.title + " — " + d.error);
        else if (d.state === "skipped") logLine("skipped: " + d.title);
        else logLine("start: " + d.title);
        break;
      case "verify":
        logLine("verify: " + (d.rooted ? "rooted" : "not rooted") + " — " + (d.detail || ""));
        if (typeof d.disabled !== "undefined") logLine("lock disabled flag: " + d.disabled);
        break;
      case "detail":
        logLine("detail: " + d.text);
        break;
      case "done":
        setBusy(false);
        renderPlan();
        if (d.error) {
          logLine("failed: " + d.error);
          window.App.toast("Agent failed — see plan log");
        } else {
          logLine("done" + (d.ok ? "" : " (with warnings)"));
          window.App.toast("Agent complete");
        }
        break;
      case "exit":
        setBusy(false);
        renderPlan();
        break;
      case "error":
        setBusy(false);
        renderPlan();
        logLine("error: " + d.error);
        window.App.toast("Agent error: " + d.error);
        break;
    }
  }

  async function refresh() {
    const el = document.getElementById("view-advanced");
    if (!mounted) mount(el);
    const s = await window.pehredar.settings.get();
    if (s && s.agentMode) {
      agentMode = s.agentMode === "permanent" ? "permanent" : "temporary";
      el.querySelectorAll("#agent-mode .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === agentMode));
    }
    if (!bound) {
      window.pehredar.agent.onEvent(onEvent);
      bound = true;
    }
  }

  window.Views = window.Views || {};
  window.Views.advanced = { show: refresh };
})();