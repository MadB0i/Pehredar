"use strict";
// Generates electron-updater metadata (latest.yml / latest-linux.yml) from
// already-built installer artifacts, so the GitHub Release can serve as
// the update server. Run in CI after downloading the per-platform assets:
//
//   node scripts/generate-update-meta.js --assets release-assets/win --version 1.1.0
//
// The emitted files are uploaded to the same release next to the
// installers. `version` must equal the app version (gui/package.json);
// the release tag must be v<version>.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sha512Base64(file) {
  return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64");
}

function installerFor(dir, ext) {
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(ext) && !n.endsWith(".blockmap"))
    .sort();
  if (names.length !== 1) {
    throw new Error(`expected exactly one *${ext} in ${dir}, found: ${names.join(", ") || "none"}`);
  }
  return names[0];
}

function writeMeta(outDir, fileName, version, installer) {
  const full = path.join(outDir, installer);
  const sum = sha512Base64(full);
  const size = fs.statSync(full).size;
  const yml =
    `version: ${version}\n` +
    `files:\n` +
    `  - url: ${installer}\n` +
    `    sha512: ${sum}\n` +
    `    size: ${size}\n` +
    `path: ${installer}\n` +
    `sha512: ${sum}\n` +
    `releaseDate: '${new Date().toISOString()}'\n`;
  fs.writeFileSync(path.join(outDir, fileName), yml);
  console.log(`wrote ${fileName} for ${installer} (${(size / 1048576).toFixed(1)} MiB)`);
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  const assets = get("--assets");
  const version = get("--version");
  if (!assets || !version) {
    console.error("usage: node scripts/generate-update-meta.js --assets <dir> --version <x.y.z>");
    process.exit(1);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`refusing: version must be x.y.z, got '${version}'`);
    process.exit(1);
  }
  let wrote = 0;
  for (const [ext, meta] of [[".exe", "latest.yml"], [".AppImage", "latest-linux.yml"]]) {
    try {
      writeMeta(assets, meta, version, installerFor(assets, ext));
      wrote += 1;
    } catch (e) {
      if (e.message.startsWith("expected exactly one")) {
        console.log(`skip ${meta}: ${e.message}`);
      } else {
        throw e;
      }
    }
  }
  if (!wrote) {
    console.error(`no installers found in ${assets}`);
    process.exit(1);
  }
}

main();
