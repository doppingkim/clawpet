import { useEffect } from 'react';
import { usePetStore } from '../store/usePetStore';

export function useTaskEvents() {
  const setTaskState = usePetStore((s) => s.setTaskState);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8787/events');

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        setTaskState(data.status, data.summary, data.category);
      } catch {
        // noop
      }
    };

    ws.onerror = () => setTaskState('error', '연결 상태를 확인하는 중...');
    return () => ws.close();
  }, [setTaskState]);
}
