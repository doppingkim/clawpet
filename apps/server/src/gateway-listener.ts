/**
 * OpenClaw Gateway WebSocket 리스너
 * Gateway에 operator로 연결하여 agent 이벤트를 실시간 수신
 */
import WebSocket from 'ws';
import { analyzeCategory } from './categories.js';

type BroadcastFn = (payload: unknown) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let connected = false;
let gatewayPort = 0;
let gatewayToken = '';

// 디버그용 상태
export function getGatewayStatus() {
    return {
        connected,
        retryCount,
        wsState: ws?.readyState ?? -1,
        currentRunId,
        currentPhase,
        broadcastedCategory,
        pendingTextLength: pendingText.length,
    };
}

export function connectToGateway(
    port: number,
    token: string,
    broadcast: BroadcastFn
) {
    if (ws) {
        try { ws.close(); } catch { /* noop */ }
    }

    gatewayPort = port;
    gatewayToken = token;
    const url = `ws://127.0.0.1:${port}`;
    console.log('[gateway-ws] connecting to', url, '(attempt %d)', retryCount + 1);

    try {
        ws = new WebSocket(url, {
            headers: { Origin: `http://127.0.0.1:${port}` }
        });
    } catch (err) {
        console.error('[gateway-ws] failed to create WebSocket:', err);
        scheduleReconnect(port, token, broadcast);
        return;
    }

    let challengeNonce = '';

    ws.on('open', () => {
        console.log('[gateway-ws] connected, waiting for challenge...');
    });

    const sendConnect = () => {
        const connectFrame = {
            type: 'req',
            id: `clawgotchi-${Date.now()}`,
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'openclaw-control-ui',
                    version: '0.1.0',
                    platform: 'linux',
                    mode: 'ui'
                },
                role: 'operator',
                scopes: ['operator.read'],
                caps: [],
                commands: [],
                permissions: {},
                auth: { token },
                locale: 'ko-KR',
                userAgent: 'clawgotchi/0.1.0',
                device: {
                    id: 'clawgotchi-device-001',
                    publicKey: 'clawgotchi-pk-placeholder',
                    signature: 'clawgotchi-sig-placeholder',
                    signedAt: Date.now(),
                    nonce: challengeNonce || 'clawgotchi-nonce'
                }
            }
        };
        ws!.send(JSON.stringify(connectFrame));
        console.log('[gateway-ws] sent connect request');
    };

    // challenge 없이도 2초 후 connect 시도
    const fallbackTimer = setTimeout(() => {
        if (ws?.readyState === 1) sendConnect();
    }, 2000);

    ws.on('message', (data: any) => {
        try {
            const msg = JSON.parse(data.toString());

            // challenge 이벤트가 오면 nonce 캡처 후 connect
            if (msg.type === 'event' && msg.event === 'connect.challenge') {
                challengeNonce = msg.payload?.nonce || 'local';
                clearTimeout(fallbackTimer);
                sendConnect();
                return;
            }

            handleGatewayMessage(msg, broadcast);
        } catch {
            // non-JSON frame, ignore
        }
    });

    ws.on('close', (code: number) => {
        console.log('[gateway-ws] disconnected, code:', code);
        ws = null;
        connected = false;
        clearTimeout(fallbackTimer);
        scheduleReconnect(port, token, broadcast);
    });

    ws.on('error', (err: any) => {
        console.error('[gateway-ws] error:', (err as Error).message);
    });
}

function scheduleReconnect(port: number, token: string, broadcast: BroadcastFn) {
    if (reconnectTimer) return;
    retryCount++;
    // 무한 재시도 — 점진적 백오프 (최대 60초)
    const delay = Math.min(retryCount * 5000, 60000);
    console.log('[gateway-ws] will reconnect in %ds... (attempt %d)', delay / 1000, retryCount);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToGateway(port, token, broadcast);
    }, delay);
}

