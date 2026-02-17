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
function stroke(img, x, y, w, h, c) { for (let i=0;i<w;i++){ setPx(img,x+i,y,c); setPx(img,x+i,y+h-1,c);} for(let i=0;i<h;i++){ setPx(img,x,y+i,c); setPx(img,x+w-1,y+i,c);} }
function save(img, name){ fs.writeFileSync(path.join(outDir, name), PNG.sync.write(img)); }

// ===== room =====
const room = png(512, 512, [147, 189, 214, 255]);
const WALL=[147,189,214,255], WALL_D=[102,143,170,255], WALL_DEC=[226,232,210,255];
const WOOD=[181,126,90,255], WOOD_D=[137,90,66,255], WOOD_L=[225,196,125,255];

// wall pattern
for(let y=0;y<512;y+=8){
  for(let x=0;x<512;x+=8){
    if(((x+y)/8)%5===0){ rect(room,x+2,y+3,2,1,WALL_DEC); rect(room,x+4,y+4,1,1,[210,214,192,255]); }
  }
}

// floor area
rect(room,64,74,384,384,WOOD); stroke(room,64,74,384,384,[18,16,18,255]);
for(let y=96;y<448;y+=26) rect(room,66,y,380,2,WOOD_D);
for(let x=84;x<430;x+=58) rect(room,x,90,3,24,WOOD_D);
for(let y=120;y<430;y+=36){ for(let x=130;x<420;x+=120) rect(room,x,y,10,2,WOOD_D); }

// window top
rect(room,180,22,152,44,[239,236,210,255]); stroke(room,180,22,152,44,[130,94,66,255]);
rect(room,255,22,2,44,[130,94,66,255]);

// sunlight cone
for(let y=74;y<430;y++){
  const t=(y-74)/(430-74);
  const half=Math.floor(82 + 130*t);
  const cx=256;
  rect(room,cx-half,y,half*2,1,[236,216,136,150]);
}

save(room,'room-custom.png');

// ===== object icons (64x64 transparent, unified style) =====
function icon(name, draw){ const i=png(64,64,[0,0,0,0]); draw(i); save(i,`obj-${name}.png`); }
const OL=[18,16,18,255], WB=[170,112,77,255], WB2=[132,84,58,255], CREAM=[241,234,210,255];

icon('laptop',i=>{
  rect(i,8,14,48,36,WB); stroke(i,8,14,48,36,OL);
  rect(i,20,20,24,14,[71,125,186,255]); stroke(i,20,20,24,14,[34,52,88,255]);
  rect(i,18,36,28,8,[69,78,104,255]);
  rect(i,24,40,16,2,[42,46,65,255]);
});

icon('bookshelf',i=>{
  rect(i,8,10,48,44,WB); stroke(i,8,10,48,44,OL);
  rect(i,10,26,44,4,WB2);
  const cols=[[196,70,74,255],[62,123,186,255],[80,166,96,255],[192,160,76,255]];
  let x=12; for(let r=0;r<2;r++){ for(let k=0;k<8;k++){ rect(i,x,14+r*16,4,12,cols[(k+r)%cols.length]); x+=5; } x=12; }
});

icon('calendar',i=>{
  rect(i,12,8,40,46,CREAM); stroke(i,12,8,40,46,OL);
  rect(i,12,8,40,8,WB);
  for(let y=22;y<=44;y+=8) rect(i,16,y,32,1,[182,156,122,255]);
  for(let x=20;x<=44;x+=8) rect(i,x,20,1,26,[182,156,122,255]);
  rect(i,36,30,4,4,[192,60,60,255]);
});

icon('basket',i=>{
  rect(i,10,24,44,28,[173,126,77,255]); stroke(i,10,24,44,28,OL);
  rect(i,14,28,36,20,[202,166,106,255]);
  rect(i,22,16,20,4,[132,84,58,255]);
});

icon('vanity',i=>{
  rect(i,8,16,48,30,WB); stroke(i,8,16,48,30,OL);
  rect(i,26,8,12,10,[178,206,227,255]); stroke(i,26,8,12,10,OL);
  rect(i,14,46,6,12,WB2); rect(i,44,46,6,12,WB2);
});

icon('plant',i=>{
  rect(i,24,40,16,14,[138,95,64,255]);
  rect(i,26,26,12,14,[76,146,86,255]);
  rect(i,18,30,10,10,[70,136,80,255]);
  rect(i,36,30,10,10,[70,136,80,255]);
});

// ===== character sheet 3x4 (48x48) =====
const sheet = png(144,192,[0,0,0,0]);
const C={body:[207,94,76,255],dark:[133,52,44,255],ear:[232,183,148,255],belly:[240,220,184,255],eye:[18,16,18,255],bow:[52,112,190,255]};
function crabBear(frame,row,step=0){
  const ox=frame*48, oy=row*48;
  const bob=(step===1?-1:0);
  const cx=ox+24, cy=oy+28+bob;
  // body
  rect(sheet,cx-12,cy-12,24,22,C.body); stroke(sheet,cx-12,cy-12,24,22,C.dark);
  // ears
  rect(sheet,cx-11,cy-15,6,5,C.body); rect(sheet,cx+5,cy-15,6,5,C.body);
  rect(sheet,cx-9,cy-13,2,2,C.ear); rect(sheet,cx+7,cy-13,2,2,C.ear);
  // belly
  rect(sheet,cx-6,cy-2,12,10,C.belly);
  // legs/claws
  const legY=cy+10;
  rect(sheet,cx-14,legY,6,5,C.body); rect(sheet,cx+8,legY,6,5,C.body);
  rect(sheet,cx-9,legY+3,4,4,C.body); rect(sheet,cx+5,legY+3,4,4,C.body);
  rect(sheet,cx-17,cy+2,5,5,C.body); rect(sheet,cx+12,cy+2,5,5,C.body);
  // face
  rect(sheet,cx-5,cy-5,2,2,C.eye); rect(sheet,cx+3,cy-5,2,2,C.eye);
  rect(sheet,cx-1,cy-3,2,2,[146,80,56,255]);
  // bow
  rect(sheet,cx-4,cy+1,8,3,C.bow); rect(sheet,cx-5,cy+1,1,3,[22,52,104,255]); rect(sheet,cx+4,cy+1,1,3,[22,52,104,255]);
  // direction hint
  if(row===1){ rect(sheet,cx-17,cy+2,5,6,C.body); }
  if(row===2){ rect(sheet,cx+12,cy+2,5,6,C.body); }
  if(row===3){ rect(sheet,cx-3,cy+12,6,4,C.dark); }
}
for(let r=0;r<4;r++){ crabBear(0,r,0); crabBear(1,r,1); crabBear(2,r,2); }
save(sheet,'character-custom.png');

console.log('cozy pack generated');
