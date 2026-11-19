// Draws the app icons (the sunset from public/icon.svg) as PNG files for the
// home screen. No image libraries needed: each pixel is computed and the PNG
// is written with Node's zlib. Run with `npm run icons`; the PNGs are kept in
// the repository, so this only needs to run again when the icon changes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#140B24');
const PINK = hex('#FF4FA3');
const ORANGE = hex('#FF9A3C');
const TEAL = hex('#3DE3D0');
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function inRoundRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Colour at a point of the 64 x 64 design, or null outside the icon. */
function shade(u: number, v: number, rounded: boolean): RGB | null {
  if (rounded && !inRoundRect(u, v, 0, 0, 64, 64, 14)) return null;
  // Soft pink glow behind the sun.
  const d = Math.hypot(u - 32, v - 34);
  let c = mix(BG, PINK, 0.32 * Math.max(0, 1 - d / 30) ** 1.6);
  const inSun = d <= 18;
  if (inSun) c = mix(PINK, ORANGE, Math.min(1, Math.max(0, (v - 16) / 36)));
  const stripe = u >= 10 && u <= 54 && ((v >= 36 && v <= 39) || (v >= 42 && v <= 46) || (v >= 49 && v <= 55));
  if (inSun && stripe) c = BG;
  if (inRoundRect(u, v, 8, 52, 56, 55, 1.5)) c = TEAL;
  return c;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** size in pixels; `rounded` cuts the corners; `scale` < 1 shrinks the art (maskable safe zone). */
function render(size: number, rounded: boolean, scale = 1): Buffer {
  const SS = 4; // 4 x 4 samples per pixel for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = ((x + (sx + 0.5) / SS) / size) * 64;
          const py = ((y + (sy + 0.5) / SS) / size) * 64;
          const u = 32 + (px - 32) / scale;
          const v = 32 + (py - 32) / scale;
          const c = shade(u, v, rounded) ?? (rounded ? null : BG);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const n = SS * SS;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // bit depth
  head[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = 'public/icons';
mkdirSync(out, { recursive: true });
const files: [string, Buffer][] = [
  ['icon-192.png', render(192, true)],
  ['icon-512.png', render(512, true)],
  ['maskable-512.png', render(512, false, 0.8)],
  ['apple-touch-icon.png', render(180, false, 0.9)], // iOS rounds the corners itself
];
for (const [name, png] of files) {
  writeFileSync(`${out}/${name}`, png);
  console.log(`${out}/${name}  ${(png.length / 1024).toFixed(1)} kB`);
}
