(function () {
  "use strict";

  // First-run onboarding: a 3-step USB-debugging guide. Shown once —
  // completion (or Skip) persists `onboarded: true` in settings.
  // Replayable any time from Settings → Setup Guide.

  const STEPS = [
    {
      kicker: "STEP 1 OF 3",
      title: "Unlock Developer Options",
      body:
        "<p>Android hides its developer menu until you ask for it:</p>" +
        "<ol>" +
        "<li>Open <code>Settings → About phone</code>.</li>" +
        "<li>Tap <code>Build number</code> seven times.</li>" +
        "<li>Enter your lockscreen PIN if asked — you'll see “You are now a developer”.</li>" +
        "</ol>",
    },
    {
      kicker: "STEP 2 OF 3",
      title: "Turn on USB debugging",
      body:
        "<p>This lets Pehredar inspect the phone from your computer. Nothing is installed on the phone itself.</p>" +
        "<ol>" +
        "<li>Open <code>Settings → System → Developer options</code>.</li>" +
        "<li>Switch <code>USB debugging</code> ON and confirm.</li>" +
        "</ol>",
    },
    {
      kicker: "STEP 3 OF 3",
      title: "Plug in and trust",
      body:
        "<p>Connect the phone with a USB cable. It will ask:</p>" +
        "<ol>" +
        "<li>Tap <code>Allow</code> on “Allow USB debugging?”.</li>" +
        "<li>Tick <code>Always allow from this computer</code> so it doesn't ask again.</li>" +
        "<li>Back in Pehredar, the top bar turns green — then press <code>New Scan</code>.</li>" +
        "</ol>",
    },
  ];

  let current = 0;
  let bound = false;

  function render() {
    const step = STEPS[current];
    document.getElementById("onboarding-kicker").textContent = step.kicker;
    document.getElementById("onboarding-title").textContent = step.title;
    document.getElementById("onboarding-body").innerHTML = step.body;
    document.querySelectorAll(".onboarding-dot").forEach((d, i) => {
      d.classList.toggle("done", i <= current);
    });
    document.getElementById("onboarding-back").disabled = current === 0;
    document.getElementById("onboarding-next").textContent =
      current === STEPS.length - 1 ? "Done" : "Next";
  }

  function show() {
    current = 0;
    render();
    document.getElementById("onboarding-overlay").classList.remove("hidden");
  }

  function hide() {
    document.getElementById("onboarding-overlay").classList.add("hidden");
  }

  function finish() {
    window.pehredar.settings.set({ onboarded: true }).catch(() => {});
    hide();
  }

  function bind() {
    if (bound) return;
    document.getElementById("onboarding-back").addEventListener("click", () => {
      if (current > 0) {
        current -= 1;
        render();
      }
    });
    document.getElementById("onboarding-next").addEventListener("click", () => {
      if (current < STEPS.length - 1) {
        current += 1;
        render();
      } else {
        finish();
      }
    });
    document.getElementById("onboarding-skip").addEventListener("click", finish);
    bound = true;
  }

  window.Views = window.Views || {};
  window.Views.onboarding = { show, hide, bind };
})();
