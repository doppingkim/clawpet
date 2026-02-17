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
const MAX_RETRIES = 3;

export function connectToGateway(
    port: number,
    token: string,
    broadcast: BroadcastFn
) {
    if (ws) {
        try { ws.close(); } catch { /* noop */ }
    }

    const url = `ws://127.0.0.1:${port}`;
    console.log('[gateway-ws] connecting to', url);

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

    // 먼저 challenge를 받고 나서 connect 보내기
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

    // challenge 없이도 2초 후 connect 시도 (로컬이면 challenge 안 올 수 있음)
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
    if (retryCount > MAX_RETRIES) {
        console.warn('[gateway-ws] max retries reached. Gateway WS disabled. /emit API still works for events.');
        return;
    }
    console.log('[gateway-ws] will reconnect in 10s... (attempt %d/%d)', retryCount, MAX_RETRIES);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToGateway(port, token, broadcast);
    }, 10000);
}

function handleGatewayMessage(msg: any, broadcast: BroadcastFn) {
    // hello-ok 응답
    if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
        console.log('[gateway-ws] handshake OK, protocol:', msg.payload.protocol);
        retryCount = 0; // 성공 시 리셋
        return;
    }

    // agent 이벤트 — 핵심!
    if (msg.type === 'event' && msg.event === 'agent') {
        handleAgentEvent(msg.payload, broadcast);
        return;
    }

    // res 에러
    if (msg.type === 'res' && !msg.ok) {
        console.warn('[gateway-ws] error response:', msg.error);
        return;
    }
}

// 스트리밍 상태 추적
let pendingText = '';
let currentRunId = '';
let broadcastedCategory = '';  // 이미 브로드캐스트한 카테고리

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
    }

    // lifecycle 이벤트
    if (stream === 'lifecycle') {
        const phase = data.phase as string;
        if (phase === 'start') {
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

    // assistant 스트리밍: 텍스트 누적, 카테고리가 바뀔 때만 1회 브로드캐스트
    if (stream === 'assistant') {
        pendingText = (data.text as string) || pendingText;

        const matched = analyzeCategory(pendingText);
        const category = matched?.id || 'other';

        // 카테고리가 처음 확정됐을 때만 (other → 구체적 카테고리) 1번 브로드캐스트
        if (category !== 'other' && category !== broadcastedCategory) {
            broadcastedCategory = category;
            console.log('[gateway-ws] category detected: %s', category);
            broadcast({
                id: Date.now().toString(),
                ts: Date.now(),
                category,
                status: 'working',
                summary: pendingText.slice(0, 100)
            });
        }
        return;
    }
}
