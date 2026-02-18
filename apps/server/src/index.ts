import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadCategories, getCategories, analyzeCategory } from './categories.js';
import { connectToGateway, getGatewayStatus, getCurrentTaskState } from './gateway-listener.js';
// [disabled] 방 성장 시스템 — 추후 재활성화 예정
// import { loadTaskHistory, recordTask, checkUpgrades, getRoomUpgrades } from './room-growth.js';

const app = express();
app.use(cors());
app.use(express.json());
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

// 혼잣말 상태
let monologueEnabled = true;
let monologueTimer: ReturnType<typeof setInterval> | null = null;

// openclaw.json에서 gateway 설정을 직접 읽기
function loadOpenClawConfig() {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function resolveRequiredGatewayConfig() {
  const cfg = loadOpenClawConfig();
  if (!cfg) {
    throw new Error(
      `[init] missing ${OPENCLAW_CONFIG_PATH}. ClawGotchi requires OpenClaw Gateway integration.`
    );
  }

  const port = Number(cfg?.gateway?.port || 18789);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('[init] invalid gateway.port in openclaw.json');
  }

  const token = String(cfg?.gateway?.auth?.token || '').trim();
  if (!token) {
    throw new Error('[init] missing gateway.auth.token in openclaw.json');
  }

  return { port, token };
}

function resolveAssistantName() {
  const cfg = loadOpenClawConfig();
  if (cfg?.identity?.name) return cfg.identity.name;
  const candidates = [
    path.resolve(process.cwd(), '../../../IDENTITY.md'),
    path.resolve(process.cwd(), '../../IDENTITY.md'),
    path.resolve(process.cwd(), '../IDENTITY.md')
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const m = text.match(/Name:\*\*\s*([^\n]+)/i) || text.match(/-\s*\*\*Name:\*\*\s*([^\n]+)/i) || text.match(/-\s*Name:\s*([^\n]+)/i);
    if (m?.[1]) return m[1].trim();
  }
  return 'Claw';
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/profile', (_req, res) => res.json({ assistantName: resolveAssistantName() }));

// 카테고리 API
app.get('/categories', (_req, res) => {
  res.json({ categories: getCategories() });
});

// 디버그: Gateway 연결 상태 확인
app.get('/debug/gateway', (_req: any, res: any) => {
  res.json(getGatewayStatus());
});

const gatewayConfig = resolveRequiredGatewayConfig();

const server = app.listen(8787, () => {
  console.log('ClawGotchi server on http://localhost:8787');
});

const wss = new WebSocketServer({ server, path: '/events' });

// 새 클라이언트 연결 시 현재 작업 상태 즉시 전송
wss.on('connection', (client) => {
  const state = getCurrentTaskState();
  if (state) {
    console.log('[ws] new client — sending current task state: %s', state.category);
    client.send(JSON.stringify(state));
  }
});

function broadcast(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

// 카테고리 레지스트리 로드
loadCategories();
// [disabled] loadTaskHistory();

// Gateway WS 리스너 시작
connectToGateway(gatewayConfig.port, gatewayConfig.token, broadcast);

async function sendToOpenClaw(message: string): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  const gatewayUrl = `http://127.0.0.1:${gatewayConfig.port}`;
  const token = gatewayConfig.token;
  const sessionKey = 'agent:main:main';

  console.log('[chat] gateway=%s sessionKey=%s msg=%s', gatewayUrl, sessionKey, message);

  try {
    const url = `${gatewayUrl}/tools/invoke`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        tool: 'sessions_send',
        args: {
          sessionKey,
          message: `[100자 이내로 한국어로 대답해줘] ${message}`,
          timeoutSeconds: 60
        }
      })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[chat] HTTP %d: %s', r.status, body.slice(0, 300));
      return { ok: false, reason: `http-${r.status}` };
    }
    const data: any = await r.json();
    console.log('[chat] response:', JSON.stringify(data).slice(0, 500));
    if (data?.ok !== true) return { ok: false, reason: 'invoke-failed' };

    // details.status 또는 content 내부 status 체크
    const detailsStatus = data?.result?.details?.status;

    // result.content[0].text 안의 JSON에서 reply 추출
    let reply = '';
    let parsedStatus = '';
    try {
      const contentText = data?.result?.content?.[0]?.text || '';
      const parsed = JSON.parse(contentText);
      reply = parsed?.reply || '';
      parsedStatus = parsed?.status || '';
    } catch {
      reply = data?.result?.content?.[0]?.text || '';
    }

    // 타임아웃 처리
    const status = parsedStatus || detailsStatus || '';
    if (status === 'timeout') {
      console.warn('[chat] agent timed out');
      return { ok: true, reply: '음... 좀 더 생각해볼게요!' };
    }

    // [[reply_to_current]] 마커 및 이모지 프리픽스 정리
    reply = reply
      .replace(/\[\[reply_to_current\]\]/g, '')
      .trim()
      .replace(/^🦞\s*/, '')
      .replace(/\n+/g, ' ')
      .trim();

    console.log('[chat] extracted reply:', reply);
    return { ok: true, reply: reply || '네!' };
  } catch (err) {
    console.error('[chat] network error:', err);
    return { ok: false, reason: 'network' };
  }
}

