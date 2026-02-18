import fs from 'fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetDir = path.resolve(__dirname, '../apps/web/public/assets');
const inPath = path.join(assetDir, 'character-custom.jpg');
const outPath = path.join(assetDir, 'character-custom.png');

const jpg = jpeg.decode(fs.readFileSync(inPath), { useTArray: true });
const W = jpg.width;
const H = jpg.height;
const FW = Math.floor(W / 3);
const FH = Math.floor(H / 4);

const png = new PNG({ width: W, height: H });

const sat = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

const idx = (w, x, y) => (y * w + x);

for (let frY = 0; frY < 4; frY++) {
  for (let frX = 0; frX < 3; frX++) {
    const ox = frX * FW;
    const oy = frY * FH;

    // 1) foreground seed: colorful pixels only (avoids checker bg)
    const seed = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const gi = ((oy + y) * W + (ox + x)) * 4;
        const r = jpg.data[gi], g = jpg.data[gi + 1], b = jpg.data[gi + 2];
        const s = sat(r, g, b);
        const lum = (r + g + b) / 3;

        const colorful = s > 0.18 && lum > 25;
        const warmBody = r > g + 12 && r > b + 8 && r > 70;
        if (colorful || warmBody) seed[idx(FW, x, y)] = 1;
      }
    }

    // 2) keep largest connected component near center (character body)
    const vis = new Uint8Array(FW * FH);
    let bestComp = [];
    let bestScore = -1;

    const qx = new Int16Array(FW * FH);
    const qy = new Int16Array(FW * FH);

    for (let sy = 0; sy < FH; sy++) {
      for (let sx = 0; sx < FW; sx++) {
        const sp = idx(FW, sx, sy);
        if (!seed[sp] || vis[sp]) continue;

        let qh = 0, qt = 0;
        qx[qt] = sx; qy[qt] = sy; qt++;
        vis[sp] = 1;
        const comp = [];

        while (qh < qt) {
          const x = qx[qh], y = qy[qh]; qh++;
          comp.push([x, y]);
          const nbs = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
          for (const [nx, ny] of nbs) {
            if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
            const np = idx(FW, nx, ny);
            if (!seed[np] || vis[np]) continue;
            vis[np] = 1;
            qx[qt] = nx; qy[qt] = ny; qt++;
          }
        }

        // score: size + center proximity
        let cx = 0, cy = 0;
        comp.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= comp.length; cy /= comp.length;
        const dx = cx - FW / 2;
        const dy = cy - FH / 2;
        const centerPenalty = Math.hypot(dx, dy) * 0.6;
        const score = comp.length - centerPenalty;

        if (score > bestScore) {
          bestScore = score;
          bestComp = comp;
        }
      }
    }

    const mask = new Uint8Array(FW * FH);
    bestComp.forEach(([x, y]) => (mask[idx(FW, x, y)] = 1));

    // 3) dilate to recover outline + nearby dark edges
    for (let pass = 0; pass < 3; pass++) {
      const next = new Uint8Array(mask);
      for (let y = 1; y < FH - 1; y++) {
        for (let x = 1; x < FW - 1; x++) {
          const p = idx(FW, x, y);
          if (mask[p]) continue;

          let around = 0;
          for (let yy = -1; yy <= 1; yy++) {
            for (let xx = -1; xx <= 1; xx++) {
              if (xx === 0 && yy === 0) continue;
              if (mask[idx(FW, x + xx, y + yy)]) around++;
            }
          }

          if (around >= 2) {
            const gi = ((oy + y) * W + (ox + x)) * 4;
            const r = jpg.data[gi], g = jpg.data[gi + 1], b = jpg.data[gi + 2];
            const s = sat(r, g, b);
            const lum = (r + g + b) / 3;
            // include dark outlines and shadow near character
            if (lum < 85 || s > 0.14 || (r > g + 10 && r > b + 6)) {
              next[p] = 1;
            }
          }
        }
      }
      mask.set(next);
    }

    // 4) write RGBA with transparent background
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const gi = ((oy + y) * W + (ox + x)) * 4;
        const p = idx(FW, x, y);
        png.data[gi] = jpg.data[gi];
        png.data[gi + 1] = jpg.data[gi + 1];
        png.data[gi + 2] = jpg.data[gi + 2];
        png.data[gi + 3] = mask[p] ? 255 : 0;
      }
    }
  }
}

fs.writeFileSync(outPath, PNG.sync.write(png));
console.log('saved', outPath);
