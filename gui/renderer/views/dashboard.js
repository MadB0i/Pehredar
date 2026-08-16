(function () {
  "use strict";

  let mounted = false;
  let chart = null;

  function mount(el) {
    el.innerHTML =
      '<div class="dash-grid">' +
      '<div class="stats-row">' +
      '<div class="card stat-card"><div class="stat-label">Total Scans</div><div class="stat-value mono" id="stat-total">0</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Most Common Risk</div><div class="stat-value" id="stat-risk">—</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Last Scan</div><div class="stat-value mono" id="stat-last">—</div></div>' +
      "</div>" +
      '<div class="card device-card">' +
      '<div class="card-title">DEVICE</div>' +
      '<div class="device-big mono" id="dash-device-model">No device connected</div>' +
      '<div class="device-sub mono" id="dash-device-serial"></div>' +
      '<div class="device-prop"><span class="plabel">Android</span><span class="pval mono" id="dash-device-android">—</span></div>' +
      '<div class="device-prop"><span class="plabel">Status</span><span class="pval" id="dash-device-status">offline</span></div>' +
      "</div>" +
      '<div id="dash-scan-slot"></div>' +
      '<div class="card checks-overview">' +
      '<div class="card-title">CHECKS OVERVIEW</div>' +
      '<div class="checks-groups" id="dash-checks-groups"></div>' +
      "</div>" +
      '<div class="card chart-card" id="dash-chart-card">' +
      '<div class="card-title">RISK TREND</div>' +
      '<div class="chart-box"><canvas id="dash-chart"></canvas></div>' +
      "</div>" +
      '<div class="card cta-card" id="dash-cta">' +
      '<button class="btn btn-primary btn-lg" id="dash-new-scan">' + window.icon("plus", 18) + " New Scan</button>" +
      '<p class="cta-hint">Run a full root & spyware detection pass on the connected device.</p>' +
      "</div>" +
      "</div>";

    el.querySelector("#dash-new-scan").addEventListener("click", () => window.App.router.show("scan"));
    buildChecksOverview(el);
    mounted = true;
  }

  function buildChecksOverview(el) {
    const groups = window.Components.checksByCategory();
    let html = "";
    for (const key of ["root", "spyware"]) {
      const title = key === "root" ? "Root / Jailbreak" : "Spyware";
      const list = groups[key] || [];
      html += '<div class="checks-group">';
      html += '<div class="checks-group-title">' + title + ' <span class="count">· ' + list.length + "</span></div>";
      for (const c of list) {
        html +=
          '<div class="check-item">' +
          '<span class="check-dot"></span>' +
          '<span class="check-name">' + window.Components.esc(c.name) + "</span>" +
          '<span class="check-desc">' + window.Components.esc(c.short) + "</span>" +
          "</div>";
      }
      html += "</div>";
    }
    el.querySelector("#dash-checks-groups").innerHTML = html;
  }

  async function refreshDevice() {
    const el = document.getElementById("view-dashboard");
    if (!mounted || !el) return;
    const info = await window.pehredar.deviceInfo();
    const model = el.querySelector("#dash-device-model");
    const serial = el.querySelector("#dash-device-serial");
    const android = el.querySelector("#dash-device-android");
    const status = el.querySelector("#dash-device-status");
    if (!info) {
      model.textContent = "No device connected";
      serial.textContent = "";
      android.textContent = "—";
      status.textContent = "offline";
      status.className = "pval";
    } else {
      model.textContent = info.model || "Android device";
      serial.textContent = info.serial;
      android.textContent = info.android || "—";
      status.textContent = "online";
      status.className = "pval ok";
    }
  }

  async function refreshLastScan(list) {
    const el = document.getElementById("view-dashboard");
    if (!mounted || !el) return;
    const slot = el.querySelector("#dash-scan-slot");
    const cta = el.querySelector("#dash-cta");
    if (!list.length) {
      slot.innerHTML =
        '<div class="empty-hero">' +
        '<div class="empty-icon">' + window.brandIcon(56) + "</div>" +
        '<div class="empty-title">No scans yet</div>' +
        '<div class="empty-desc">Pehredar checks the connected Android device for root and jailbreak indicators — su binaries, root managers, Magisk traces, hidden apps, accessibility abuse and device-admin spies — then scores overall risk.</div>' +
        '<div class="empty-actions">' +
        '<button class="btn btn-primary btn-lg" id="empty-first-scan">' + window.icon("scan", 18) + " Run First Scan</button>" +
        "</div>" +
        "</div>";
      slot.querySelector("#empty-first-scan").addEventListener("click", () => window.App.router.show("scan"));
      cta.style.display = "none";
      return;
    }
    cta.style.display = "";
    slot.innerHTML =
      '<div class="card lastscan-card">' +
      '<div class="card-title">LAST SCAN</div>' +
      '<div class="lastscan-body">' +
      '<div class="lastscan-risk">' +
      window.Components.riskBadge(list[0].risk_level) +
      '<span class="lastscan-score mono">' + window.Components.esc(list[0].risk_score ?? "") + "</span></div>" +
      '<div class="lastscan-meta mono">' + window.Components.fmtTime(list[0].timestamp) + "</div>" +
      '<div class="lastscan-device mono">' + window.Components.esc((list[0].device && (list[0].device.model || list[0].device.serial)) || "Unknown") + "</div>" +
      '<div><button class="btn btn-ghost btn-sm" id="dash-view-details">View Details</button></div>' +
      "</div></div>";
    slot.querySelector("#dash-view-details").addEventListener("click", () => window.App.detail.open(list[0].id));
  }

  async function refreshStats(list) {
    const el = document.getElementById("view-dashboard");
    if (!mounted || !el) return;
    el.querySelector("#stat-total").textContent = String(list.length);
    if (!list.length) {
      el.querySelector("#stat-risk").textContent = "—";
      el.querySelector("#stat-last").textContent = "—";
      return;
    }
    const counts = {};
    let topLevel = null;
    let topCount = 0;
    for (const s of list) {
      const lvl = String(s.risk_level || "Low");
      counts[lvl] = (counts[lvl] || 0) + 1;
      if (counts[lvl] > topCount) {
        topCount = counts[lvl];
        topLevel = lvl;
      }
    }
    el.querySelector("#stat-risk").innerHTML = window.Components.riskBadge(topLevel);
    el.querySelector("#stat-last").textContent = window.Components.fmtTime(list[0].timestamp);
  }

  function accentColor() {
    return getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#00e5ff";
  }

  function accentRgb() {
    const rgb = getComputedStyle(document.body).getPropertyValue("--accent-rgb").trim() || "0, 229, 255";
    return rgb;
  }

  function refreshChart() {
    const el = document.getElementById("view-dashboard");
    if (!mounted || !el) return;
    const box = el.querySelector(".chart-box");
    const accent = accentColor();
    const rgb = accentRgb();
    window.pehredar.scans.list().then((list) => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      if (!list.length) {
        box.innerHTML = '<span class="dim">No risk history yet — run a scan to begin.</span>';
        return;
      }
      const ordered = list.slice().reverse();
      const scores = ordered.map((s) => s.risk_score || 0);
      const labels = ordered.map((s) => window.Components.fmtTime(s.timestamp).slice(5));
      box.innerHTML = '<canvas id="dash-chart"></canvas>';
      const ctx = box.querySelector("#dash-chart").getContext("2d");
      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data: scores,
              borderColor: accent,
              backgroundColor: "rgba(" + rgb + ",0.08)",
              fill: true,
              tension: 0.3,
              pointBackgroundColor: accent,
              pointBorderColor: "#0a0e14",
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#121a2b",
              borderColor: "rgba(" + rgb + ",0.3)",
              borderWidth: 1,
              titleColor: "#7d8aa0",
              bodyColor: "#e6edf7",
            },
          },
          scales: {
            x: { grid: { color: "rgba(148,184,255,0.06)" }, ticks: { color: "#4a5568", font: { family: "Cascadia Code, Consolas, monospace", size: 10 } } },
            y: { beginAtZero: true, grid: { color: "rgba(148,184,255,0.06)" }, ticks: { color: "#4a5568", font: { family: "Cascadia Code, Consolas, monospace", size: 10 } } },
          },
        },
      });
    });
  }

  async function refresh() {
    refreshDevice();
    const list = await window.pehredar.scans.list();
    refreshLastScan(list);
    refreshStats(list);
    refreshChart();
  }

  async function show() {
    const el = document.getElementById("view-dashboard");
    if (!mounted) mount(el);
    await refresh();
  }

  window.Views = window.Views || {};
  window.Views.dashboard = { mount, show, refresh };
})();