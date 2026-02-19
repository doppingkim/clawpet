import { useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useDrag() {
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON") {
      return;
    }
    downPos.current = { x: e.screenX, y: e.screenY };
    dragging.current = false;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!downPos.current || dragging.current) return;
    const dx = e.screenX - downPos.current.x;
    const dy = e.screenY - downPos.current.y;
    // Start dragging only after moving 5px
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragging.current = true;
      downPos.current = null;
      getCurrentWindow().startDragging();
    }
  }, []);

  const onMouseUp = useCallback(() => {
    downPos.current = null;
    dragging.current = false;
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp, isDragging: dragging };
}
