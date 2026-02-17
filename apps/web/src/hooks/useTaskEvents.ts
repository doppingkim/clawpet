import { useEffect } from 'react';
import { usePetStore } from '../store/usePetStore';

export function useTaskEvents() {
  const setTaskState = usePetStore((s) => s.setTaskState);
  const say = usePetStore((s) => s.say);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    // 서버에 현재 작업 상태를 HTTP로 확인 (WS 이벤트를 놓친 경우 보정)
    async function pollCurrentState() {
      try {
        const r = await fetch('http://localhost:8787/debug/gateway');
        const data = await r.json();
        console.log('[poll] gateway state:', data.currentPhase, data.broadcastedCategory);
        if (data.currentPhase === 'working') {
          setTaskState('working', '', data.broadcastedCategory || 'other');
        }
      } catch {
        // noop
      }
    }

    function connect() {
      if (disposed) return;
      ws = new WebSocket('ws://localhost:8787/events');

      ws.onopen = () => {
        console.log('[ws] connected to /events');
        // 연결 직후 현재 상태 확인
        pollCurrentState();
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);

          // 혼잣말 메시지
          if (data.type === 'monologue') {
            say(data.text || '...', 6000);
            return;
          }

          // 혼잣말 상태 변경
          if (data.type === 'monologue-status') {
            usePetStore.setState({ monologueEnabled: data.enabled });
            return;
          }

          console.log('[ws] task event:', data.status, data.category, data.summary?.slice(0, 40));
          setTaskState(data.status, data.summary, data.category);
        } catch {
          // noop
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        console.log('[ws] disconnected, reconnecting in 3s...');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        // onclose will fire after this, triggering reconnect
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [setTaskState, say]);
}