app.post('/emit', (req: any, res: any) => {
  const body = req.body || {};

  // 카테고리 분석: body.category가 없으면 summary에서 추출
  let category = body.category || 'other';
  if (body.summary && category === 'other') {
    const matched = analyzeCategory(body.summary);
    if (matched) category = matched.id;
  }

  // [disabled] 방 성장 시스템 — 추후 재활성화 예정
  // recordTask(category);
  // const newUpgrades = checkUpgrades();
  // if (newUpgrades.length > 0) {
  //   console.log('[room-growth] new upgrades:', newUpgrades.map(u => u.label).join(', '));
  // }

  broadcast({
    id: body.id || Date.now().toString(),
    ts: body.ts || Date.now(),
    category,
    status: body.status || 'working',
    summary: body.summary || ''
  });
  res.json({ ok: true });
});

// --- 혼잣말 시스템 ---
app.get('/monologue/status', (_req: any, res: any) => {
  res.json({ enabled: monologueEnabled });
});

app.post('/monologue/toggle', (req: any, res: any) => {
  const body = req.body || {};
  if (typeof body.enabled === 'boolean') {
    monologueEnabled = body.enabled;
  } else {
    monologueEnabled = !monologueEnabled;
  }
  console.log('[monologue] toggled to:', monologueEnabled);
  // 프론트엔드에 상태 알림
  broadcast({ type: 'monologue-status', enabled: monologueEnabled });
  res.json({ ok: true, enabled: monologueEnabled });
});

async function generateMonologue() {
  if (!monologueEnabled) return;
  console.log('[monologue] generating self-talk...');
  const result = await sendToOpenClaw(
    '혼잣말을 하나 해줘. 지금 네 기분이나 하고 싶은 것, 궁금한 것 등을 100자 이내로 자연스럽게 혼잣말처럼 말해줘. "..." 같은 표현도 좋아. 대답 형식이 아니라 진짜 혼잣말이어야 해.'
  );
  if (result.ok && result.reply) {
    console.log('[monologue] generated:', result.reply);
    broadcast({
      type: 'monologue',
      text: result.reply.slice(0, 100),
      ts: Date.now()
    });
  } else {
    console.warn('[monologue] generation failed:', result.ok ? 'empty' : (result as any).reason);
  }
}

// 10분(600000ms)마다 혼잣말 생성
function startMonologueTimer() {
  if (monologueTimer) clearInterval(monologueTimer);
  monologueTimer = setInterval(() => {
    if (monologueEnabled) generateMonologue();
  }, 10 * 60 * 1000); // 10분
  console.log('[monologue] timer started (every 10 min)');
}
startMonologueTimer();

// 외부 cron에서 트리거 (서버 내장 타이머의 보조)
app.post('/monologue/trigger', (_req: any, res: any) => {
  if (!monologueEnabled) {
    return res.json({ ok: false, reason: 'disabled' });
  }
  generateMonologue();
  res.json({ ok: true });
});

app.post('/chat', async (req, res) => {
  const msg = String(req.body?.message || '').trim().slice(0, 100);
  if (!msg) return res.json({ reply: '네!' });

  // 혼잣말 on/off 자연어 처리
  const msgLower = msg.toLowerCase();
  const isMonologueCmd = msgLower.includes('혼잣말');
  if (isMonologueCmd) {
    const turnOff = msgLower.includes('그만') || msgLower.includes('끄') || msgLower.includes('중지') || msgLower.includes('멈춰') || msgLower.includes('없애') || msgLower.includes('꺼');
    const turnOn = msgLower.includes('켜') || msgLower.includes('시작') || msgLower.includes('다시') || msgLower.includes('해줘');
    if (turnOff) {
      monologueEnabled = false;
      broadcast({ type: 'monologue-status', enabled: false });
      return res.json({ reply: '혼잣말 그만할게요... 🤐' });
    } else if (turnOn) {
      monologueEnabled = true;
      broadcast({ type: 'monologue-status', enabled: true });
      return res.json({ reply: '혼잣말 다시 시작할게요! 🗣️' });
    }
  }
  // "10분마다" 관련 자연어도 처리
  if ((msgLower.includes('10분') || msgLower.includes('십분')) && (msgLower.includes('그만') || msgLower.includes('끄') || msgLower.includes('멈'))) {
    monologueEnabled = false;
    broadcast({ type: 'monologue-status', enabled: false });
    return res.json({ reply: '알겠어요, 10분마다 말하는 거 그만할게요! 🤐' });
  }

  const sent = await sendToOpenClaw(msg);

  if (sent.ok) {
    return res.json({ reply: sent.reply.slice(0, 100) });
  }

  console.warn('[chat] send failed reason=%s', sent.reason);
  const reasonMap: Record<string, string> = {
    'no-token': '토큰 미설정',
    'network': '게이트웨이 꺼짐',
    'http-401': '인증 실패',
    'http-404': '도구 미허용',
    'http-429': '요청 제한',
    'invoke-failed': '실행 실패',
  };
  const reply = reasonMap[sent.reason] || `실패: ${sent.reason}`;
  return res.json({ reply: reply.slice(0, 100) });
});

if (process.env.MOCK_EVENTS === '1') {
  const categories = ['coding', 'shopping', 'calendar', 'writing', 'research'] as const;
  const steps = [
    { status: 'thinking', summary: '요청을 3단계로 나누는 중...' },
    { status: 'working', summary: '핵심 자료를 확인하는 중...' },
    { status: 'working', summary: '결과를 정리하는 중...' },
    { status: 'done', summary: '완료! 전달 준비 끝.' }
  ];
  let i = 0;
  setInterval(() => {
    const category = categories[i % categories.length];
    const step = steps[i % steps.length];
    broadcast({ id: Date.now().toString(), ts: Date.now(), category, ...step });
    i++;
  }, 3500);
}