function handleGatewayMessage(msg: any, broadcast: BroadcastFn) {
    // 모든 메시지 디버그 로깅
    const msgType = msg.type || '?';
    const msgEvent = msg.event || '';
    const msgMethod = msg.method || '';
    if (msgType !== 'event' || msgEvent !== 'connect.challenge') {
        console.log('[gateway-ws] msg: type=%s event=%s method=%s keys=%s',
            msgType, msgEvent, msgMethod, Object.keys(msg).join(','));
    }

    // hello-ok 응답
    if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
        console.log('[gateway-ws] handshake OK, protocol:', msg.payload.protocol);
        retryCount = 0;
        connected = true;
        // 연결 직후 현재 세션 상태 확인
        probeActiveSession(broadcast);
        return;
    }

    // agent 이벤트 — 다양한 이벤트명 처리
    if (msg.type === 'event' && (msg.event === 'agent' || msg.event?.startsWith('agent.'))) {
        handleAgentEvent(msg.payload || msg.data || msg, broadcast);
        return;
    }

    // session 이벤트도 agent 활동으로 처리
    if (msg.type === 'event' && (msg.event === 'session' || msg.event?.startsWith('session.'))) {
        console.log('[gateway-ws] session event: %s payload=%s', msg.event, JSON.stringify(msg.payload || msg.data || {}).slice(0, 200));
        const payload = msg.payload || msg.data || {};
        if (payload.stream || payload.phase || payload.runId) {
            handleAgentEvent(payload, broadcast);
        }
        return;
    }

    // res 에러
    if (msg.type === 'res' && !msg.ok) {
        console.warn('[gateway-ws] error response:', JSON.stringify(msg.error || msg).slice(0, 300));
        return;
    }
}

// 스트리밍 상태 추적
let pendingText = '';
let currentRunId = '';
let broadcastedCategory = '';
let lastSummaryBroadcast = 0;
let currentPhase: 'idle' | 'working' = 'idle';

/** 현재 진행 중인 작업 상태 반환 (없으면 null) */
export function getCurrentTaskState() {
    if (currentPhase !== 'working') return null;
    return {
        id: Date.now().toString(),
        ts: Date.now(),
        category: broadcastedCategory || 'other',
        status: 'working',
        summary: pendingText.slice(0, 100)
    };
}

/**
 * Gateway WS를 통해 현재 활성 세션을 확인.
 * WS 이벤트를 놓친 경우(서버가 나중에 시작됨) 보정용.
 */
function probeActiveSession(broadcast: BroadcastFn) {
    if (!ws || ws.readyState !== 1) return;

    // WS 프로토콜로 sessions.list 요청
    const probeId = `probe-${Date.now()}`;
    const probeFrame = {
        type: 'req',
        id: probeId,
        method: 'sessions.list',
        params: {}
    };

    // 응답 핸들러 (일회성)
    const handler = (data: any) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.id !== probeId) return; // 다른 응답 무시

            ws?.off('message', handler);
            console.log('[gateway-probe] response:', JSON.stringify(msg).slice(0, 500));

            if (!msg.ok) {
                console.log('[gateway-probe] sessions.list not supported, trying fallback');
                probeFallback(broadcast);
                return;
            }

            // 세션 목록에서 busy인 것 찾기
            const payload = msg.payload || msg.result || {};
            const sessions = payload.sessions || payload.data || (Array.isArray(payload) ? payload : []);
            const active = sessions.find((s: any) =>
                s.status === 'busy' || s.status === 'active' || s.status === 'running' || s.busy === true
            );

            if (active) {
                console.log('[gateway-probe] found active session:', JSON.stringify(active).slice(0, 200));
                currentPhase = 'working';
                broadcast({
                    id: Date.now().toString(),
                    ts: Date.now(),
                    category: 'other',
                    status: 'working',
                    summary: ''
                });
            } else {
                console.log('[gateway-probe] no active session (count=%d)', sessions.length);
            }
        } catch { /* noop */ }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(probeFrame));
    console.log('[gateway-probe] sent sessions.list request');

    // 3초 타임아웃 후 핸들러 정리
    setTimeout(() => {
        ws?.off('message', handler);
    }, 3000);
}

/**
 * sessions.list가 안 되면 sessions_send로 간접 확인
 */
