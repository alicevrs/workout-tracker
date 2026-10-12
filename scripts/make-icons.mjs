// Generates the PWA icons as PNG files without external tools.
// Draws a dumbbell on a dark rounded background. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [13, 13, 13];
const ACCENT = [253, 215, 13];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
// Rounded rectangle test in unit coordinates.
function inRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function dumbbell(scale) {
  const s = (v) => 0.5 + (v - 0.5) * scale;
  const shapes = [
    [0.22, 0.47, 0.78, 0.53, 0.01], // bar
    [0.25, 0.30, 0.33, 0.70, 0.03], // inner plates
    [0.67, 0.30, 0.75, 0.70, 0.03],
    [0.16, 0.36, 0.23, 0.64, 0.025], // outer plates
    [0.77, 0.36, 0.84, 0.64, 0.025],
  ].map(([a, b, c, d, r]) => [s(a), s(b), s(c), s(d), r * scale]);
  return (x, y) => (shapes.some(([a, b, c, d, r]) => inRect(x, y, a, b, c, d, r)) ? ACCENT : BG);
}
const regular = dumbbell(1);
const maskable = dumbbell(0.7); // keep artwork inside the maskable safe zone
writeFileSync('public/icon-192.png', png(192, regular));
writeFileSync('public/icon-512.png', png(512, regular));
writeFileSync('public/apple-touch-icon.png', png(180, regular));
writeFileSync('public/icon-maskable-512.png', png(512, maskable));
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0d0d0d"/><g fill="#fdd70d"><rect x="22" y="47" width="56" height="6" rx="1"/><rect x="25" y="30" width="8" height="40" rx="3"/><rect x="67" y="30" width="8" height="40" rx="3"/><rect x="16" y="36" width="7" height="28" rx="2.5"/><rect x="77" y="36" width="7" height="28" rx="2.5"/></g></svg>`);
console.log('icons written');
