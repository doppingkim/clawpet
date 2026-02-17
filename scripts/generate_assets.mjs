import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const outDir = '/home/dopping/.openclaw/workspace/clawgotchi/apps/web/public/assets';
fs.mkdirSync(outDir, { recursive: true });

function png(w, h, bg = [0, 0, 0, 0]) {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(p, x, y, bg);
  return p;
}
function setPx(img, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (img.width * y + x) << 2;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}
function rect(img, x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(img, xx, yy, c); }
function lineH(img, x, y, w, c){ for(let i=0;i<w;i++) setPx(img,x+i,y,c); }
function lineV(img, x, y, h, c){ for(let i=0;i<h;i++) setPx(img,x,y+i,c); }
function save(img, name){ fs.writeFileSync(path.join(outDir, name), PNG.sync.write(img)); }

// ROOM 512x512
const room = png(512, 512, [166,138,104,255]);
for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
  const c = ((tx + ty) % 2 === 0) ? [170,142,108,255] : [162,134,100,255];
  rect(room, tx*32, ty*32, 32, 32, c);
}
rect(room,0,0,512,16,[116,94,74,255]); rect(room,0,496,512,16,[116,94,74,255]); rect(room,0,0,16,512,[116,94,74,255]); rect(room,496,0,16,512,[116,94,74,255]);
rect(room,248,16,16,194,[124,102,82,255]); rect(room,248,302,16,194,[124,102,82,255]);
rect(room,176,176,160,160,[153,170,156,255]);
for(let x=176;x<=336;x+=16) lineV(room,x,176,160,[145,160,148,255]);
for(let y=176;y<=336;y+=16) lineH(room,176,y,160,[145,160,148,255]);
// desk+laptop
rect(room,48,56,132,54,[96,72,56,255]); rect(room,88,62,50,26,[58,70,98,255]); rect(room,92,90,42,8,[42,44,52,255]);
// bookshelf
rect(room,40,360,80,112,[92,66,48,255]); [384,416,448].forEach(y=>rect(room,44,y,72,4,[70,50,36,255]));
[[50,366],[66,366],[82,366],[98,366]].forEach((p,i)=>rect(room,p[0],p[1],10,15,[[192,72,72,255],[72,140,192,255],[184,168,80,255],[120,184,104,255]][i]));
// plant
rect(room,192,58,22,18,[130,92,62,255]); rect(room,201,48,4,10,[72,146,84,255]); rect(room,196,52,14,6,[72,146,84,255]);
// calendar
rect(room,208,132,34,34,[232,226,208,255]); rect(room,208,132,34,8,[196,92,92,255]);
// bed
rect(room,316,64,152,78,[206,214,228,255]); rect(room,316,64,20,78,[150,114,90,255]); rect(room,344,76,50,30,[238,240,248,255]);
// basket
rect(room,398,360,68,60,[154,112,74,255]); rect(room,404,368,56,2,[98,72,48,255]); rect(room,404,414,56,2,[98,72,48,255]); rect(room,404,368,2,48,[98,72,48,255]); rect(room,458,368,2,48,[98,72,48,255]);
// lamp
rect(room,332,364,8,78,[120,120,126,255]); rect(room,318,334,36,26,[238,220,156,255]);
save(room,'room.png');

// Character sheet 144x192 (48x48 * 3x4)
const sheet = png(144,192,[0,0,0,0]);
const C={body:[214,92,74,255],dark:[158,56,44,255],eye:[18,18,22,255],blush:[242,170,160,255],claw:[226,112,92,255]};
function crab(frame,row,step=0){
  const ox=frame*48, oy=row*48; const cx=ox+24, cy=oy+28-(step===1?1:0);
  [-10,-5,5,10].forEach((i,k)=>rect(sheet,cx+i-2,cy+10+((k+step)%2),4,4,C.dark));
  rect(sheet,cx-12,cy-10,24,22,C.body); rect(sheet,cx-12,cy-10,24,1,C.dark); rect(sheet,cx-12,cy+11,24,1,C.dark);
  if(row===1){ rect(sheet,cx-22,cy-4,10,10,C.claw); rect(sheet,cx+11,cy-2,6,6,C.claw); }
  else if(row===2){ rect(sheet,cx+12,cy-4,10,10,C.claw); rect(sheet,cx-17,cy-2,6,6,C.claw); }
  else if(row===3){ rect(sheet,cx-18,cy-10,10,10,C.claw); rect(sheet,cx+8,cy-10,10,10,C.claw); }
  else { rect(sheet,cx-18,cy,10,10,C.claw); rect(sheet,cx+8,cy,10,10,C.claw); }
  rect(sheet,cx-6,row===3?cy-6:cy-2,2,2,C.eye); rect(sheet,cx+4,row===3?cy-6:cy-2,2,2,C.eye);
  rect(sheet,cx-10,cy+2,2,2,C.blush); rect(sheet,cx+8,cy+2,2,2,C.blush);
}
for(let r=0;r<4;r++){ crab(0,r,0); crab(1,r,1); crab(2,r,2); }
save(sheet,'character.png');

function icon(name, draw){ const i=png(64,64,[0,0,0,0]); draw(i); save(i,`obj-${name}.png`); }
icon('laptop',i=>{ rect(i,8,20,48,28,[106,82,66,255]); rect(i,16,24,32,14,[62,80,112,255]); rect(i,14,40,36,4,[54,56,64,255]); });
icon('basket',i=>{ rect(i,12,22,40,28,[156,114,76,255]); rect(i,16,26,32,2,[98,72,48,255]); rect(i,16,46,32,2,[98,72,48,255]); rect(i,16,26,2,22,[98,72,48,255]); rect(i,46,26,2,22,[98,72,48,255]); });
icon('bookshelf',i=>{ rect(i,12,8,40,48,[92,66,48,255]); [22,36,50].forEach(y=>rect(i,14,y,36,3,[70,50,36,255])); rect(i,18,10,8,10,[192,72,72,255]); rect(i,30,10,8,10,[72,140,192,255]); rect(i,42,10,8,10,[184,168,80,255]); });
icon('calendar',i=>{ rect(i,14,10,36,42,[232,226,208,255]); rect(i,14,10,36,8,[196,92,92,255]); [24,32,40,48].forEach(y=>lineH(i,18,y,28,[150,150,150,255])); });
icon('bed',i=>{ rect(i,8,18,48,28,[206,214,228,255]); rect(i,8,18,6,28,[150,114,90,255]); rect(i,16,22,14,12,[238,240,248,255]); });
icon('plant',i=>{ rect(i,24,36,16,14,[130,92,62,255]); rect(i,31,14,2,20,[72,146,84,255]); rect(i,22,24,20,10,[66,132,78,255]); });
icon('lamp',i=>{ rect(i,30,22,4,28,[120,120,126,255]); rect(i,18,10,28,12,[238,220,156,255]); });

console.log('generated assets in', outDir);
