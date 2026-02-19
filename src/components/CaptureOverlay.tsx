import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./CaptureOverlay.css";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type CaptureResult = { base64: string; mime_type: string };
type CaptureRegion = { x: number; y: number; width: number; height: number };

const MIN_CAPTURE_SIZE = 4;

function toRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

export function CaptureOverlay() {
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const startRef = useRef<Point | null>(null);
  const currentRef = useRef<Point | null>(null);
  const busyRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const selectionRect = useMemo(() => {
    if (!startPoint || !currentPoint) return null;
    return toRect(startPoint, currentPoint);
  }, [startPoint, currentPoint]);

  const closeWindow = useCallback(async () => {
    const win = getCurrentWindow();
    await win.close();
  }, []);

  const hideWindow = useCallback(async () => {
    const win = getCurrentWindow();
    await win.hide();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closeWindow();
      }
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [closeWindow]);

  const emitCaptureComplete = useCallback(async (result: CaptureResult) => {
    const payload = {
      base64: result.base64,
      mimeType: result.mime_type,
    };
    await emitTo("main", "clawpet://capture-complete", payload);
  }, []);

  const emitCaptureError = useCallback(async (message: string) => {
    const payload = { message };
    await emitTo("main", "clawpet://capture-error", payload);
  }, []);

  const resolveRegion = useCallback(
    async (rect: Rect) => {
      const win = getCurrentWindow();
      const [scale, winPos] = await Promise.all([win.scaleFactor(), win.outerPosition()]);

      return {
        x: Math.round(winPos.x + rect.x * scale),
        y: Math.round(winPos.y + rect.y * scale),
        width: Math.max(1, Math.round(rect.width * scale)),
        height: Math.max(1, Math.round(rect.height * scale)),
      };
    },
    [],
  );

  const finishCapture = useCallback(
    async (region: CaptureRegion) => {
      const result = await invoke<CaptureResult>("capture_screen_region", { region });
      await emitCaptureComplete(result);
    },
    [emitCaptureComplete],
  );

  const clearDrag = useCallback(() => {
    startRef.current = null;
    currentRef.current = null;
    pointerIdRef.current = null;
    setStartPoint(null);
    setCurrentPoint(null);
  }, []);

  const updateCurrentPoint = useCallback((point: Point) => {
    currentRef.current = point;
    setCurrentPoint(point);
  }, []);

  const finishDragCapture = useCallback(async () => {
    const start = startRef.current;
    const current = currentRef.current;
    if (!start || !current || busyRef.current) return;

    const rect = toRect(start, current);
    clearDrag();

    if (rect.width < MIN_CAPTURE_SIZE || rect.height < MIN_CAPTURE_SIZE) {
      await closeWindow();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const region = await resolveRegion(rect);
      // Hide first so the overlay disappears immediately while capture/encode runs.
      await hideWindow();
      await finishCapture(region);
    } catch (err) {
      await emitCaptureError(String(err));
    } finally {
      await closeWindow();
    }
  }, [clearDrag, closeWindow, emitCaptureError, finishCapture, hideWindow, resolveRegion]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || busyRef.current) return;
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      const next = { x: event.clientX, y: event.clientY };
      startRef.current = next;
      currentRef.current = next;
      setStartPoint(next);
      setCurrentPoint(next);
    },
    [],
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || busyRef.current) return;
    if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return;
    updateCurrentPoint({ x: event.clientX, y: event.clientY });
  }, [updateCurrentPoint]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore release errors when capture is already lost/closed
    }
    pointerIdRef.current = null;
    void finishDragCapture();
  }, [finishDragCapture]);

  const handlePointerCancel = useCallback(() => {
    pointerIdRef.current = null;
    clearDrag();
    void closeWindow();
  }, [clearDrag, closeWindow]);

  useEffect(() => {
    const onWindowPointerMove = (event: PointerEvent) => {
      if (!startRef.current || busyRef.current) return;
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return;
      updateCurrentPoint({ x: event.clientX, y: event.clientY });
    };

    const onWindowPointerUp = (event: PointerEvent) => {
      if (!startRef.current || busyRef.current) return;
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      void finishDragCapture();
    };

    const onBlur = () => {
      if (!startRef.current || busyRef.current) return;
      void finishDragCapture();
    };

    window.addEventListener("pointermove", onWindowPointerMove, true);
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove, true);
      window.removeEventListener("pointerup", onWindowPointerUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [finishDragCapture, updateCurrentPoint]);

  return (
    <div
      className="capture-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="capture-hint">Drag to capture area</div>
      {selectionRect && (
        <div
          className="capture-selection"
          style={{
            left: `${selectionRect.x}px`,
            top: `${selectionRect.y}px`,
            width: `${selectionRect.width}px`,
            height: `${selectionRect.height}px`,
          }}
        />
      )}
    </div>
  );
}

