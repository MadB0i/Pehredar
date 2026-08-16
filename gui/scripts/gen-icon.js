"use strict";
// Generates the Pehredar app icon (shield + eye motif) as PNG and ICO
// using only Node built-ins (no dependencies). Run: node scripts/gen-icon.js

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const S = 256;
const SHIELD = [
  [128, 4],
  [246, 44],
  [236, 150],
  [128, 254],
  [20, 150],
  [10, 44],
];
const EYE = { cx: 128, cy: 136, rx: 46, ry: 28 };

function inside(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function edgeDist(pts, x, y) {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    min = Math.min(min, segDist(x, y, a[0], a[1], b[0], b[1]));
  }
  return min;
}

function shade(x, y) {
  if (!inside(SHIELD, x, y)) return [0, 0, 0, 0];
  const rim = edgeDist(SHIELD, x, y);
  if (rim <= 3) return [0, 229, 255, 255];
  const ex = x - EYE.cx, ey = y - EYE.cy;
  const inEye = (ex * ex) / (EYE.rx * EYE.rx) + (ey * ey) / (EYE.ry * EYE.ry) <= 1;
  if (inEye) {
    if (ex * ex + ey * ey <= 11 * 11) return [4, 10, 18, 255];
    return [0, 229, 255, 255];
  }
  const t = y / S;
  const r = Math.round(18 - 8 * t);
  const g = Math.round(30 - 14 * t);
  const b = Math.round(50 - 24 * t);
  return [r, g, b, 255];
}

// ---- PNG encoding ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 (0 means 256)
  entry[1] = 0; // height 256
  entry[2] = 0; // colors
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(png.length, 8); // size
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, png]);
}

const rgba = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const [r, g, b, a] = shade(x, y);
    const o = (y * S + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = a;
  }
}

const png = encodePng(S, S, rgba);
const outDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.png"), png);
fs.writeFileSync(path.join(outDir, "icon.ico"), encodeIco(png));
console.log("Generated assets/icon.png and assets/icon.ico");