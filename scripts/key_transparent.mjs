import fs from 'fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('usage: node key_transparent.mjs <in.jpg> <out.png>');
  process.exit(1);
}

const jpg = jpeg.decode(fs.readFileSync(inPath), { useTArray: true });
const w = jpg.width, h = jpg.height;
const png = new PNG({ width: w, height: h });

const idx = (x, y) => (y * w + x) * 4;
const sat = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

for (let i = 0; i < jpg.data.length; i += 4) {
  const r = jpg.data[i], g = jpg.data[i + 1], b = jpg.data[i + 2];
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
}

const visited = new Uint8Array(w * h);
const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
let qh = 0, qt = 0;
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const p = y * w + x;
  if (visited[p]) return;
  visited[p] = 1;
  qx[qt] = x; qy[qt] = y; qt++;
};

for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

while (qh < qt) {
  const x = qx[qh], y = qy[qh]; qh++;
  const i = idx(x, y);
  const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  const lum = (r + g + b) / 3;
  const neutral = Math.abs(r - g) < 18 && Math.abs(g - b) < 18;
  const checkerLike = neutral && sat(r, g, b) < 0.15 && lum > 120 && lum < 250;
  const whiteLike = neutral && lum > 238;

  if (!(checkerLike || whiteLike)) continue;
  png.data[i + 3] = 0;

  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

// fringe cleanup
for (let y = 1; y < h - 1; y++) {
  for (let x = 1; x < w - 1; x++) {
    const i = idx(x, y);
    if (png.data[i + 3] === 0) continue;
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    const lum = (r + g + b) / 3;
    const neutral = Math.abs(r - g) < 14 && Math.abs(g - b) < 14;
    if (!(neutral && lum > 220)) continue;
    let t = 0;
    for (let yy = -1; yy <= 1; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        if (xx === 0 && yy === 0) continue;
        const ni = idx(x + xx, y + yy);
        if (png.data[ni + 3] === 0) t++;
      }
    }
    if (t >= 5) png.data[i + 3] = 0;
  }
}

fs.writeFileSync(outPath, PNG.sync.write(png));
console.log('saved', outPath);
