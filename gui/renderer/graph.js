(function () {
  "use strict";

  const NODES = [
    { slug: "check_su_binary", label: "SU BINARY", simple: "SUPER USER" },
    { slug: "check_root_packages", label: "ROOT PKGS", simple: "ROOT APPS" },
    { slug: "check_build_tags", label: "BUILD TAGS", simple: "SOFTWARE" },
    { slug: "check_debuggable_secure", label: "DEBUGGABLE", simple: "DEBUG ACCESS" },
    { slug: "check_writable_system", label: "WRITABLE SYS", simple: "STORAGE LOCK" },
    { slug: "check_busybox", label: "BUSYBOX", simple: "HACK TOOLKIT" },
    { slug: "check_magisk_hide", label: "MAGISK HIDE", simple: "HIDE ROOT" },
    { slug: "check_hidden_apps", label: "HIDDEN APPS", simple: "HIDDEN APPS" },
    { slug: "check_accessibility_services", label: "ACCESSIBILITY", simple: "SCREEN READ" },
    { slug: "check_device_admin", label: "DEVICE ADMIN", simple: "DEVICE CONTROL" },
    { slug: "check_sensitive_permissions", label: "SENSITIVE PERMS", simple: "FULL SPY ACCESS" },
  ];

  const COLORS = {
    pending: "rgba(125,138,160,0.22)",
    running: "#ffd700",
    pass: "#00ff66",
    fail: "#ff2d55",
    inconclusive: "#ffd700",
    center: "#00e5ff",
    edgeRunning: "rgba(255,215,0,0.5)",
    edgePass: "rgba(0,255,102,0.45)",
    edgeFail: "rgba(255,45,85,0.5)",
    edgeInconclusive: "rgba(255,215,0,0.45)",
    grid: "rgba(148,184,255,0.05)",
    label: "rgba(125,138,160,0.85)",
    ring: "rgba(230,237,247,0.2)",
  };

  function createPehredarGraph(canvas) {
    const ctx = canvas.getContext("2d");
    let nodes = [];
    let center = null;
    let time = 0;
    let rafId = null;

    function layout() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, w * window.devicePixelRatio);
      canvas.height = Math.max(1, h * window.devicePixelRatio);
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.max(60, Math.min(w, h) * 0.34);
      center = { x: cx, y: cy, r: 11 };

      nodes = NODES.map((def, i) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * i) / NODES.length;
        const simpleOn = window.SimpleLabels && window.SimpleLabels.enabled;
        return {
          slug: def.slug,
          label: simpleOn && def.simple ? def.simple : def.label,
          x: cx + radius * Math.cos(ang),
          y: cy + radius * Math.sin(ang),
          status: "pending",
          flash: 0,
        };
      });
    }

    function drawBackground() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      const step = 36;
      ctx.beginPath();
      for (let x = 0; x <= canvas.clientWidth; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.clientHeight);
      }
      for (let y = 0; y <= canvas.clientHeight; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.clientWidth, y);
      }
      ctx.stroke();
    }

    function drawEdge(node) {
      const color =
        node.status === "running"
          ? COLORS.edgeRunning
          : node.status === "pass"
            ? COLORS.edgePass
            : node.status === "inconclusive"
              ? COLORS.edgeInconclusive
              : COLORS.edgeFail;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(node.x, node.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = -time * 40;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawNode(node, color, label, radius, glow) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      if (glow > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glow;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (label) {
        ctx.font = "10px 'Cascadia Code', Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = COLORS.label;
        ctx.fillText(label, node.x, node.y + radius + 16);
      }
    }

    function draw() {
      time += 0.016;
      drawBackground();

      for (const n of nodes) {
        if (n.status !== "pending") drawEdge(n);
      }

      const centerGlow = 6 + 6 * Math.sin(time * 2);
      ctx.shadowColor = COLORS.center;
      ctx.shadowBlur = centerGlow;
      drawNode(center, COLORS.center, "DEVICE", center.r, 0);
      ctx.shadowBlur = 0;

      for (const n of nodes) {
        if (n.status === "running") {
          const pulse = 0.5 + 0.5 * Math.sin(time * 7);
          const r = 8 + pulse * 4;
          ctx.shadowColor = COLORS.running;
          ctx.shadowBlur = 20 * (0.4 + pulse);
          drawNode(n, COLORS.running, n.label, r, 0);
          ctx.shadowBlur = 0;
        } else {
          const color = COLORS[n.status] || COLORS.pending;
          const flashGlow = n.flash > 0 ? n.flash * 24 : 4;
          ctx.shadowColor = color;
          ctx.shadowBlur = flashGlow;
          drawNode(n, color, n.label, 6, 0);
          ctx.shadowBlur = 0;
          if (n.flash > 0) n.flash = Math.max(0, n.flash - 0.05);
        }
      }

      rafId = requestAnimationFrame(draw);
    }

    function markRunning(slug) {
      const node = nodes.find((n) => n.slug === slug);
      if (node) node.status = "running";
    }

    function markDone(slug, outcome) {
      const node = nodes.find((n) => n.slug === slug);
      if (node) {
        node.status =
          outcome === "pass" ? "pass" : outcome === "inconclusive" ? "inconclusive" : "fail";
        node.flash = 1;
      }
    }

    function reset() {
      for (const n of nodes) {
        n.status = "pending";
        n.flash = 0;
      }
    }

    function start() {
      if (rafId) return;
      layout();
      rafId = requestAnimationFrame(draw);
    }

    function stop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    window.addEventListener("resize", layout);

    return { start, stop, reset, markRunning, markDone };
  }

  window.createPehredarGraph = createPehredarGraph;
})();