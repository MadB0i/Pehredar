(function () {
  "use strict";

  let mounted = false;
  let chart = null;

  function mount(el) {
    el.innerHTML =
      '<div class="dash-grid">' +
      '<div class="card device-card">' +
      '<div class="card-title">DEVICE</div>' +
      '<div class="device-big mono" id="dash-device-model">No device connected</div>' +
      '<div class="device-sub mono" id="dash-device-serial"></div>' +
      '<div class="device-prop"><span class="plabel">Android</span><span class="pval mono" id="dash-device-android">—</span></div>' +
      '<div class="device-prop"><span class="plabel">Status</span><span class="pval" id="dash-device-status">offline</span></div>' +
      "</div>" +
      '<div class="card lastscan-card">' +
      '<div class="card-title">LAST SCAN</div>' +
      '<div id="dash-lastscan" class="lastscan-body"><span class="dim">No scans yet</span></div>' +
      "</div>" +
      '<div class="card chart-card">' +
      '<div class="card-title">RISK TREND</div>' +
      '<div class="chart-box"><canvas id="dash-chart"></canvas></div>' +
      "</div>" +
      '<div class="card cta-card">' +
      '<button class="btn btn-primary btn-lg" id="dash-new-scan">' + window.icon("plus", 18) + " New Scan</button>" +
      '<p class="cta-hint">Run a full root & spyware detection pass on the connected device.</p>' +
      "</div>" +
      "</div>";

    el.querySelector("#dash-new-scan").addEventListener("click", () => window.App.router.show("scan"));
    mounted = true;
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

  async function refreshLastScan() {
    const el = document.getElementById("view-dashboard");
    if (!mounted || !el) return;
    const list = await window.pehredar.scans.list();
    const box = el.querySelector("#dash-lastscan");
    if (!list.length) {
      box.innerHTML = '<span class="dim">No scans yet</span>';
      return;
    }
    const s = list[0];
    const device = (s.device && (s.device.model || s.device.serial)) || "Unknown";
    box.innerHTML =
      '<div class="lastscan-risk">' +
      window.Components.riskBadge(s.risk_level) +
      '<span class="lastscan-score mono">' + window.Components.esc(s.risk_score ?? "") + "</span></div>" +
      '<div class="lastscan-meta mono">' + window.Components.fmtTime(s.timestamp) + "</div>" +
      '<div class="lastscan-device mono">' + window.Components.esc(device) + "</div>" +
      '<div><button class="btn btn-ghost btn-sm" id="dash-view-details">View Details</button></div>';
    box.querySelector("#dash-view-details").addEventListener("click", () => window.App.detail.open(s.id));
  }

  function refreshChart() {
    const el = document.getElementById("view-dashboard");
    if (!mounted || !el) return;
    const box = el.querySelector(".chart-box");
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
              borderColor: "#00e5ff",
              backgroundColor: "rgba(0,229,255,0.08)",
              fill: true,
              tension: 0.3,
              pointBackgroundColor: "#00e5ff",
              pointBorderColor: "#0a0e14",
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: "#121a2b", borderColor: "rgba(0,229,255,0.3)", borderWidth: 1, titleColor: "#7d8aa0", bodyColor: "#e6edf7" } },
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
    await refreshLastScan();
    refreshChart();
  }

  window.Views = window.Views || {};
  window.Views.dashboard = { mount, show: refresh, refresh };
})();