async function probeFallback(broadcast: BroadcastFn) {
    if (!gatewayPort || !gatewayToken) return;
    const url = `http://127.0.0.1:${gatewayPort}`;

    try {
        // 매우 짧은 타임아웃(2초)으로 세션에 ping
        const r = await fetch(`${url}/tools/invoke`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${gatewayToken}`
            },
            body: JSON.stringify({
                tool: 'sessions_send',
                args: {
                    sessionKey: 'agent:main:main',
                    message: '[[ping]]',
                    timeoutSeconds: 2
                }
            })
        });

        const data: any = await r.json();
        console.log('[gateway-probe-fallback] response:', JSON.stringify(data).slice(0, 300));

        // 타임아웃이면 에이전트가 바쁨 = 작업 중
        const contentText = data?.result?.content?.[0]?.text || '';
        let status = '';
        try { status = JSON.parse(contentText)?.status || ''; } catch { /* noop */ }
        const detailsStatus = data?.result?.details?.status || '';
        const finalStatus = status || detailsStatus;

        if (finalStatus === 'timeout' || finalStatus === 'busy') {
            console.log('[gateway-probe-fallback] agent is busy → set working');
            currentPhase = 'working';
            broadcast({
                id: Date.now().toString(),
                ts: Date.now(),
                category: 'other',
                status: 'working',
                summary: ''
            });
        } else {
            console.log('[gateway-probe-fallback] agent responded → idle (status=%s)', finalStatus);
        }
    } catch (err) {
        console.warn('[gateway-probe-fallback] failed:', (err as Error).message);
    }
}

function handleAgentEvent(payload: any, broadcast: BroadcastFn) {
    if (!payload) return;

    const stream = payload.stream as string;
    const data = payload.data || {};
    const runId = payload.runId || '';

    // 새 runId면 상태 초기화
    if (runId !== currentRunId) {
        currentRunId = runId;
        pendingText = '';
        broadcastedCategory = '';
        lastSummaryBroadcast = 0;
    }

    // lifecycle 이벤트
    if (stream === 'lifecycle') {
        const phase = data.phase as string;
        if (phase === 'start') {
            currentPhase = 'working';
            console.log('[gateway-ws] agent started (run=%s)', runId.slice(0, 8));
            broadcastedCategory = 'other';
            broadcast({
                id: Date.now().toString(),
                ts: Date.now(),
                category: 'other',
                status: 'working',
                summary: ''
            });
        } else if (phase === 'end') {
            currentPhase = 'idle';
            const matched = analyzeCategory(pendingText);
            const category = matched?.id || broadcastedCategory || 'other';
            const summary = pendingText.slice(0, 100);
            console.log('[gateway-ws] agent done: category=%s summary=%s', category, summary.slice(0, 50));
            broadcast({
                id: Date.now().toString(),
                ts: Date.now(),
                category,
                status: 'done',
                summary
            });
            pendingText = '';
        }
        return;
    }

    // tool 이벤트 — 도구명에서도 카테고리 힌트 수집
    if (stream === 'tool') {
        const toolName = (data.name as string) || '';
        if (toolName) {
            pendingText += ` [tool:${toolName}]`;
        }
        return;
    }

    // assistant 스트리밍: 텍스트 누적 + 주기적 summary 업데이트
    if (stream === 'assistant') {
        const newText = (data.text as string) || '';
        if (newText) pendingText = newText;

        const matched = analyzeCategory(pendingText);
        const category = matched?.id || 'other';
        const now = Date.now();

        // 카테고리가 처음 확정됐을 때 즉시 브로드캐스트
        if (category !== 'other' && category !== broadcastedCategory) {
            broadcastedCategory = category;
            lastSummaryBroadcast = now;
            console.log('[gateway-ws] category detected: %s (from %d chars)', category, pendingText.length);
            broadcast({
                id: now.toString(),
                ts: now,
                category,
                status: 'working',
                summary: pendingText.slice(0, 100)
            });
        }
        // 15초마다 summary 업데이트 브로드캐스트
        else if (now - lastSummaryBroadcast > 15000 && pendingText.length > 0) {
            lastSummaryBroadcast = now;
            const cat = broadcastedCategory || category;
            broadcast({
                id: now.toString(),
                ts: now,
                category: cat,
                status: 'working',
                summary: pendingText.slice(0, 100)
            });
        }
        return;
    }
}
