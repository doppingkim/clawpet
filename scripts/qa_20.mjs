import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/dopping/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core');

const WEB_CANDIDATES = ['http://localhost:5173', 'http://localhost:5174'];
const API = 'http://localhost:8787';
let BASE = WEB_CANDIDATES[0];
const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

async function health(url) { try { const r = await fetch(url); return r.ok; } catch { return false; } }
async function run(name, fn) { try { const r = await fn(); add(name, !!(r?.pass ?? r), r?.detail || ''); } catch (e) { add(name, false, String(e).slice(0, 180)); } }

async function bubbleText(page) {
  const bubble = page.locator('.petBubble').first();
  if (await bubble.count() === 0) return '';
  return ((await bubble.textContent()) || '').trim();
}

async function waitBubbleContains(page, keywords, timeoutMs = 45000, stepMs = 700) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await bubbleText(page);
    if (t && keywords.some((k) => t.includes(k))) return { ok: true, text: t };
    await page.waitForTimeout(stepMs);
  }
  return { ok: false, text: '' };
}

const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

await run('01 web server up', async () => {
  for (const c of WEB_CANDIDATES) {
    if (await health(c)) { BASE = c; return { pass: true, detail: c }; }
  }
  return { pass: false, detail: 'no web dev server on 5173/5174' };
});
await run('02 event server up', async () => health(`${API}/health`));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

await run('03 room visible', async () => page.locator('.roomCanvas').isVisible());
await run('04 gauge count = 3', async () => (await page.locator('.hudBar').count()) === 3);
await run('05 action buttons = 3 (🍙🤲/)', async () => (await page.locator('.pixelBtn').count()) === 3);
await run('06 top tooltip visible (not clipped)', async () => {
  await page.locator('.hudBar').first().hover();
  await page.waitForTimeout(120);
  const tip = page.locator('.gaugeTip.tipDown');
  return (await tip.count()) > 0 && (await tip.first().isVisible());
});
await run('07 top tooltip has percent', async () => /\d+%/.test((await page.locator('.gaugeTip').first().textContent()) || ''));
await run('08 tap tooltip works', async () => { await page.locator('.hudBar').nth(1).click(); await page.waitForTimeout(120); return (await page.locator('.gaugeTip').count()) > 0; });

await run('09 feed limit after 2', async () => {
  const btn = page.locator('.pixelBtn').first();
  await btn.click(); await page.waitForTimeout(100);
  await btn.click(); await page.waitForTimeout(100);
  await btn.click(); await page.waitForTimeout(160);
  const t = await bubbleText(page);
  return t.includes('한번에 다 못먹어요!');
});

await run('10 pet limit after 3', async () => {
  const btn = page.locator('.pixelBtn').nth(1);
  await btn.click(); await page.waitForTimeout(80);
  await btn.click(); await page.waitForTimeout(80);
  await btn.click(); await page.waitForTimeout(80);
  await btn.click(); await page.waitForTimeout(160);
  const t = await bubbleText(page);
  return t.includes('너무 많이 쓰다듬는 거아니에요?');
});

await run('11 task emit accepted', async () => (await fetch(`${API}/emit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'coding', status: 'working' }) })).ok);
await run('12 task bubble single line', async () => {
  await page.waitForTimeout(260);
  const t = await bubbleText(page);
  return t.length > 0 && !t.includes('\n') && t.includes('코딩 작업');
});

await run('13 click claw reaction bubble', async () => {
  const c = await page.locator('.roomCanvas').boundingBox();
  if (!c) return false;
  let hit = false;
  for (let y = 180; y <= 420 && !hit; y += 60) {
    for (let x = 160; x <= 380 && !hit; x += 60) {
      await page.mouse.click(c.x + (x / 512) * c.width, c.y + (y / 512) * c.height);
      await page.waitForTimeout(120);
      const t = await bubbleText(page);
      if (t.includes('왜요?')) hit = true;
    }
  }
  return hit;
});

await run('14 idle FSM defined (step count)', async () => {
  const src = fs.readFileSync('/home/dopping/.openclaw/workspace/clawgotchi/apps/web/src/store/usePetStore.ts', 'utf8');
  const n = (src.match(/\{\s*target:\s*'/g) || []).length;
  return n >= 15;
});

await run('15 idle includes watering + shelf-cleaning steps', async () => {
  const src = fs.readFileSync('/home/dopping/.openclaw/workspace/clawgotchi/apps/web/src/store/usePetStore.ts', 'utf8');
  return ['물 주러 가야겠다', '칙칙~', '책장 앞까지 이동 중...', '책장 먼지 털어주는 중...'].every((k) => src.includes(k));
});

await run('16 idle routine keywords defined', async () => {
  const src = fs.readFileSync('/home/dopping/.openclaw/workspace/clawgotchi/apps/web/src/store/usePetStore.ts', 'utf8');
  const all = ['청소 상태 확인 중...', '책장 앞까지 이동 중...', '책장 먼지 털어주는 중...', '장바구니 정리 중...', "effect: 'dust'"];
  return all.every((k) => src.includes(k));
});

await run('17 room still loads after image swap', async () => page.locator('.roomCanvas').isVisible());
await run('18 font applied', async () => (await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toLowerCase().includes('press start'));
await run('19 bubble viewport safe (or hidden)', async () => {
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(250);
    const bubble = page.locator('.petBubble').first();
    if (await bubble.count() === 0) continue;
    const b = await bubble.boundingBox();
    if (!b) continue;
    return b.x >= 0 && b.y >= 0;
  }
  return true;
});

await run('20 slash chat opens + 20 chars max', async () => {
  await page.keyboard.press('/');
  await page.waitForTimeout(120);
  const input = page.locator('.chatBox input');
  if (await input.count() === 0) return false;
  await input.fill('1234567890123456789012345');
  const v = await input.inputValue();
  return v.length <= 20;
});

await browser.close();

const lines = ['| # | Check | Result | Detail |', '|---|---|---|---|'];
checks.forEach((c, i) => lines.push(`| ${i + 1} | ${c.name} | ${c.pass ? '✅ PASS' : '❌ FAIL'} | ${c.detail || ''} |`));
const md = lines.join('\n');
fs.writeFileSync('/home/dopping/.openclaw/workspace/clawgotchi/QA_CHECKLIST_20.md', md);
console.log(md);
