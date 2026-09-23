(function () {
  "use strict";

  // Trusted-app allowlist (display layer only — scan verdicts and reports
  // stay technical and unchanged, mirroring the Simple Mode philosophy).
  // Entries are {package, serial|null, addedAt}: a null serial means
  // "trusted on every device", otherwise the trust is scoped to the
  // device it was granted on (per-device baseline).
  // Persisted via settings.json (see DEFAULT_SETTINGS in main.js).

  function serial() {
    return (window.App && window.App.device && window.App.device.serial) || null;
  }

  function clean(list) {
    return (Array.isArray(list) ? list : []).filter(
      (e) => e && typeof e.package === "string" && e.package.trim()
    );
  }

  async function list() {
    try {
      const s = await window.pehredar.settings.get();
      return clean(s && s.allowedPackages);
    } catch (e) {
      return [];
    }
  }

  async function save(entries) {
    await window.pehredar.settings.set({ allowedPackages: entries });
  }

  async function isAllowed(pkg, ser) {
    const cur = ser === undefined ? serial() : ser;
    const all = await list();
    return all.some((e) => e.package === pkg && (!e.serial || !cur || e.serial === cur));
  }

  async function allow(pkg, ser) {
    const cur = ser === undefined ? serial() : ser || null;
    const all = await list();
    if (!all.some((e) => e.package === pkg && (e.serial || null) === cur)) {
      all.push({ package: pkg, serial: cur, addedAt: new Date().toISOString() });
      await save(all);
      return true;
    }
    return false;
  }

  async function unallow(pkg) {
    const all = await list();
    const kept = all.filter((e) => e.package !== pkg);
    if (kept.length !== all.length) {
      await save(kept);
      return true;
    }
    return false;
  }

  window.Allowlist = { list, isAllowed, allow, unallow, serial };
})();
