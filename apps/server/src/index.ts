import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use(cors());
app.use(express.json());

// openclaw.json에서 gateway 설정을 직접 읽기 (텔레그램과 동일 경로)
function loadOpenClawConfig() {
  try {
    const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(cfgPath)) return null;
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
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

const server = app.listen(8787, () => {
  console.log('ClawGotchi server on http://localhost:8787');
});

const wss = new WebSocketServer({ server, path: '/events' });

function broadcast(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

async function sendToOpenClaw(message: string): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  const cfg = loadOpenClawConfig();
  if (!cfg) return { ok: false, reason: 'no-config' };

  const port = cfg?.gateway?.port || 18789;
  const gatewayUrl = `http://127.0.0.1:${port}`;
  const token = cfg?.gateway?.auth?.token || '';
  const sessionKey = 'agent:main:main';

  if (!token) return { ok: false, reason: 'no-token' };

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
      // content가 JSON이 아닌 경우 그대로 사용
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

app.post('/emit', (req, res) => {
  const body = req.body || {};
  broadcast({
    id: body.id || Date.now().toString(),
    ts: body.ts || Date.now(),
    category: body.category || 'other',
    status: body.status || 'working',
    summary: body.summary || ''
  });
  res.json({ ok: true });
});

app.post('/chat', async (req, res) => {
  const msg = String(req.body?.message || '').trim().slice(0, 100);
  if (!msg) return res.json({ reply: '네!' });

  // OpenClaw 세션으로 메시지 전달 (텔레그램과 동일 경로: sessions_send)
  const sent = await sendToOpenClaw(msg);

  if (sent.ok) {
    return res.json({ reply: sent.reply.slice(0, 100) });
  }

  // 실패 원인별 사용자 피드백
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
  return res.json({ reply: reply.slice(0, 20) });
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
