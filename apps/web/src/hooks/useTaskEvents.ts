import { useEffect } from 'react';
import { usePetStore } from '../store/usePetStore';

export function useTaskEvents() {
  const setTaskState = usePetStore((s) => s.setTaskState);
  const say = usePetStore((s) => s.say);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      ws = new WebSocket('ws://localhost:8787/events');

      ws.onopen = () => {
        console.log('[ws] connected to /events');
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
