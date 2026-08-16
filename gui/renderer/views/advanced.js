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

  const SCENE_MSG = {
    idle: "AGENT STANDBY",
    fp: "DEVICE IDENTIFIED",
    unlock: "OEM UNLOCK",
    wipe: "FACTORY RESET",
    extract: "EXTRACTING BOOT IMAGE",
    patch: "PATCHING BOOT IMAGE",
    apply: "BOOTING PATCHED IMAGE",
    flash: "FLASHING BOOT PARTITION",
    reboot: "REBOOTING",
    verify: "VERIFYING ROOT",
    rooted: "ROOT CONFIRMED",
    notrooted: "ROOT NOT DETECTED",
    lockclear: "BREAKING LOCK",
    lockremoved: "REMOVING KEY FILES",
    lockcleared: "LOCK CLEARED",
    unlocked: "DEVICE UNLOCKED",
    action: "MANUAL ACTION NEEDED",
    error: "OPERATION FAILED",
  };

  function phoneSVG() {
    return (
      '<div class="phone-scene scene-idle" id="phone-scene">' +
      '<div class="phone-glow"></div>' +
      '<div class="phone">' +
      '<div class="phone-notch"></div>' +
      '<div class="phone-screen">' +
      '<div class="scr-layer scr-lock">' +
      window.icon("lock", 34) +
      "</div>" +
      '<div class="scr-layer scr-unlock"><span class="stamp">OEM UNLOCK</span></div>' +
      '<div class="scr-layer scr-wipe"><span class="wipe-bar"></span></div>' +
      '<div class="scr-layer scr-patch"><div class="hex-stream"></div></div>' +
      '<div class="scr-layer scr-boot"><span class="boot-dot"></span><span class="boot-name">PEHREDAR</span></div>' +
      '<div class="scr-layer scr-rooted"><span class="big-badge ok">ROOTED</span></div>' +
      '<div class="scr-layer scr-notrooted"><span class="big-badge warn">ROOT NOT DETECTED</span></div>' +
      '<div class="scr-layer scr-lockclear"><div class="crack"></div><span class="big-badge danger">BREAKING LOCK</span></div>' +
      '<div class="scr-layer scr-lockcleared"><span class="big-badge ok">LOCK CLEARED</span></div>' +
      '<div class="scr-layer scr-unlocked"><span class="big-badge ok">UNLOCKED</span></div>' +
      "</div>" +
      '<div class="phone-btn btn-top"></div>' +
      '<div class="phone-btn btn-side"></div>' +
      "</div>" +
      '<div class="scan-rings"></div>' +
      '<div class="scan-beam"></div>' +
      "</div>"
    );
  }

  function mount(el) {
    el.innerHTML =
      '<div class="adv-wrap">' +

      // ---- HUD ----
      '<div class="card adv-hud">' +
      '<div class="hud-left">' +
      '<div class="hud-blink"></div>' +
      '<div class="hud-id mono" id="agent-fp">NO DEVICE INFO</div>' +
      '<div class="hud-meta mono" id="agent-meta">agent offline</div>' +
      "</div>" +
      '<div class="hud-step mono" id="hud-step">STANDBY</div>' +
      "</div>" +

      // ---- device-action banner ----
      '<div class="card device-action hidden" id="device-action">' +
      '<span class="da-ico">' + window.icon("lock", 20) + "</span>" +
      '<div class="da-body">' +
      '<div class="da-title mono">MANUAL ACTION REQUIRED ON DEVICE</div>' +
      '<div class="da-detail" id="device-action-detail"></div>' +
      "</div>" +
      "</div>" +

      '<div class="adv-grid">' +

      // ---- left column: scene + terminal ----
      '<div class="adv-left">' +
      '<div class="card scene-card">' +
      '<div class="scene-top mono"><span class="scene-led"></span> LIVE AGENT FEED</div>' +
      '<div class="scene-stage">' +
      '<div class="scene-grid"></div>' +
      phoneSVG() +
      '<div class="scene-msg mono" id="scene-msg">' + SCENE_MSG.idle + "</div>" +
      '<div class="scene-progress" id="scene-progress"></div>' +
      "</div>" +
      "</div>" +
      '<div class="card terminal-card">' +
      '<div class="terminal-head mono">root@pehredar ~ $ device[' + esc(window.App.device.serial || "---") + "]</div>" +
      '<div class="terminal mono" id="agent-log"></div>' +
      "</div>" +
      "</div>" +

      // ---- right column: controls + timeline ----
      '<div class="adv-right">' +

      '<div class="card">' +
      '<div class="card-title-row">' +
      '<span class="card-title">ROOT AGENT</span>' +
      '<span class="mode-chip mono" id="agent-mode-chip">' + agentMode.toUpperCase() + "</span>" +
      "</div>" +
      '<div class="setting-sub">Root Mode</div>' +
      '<div class="mode-row" id="agent-mode">' +
      '<button class="mode-btn active" data-mode="temporary">TEMPORARY</button>' +
      '<button class="mode-btn" data-mode="permanent">PERMANENT</button>' +
      "</div>" +
      '<div class="agent-actions">' +
      '<button class="btn btn-ghost" id="agent-plan">' + window.icon("history", 15) + " Plan</button>" +
      '<button class="btn btn-danger" id="agent-run">' + window.icon("play", 15) + " Run</button>" +
      '<button class="btn btn-stop" id="agent-stop" disabled>' + window.icon("close", 15) + " Stop</button>" +
      "</div>" +
      "</div>" +

      '<div class="card">' +
      '<div class="card-title-row"><span class="card-title">USB LOCK RECOVERY</span></div>' +
      '<p class="set-hint">Clears a forgotten PIN / pattern / password on test or lab phones. Only works when USB debugging is already enabled and authorized.</p>' +
      '<div class="agent-actions">' +
      '<button class="btn btn-ghost" id="lock-plan">' + window.icon("history", 15) + " Plan</button>" +
      '<button class="btn btn-danger" id="lock-run">' + window.icon("play", 15) + " Run</button>" +
      '<button class="btn btn-stop" id="lock-stop" disabled>' + window.icon("close", 15) + " Stop</button>" +
      "</div>" +
      "</div>" +

      '<div class="card">' +
      '<div class="card-title-row">' +
      '<span class="card-title">AUTO-UNLOCK AFTER REBOOT</span>' +
      '<span class="unlock-chip mono" id="unlock-chip">OFF</span>' +
      "</div>" +
      '<p class="set-hint">After the agent reboots the device it re-enters your own lock automatically so the run can continue. Credentials travel via a temp file — never saved.</p>' +
      '<div class="unlock-input-row">' +
      '<span class="ul-ico">' + window.icon("key", 15) + "</span>" +
      '<input type="password" id="agent-pin" placeholder="Device PIN — e.g. 1234" autocomplete="off" spellcheck="false" />' +
      "</div>" +
      '<div class="unlock-input-row">' +
      '<span class="ul-ico">' + window.icon("grid", 15) + "</span>" +
      '<input type="text" id="agent-pattern" placeholder="3x3 pattern (digits 0-8) — e.g. 012578" autocomplete="off" spellcheck="false" />' +
      "</div>" +
      '<div class="unlock-status mono" id="unlock-status">No credentials — a manual unlock checkpoint will be shown.</div>' +
      '<p class="set-hint dim-hint">Unauthorized after reboot (encrypted ADB key)? The agent shows a manual unlock checkpoint and waits for you.</p>' +
      "</div>" +

      '<div class="card">' +
      '<div class="card-title">OPERATION TIMELINE</div>' +
      '<div id="agent-notes" class="agent-notes"></div>' +
      '<div id="agent-plan-list"></div>' +
      "</div>" +

      "</div>" +
      "</div>" +
      "</div>";

    el.querySelectorAll("#agent-mode .mode-btn").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode))
    );
    el.querySelector("#agent-plan").addEventListener("click", () => startPlan("root"));
    el.querySelector("#agent-run").addEventListener("click", () => startRun("root"));
    el.querySelector("#agent-stop").addEventListener("click", () => stopAgent("root"));
    el.querySelector("#lock-plan").addEventListener("click", () => startPlan("lock"));
    el.querySelector("#lock-run").addEventListener("click", () => startRun("lock"));
    el.querySelector("#lock-stop").addEventListener("click", () => stopAgent("lock"));
    el.querySelectorAll("#agent-pin, #agent-pattern").forEach((i) => i.addEventListener("input", unlockStatus));
    mounted = true;
  }

  function setMode(m) {
    agentMode = m;
    const v = document.getElementById("view-advanced");
    v.querySelectorAll("#agent-mode .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    const chip = v.querySelector("#agent-mode-chip");
    if (chip) chip.textContent = m.toUpperCase();
    window.pehredar.settings.set({ agentMode: m });
  }

  function unlockStatus() {
    const v = el();
    const pin = v.querySelector("#agent-pin").value.trim();
    const pattern = v.querySelector("#agent-pattern").value.trim();
    const chip = v.querySelector("#unlock-chip");
    const status = v.querySelector("#unlock-status");
    if (pin && pattern) {
      chip.textContent = "PIN + PATTERN";
      chip.classList.add("ready");
      status.textContent = "Both set — PIN is tried first, pattern as fallback.";
    } else if (pin) {
      chip.textContent = "PIN READY";
      chip.classList.add("ready");
      status.textContent = "PIN will be auto-entered after reboot.";
    } else if (pattern) {
      chip.textContent = "PATTERN READY";
      chip.classList.add("ready");
      status.textContent = "Pattern will be auto-drawn after reboot.";
    } else {
      chip.textContent = "OFF";
      chip.classList.remove("ready");
      status.textContent = "No credentials — a manual unlock checkpoint will be shown.";
    }
  }

  function el() {
    return document.getElementById("view-advanced");
  }

  function setScene(state, msg) {
    const scene = el().querySelector("#phone-scene");
    scene.className = "phone-scene scene-" + state;
    el().querySelector("#scene-msg").textContent = msg || SCENE_MSG[state] || state.toUpperCase();
  }

  function setHudStep(text) {
    el().querySelector("#hud-step").textContent = text;
  }

  function showAction(detail) {
    const banner = el().querySelector("#device-action");
    banner.classList.remove("hidden");
    el().querySelector("#device-action-detail").textContent = detail || "";
  }

  function hideAction() {
    el().querySelector("#device-action").classList.add("hidden");
  }

  function reset(kind) {
    activeKind = kind;
    fp = null;
    plan = null;
    stepStates = {};
    hideAction();
    const v = el();
    v.querySelector("#agent-fp").textContent = "WORKING…";
    v.querySelector("#agent-meta").textContent = "agent " + (kind === "lock" ? "lock-recovery" : "root") + " engaged";
    v.querySelector("#agent-notes").innerHTML = "";
    v.querySelector("#agent-plan-list").innerHTML = "";
    v.querySelector("#agent-log").innerHTML = "";
    v.querySelector("#scene-progress").innerHTML = "";
    setScene("idle");
    setHudStep("STANDBY");
    logLine("agent engaged — " + (kind === "lock" ? "lock recovery" : "root") + " session");
  }

  function setBusy(on) {
    running = on;
    const v = el();
    v.querySelectorAll("#agent-plan, #agent-run, #lock-plan, #lock-run").forEach((b) => (b.disabled = on));
    v.querySelectorAll("#agent-stop, #lock-stop").forEach((b) => (b.disabled = !on));
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
    const destructive = kind === "root" ? agentMode === "permanent" : true;
    const msg = destructive
      ? "This performs destructive actions on the connected device — unlocking the bootloader or removing lock keys ERASES ALL DATA. Continue only on your own / authorized test device."
      : "Run the root agent? Data will not be wiped in temporary mode.";
    if (!confirm(msg)) return;
    const pin = el().querySelector("#agent-pin").value.trim();
    const pattern = el().querySelector("#agent-pattern").value.trim();
    reset(kind);
    setBusy(true);
    window.pehredar.agent.start(kind === "lock" ? "run-lock" : "run-root", { pin, pattern });
  }

  function stopAgent(kind) {
    logLine("cancel requested — stopping " + (kind === "lock" ? "lock recovery" : "root agent"), "ln-warn");
    window.pehredar.agent.cancel();
  }

  function renderFp() {
    if (!fp) return;
    const v = el();
    v.querySelector("#agent-fp").textContent =
      fp.oem.toUpperCase() + " · " + esc(fp.manufacturer) + " " + esc(fp.model) +
      " · ANDROID " + esc(fp.android_version);
    v.querySelector("#agent-meta").textContent =
      "SDK " + esc(fp.sdk) + " · BL " + fp.bootloader_state.toUpperCase() + " · " + esc(fp.build_id);
    setScene("fp", SCENE_MSG.fp);
  }

  function renderPlan() {
    if (!plan) return;
    const v = el();
    const notes = (plan.notes || []).map((n) => "<div class='agent-note'>" + esc(n) + "</div>").join("");
    v.querySelector("#agent-notes").innerHTML = notes;
    const steps = plan.steps || [];
    const list = steps
      .map((s, i) => {
        const state = stepStates[s.id] || "queued";
        const extra = state === "error" && stepStates[s.id + ":err"]
          ? "<div class='agent-err mono'>" + esc(stepStates[s.id + ":err"]) + "</div>"
          : "";
        return (
          '<div class="agent-step ' + state + '">' +
          '<span class="agent-step-idx mono">' + String(i + 1).padStart(2, "0") + "</span>" +
          '<span class="agent-step-dot"></span>' +
          '<div class="agent-step-body">' +
          '<div class="agent-step-title">' + esc(s.title) +
          (s.destructive ? ' <span class="agent-warn">DESTRUCTIVE</span>' : "") + "</div>" +
          '<div class="agent-step-detail">' + esc(s.detail) + "</div>" +
          extra +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    v.querySelector("#agent-plan-list").innerHTML = list;
  }

  function markStep(id, state, extra) {
    stepStates[id] = state;
    if (extra !== undefined) stepStates[id + ":err"] = extra;
    renderPlan();
  }

  function hudProgress() {
    if (!plan) return;
    const done = (plan.steps || []).filter((s) => stepStates[s.id] === "ok" || stepStates[s.id] === "error").length;
    const total = plan.steps.length;
    const active = (plan.steps || []).find((s) => stepStates[s.id] === "start") || {};
    setHudStep("STEP " + Math.min(done + 1, total) + "/" + total + " — " + (active.title || plan.steps[done]?.title || "").toUpperCase());
    el().querySelector("#scene-progress").style.setProperty("--p", Math.round((done / Math.max(1, total)) * 100));
  }

  function logLine(text, cls) {
    const log = el().querySelector("#agent-log");
    const div = document.createElement("div");
    div.className = "agent-log-line" + (cls ? " " + cls : "");
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  const STEP_SCENE = {
    unlock: "unlock",
    extract_boot: "extract",
    patch_boot: "patch",
    apply: "apply",
    reboot: "reboot",
    verify: "verify",
    clear: "lockclear",
    remove_keys: "lockremoved",
    none: "error",
  };

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
        hudProgress();
        logLine("plan ready — " + (plan.steps || []).length + " steps");
        break;
      case "step":
        markStep(d.id, d.state, d.error);
        hudProgress();
        const sceneName = STEP_SCENE[d.id];
        if (d.state === "ok") {
          logLine("ok: " + d.title, "ln-ok");
        } else if (d.state === "error") {
          setScene("error");
          logLine("error: " + d.title + " — " + d.error, "ln-err");
        } else if (d.state === "skipped") {
          logLine("skipped: " + d.title, "ln-dim");
        } else {
          if (sceneName) {
            const perm = d.id === "apply" && agentMode === "permanent";
            setScene(perm ? "flash" : sceneName);
          }
          logLine("> " + d.title.toUpperCase(), "ln-cmd");
        }
        break;
      case "unlock":
        if (d.state === "action") {
          setScene("action", "AUTO-UNLOCK");
          logLine("auto-unlock: " + d.detail, "ln-cmd");
        } else if (d.state === "ok") {
          setScene("unlocked");
          logLine("device session: " + d.detail, "ln-ok");
          const st = el().querySelector("#unlock-status");
          if (st) st.textContent = "Session restored after reboot.";
        } else {
          logLine("unlock: " + d.detail, "ln-dim");
        }
        break;
      case "device-action":
        showAction(d.detail);
        setScene("action");
        logLine("MANUAL ACTION NEEDED: " + d.detail, "ln-warn");
        break;
      case "verify":
        if (typeof d.disabled !== "undefined") {
          const cleared = String(d.disabled).trim().toLowerCase() === "true";
          setScene(cleared ? "lockcleared" : "lockclear", cleared ? SCENE_MSG.lockcleared : SCENE_MSG.lockclear);
          logLine("lock disabled flag: " + d.disabled, cleared ? "ln-ok" : "ln-warn");
        } else if (d.rooted) {
          setScene("rooted");
          logLine("verify: ROOTED — " + d.detail, "ln-ok");
        } else {
          setScene("notrooted");
          logLine("verify: not rooted — " + d.detail, "ln-warn");
        }
        break;
      case "detail":
        logLine("detail: " + d.text, "ln-dim");
        break;
      case "done":
        setBusy(false);
        renderPlan();
        hudProgress();
        if (d.error) {
          setScene("error");
          logLine("failed: " + d.error, "ln-err");
          window.App.toast("Agent failed — see terminal");
        } else {
          logLine("operation complete", "ln-ok");
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
        setScene("error");
        logLine("error: " + d.error, "ln-err");
        window.App.toast("Agent error: " + d.error);
        break;
    }
  }

  async function refresh() {
    const v = el();
    if (!mounted) mount(v);
    const s = await window.pehredar.settings.get();
    if (s && s.agentMode) {
      agentMode = s.agentMode === "permanent" ? "permanent" : "temporary";
      v.querySelectorAll("#agent-mode .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === agentMode));
      const chip = v.querySelector("#agent-mode-chip");
      if (chip) chip.textContent = agentMode.toUpperCase();
    }
    if (!bound) {
      window.pehredar.agent.onEvent(onEvent);
      bound = true;
    }
  }

  window.Views = window.Views || {};
  window.Views.advanced = { show: refresh };
})();