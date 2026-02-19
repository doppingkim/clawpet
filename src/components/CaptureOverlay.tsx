import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./CaptureOverlay.css";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type CaptureResult = { base64: string; mime_type: string };

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

  const selectionRect = useMemo(() => {
    if (!startPoint || !currentPoint) return null;
    return toRect(startPoint, currentPoint);
  }, [startPoint, currentPoint]);

  const closeWindow = useCallback(async () => {
    const win = getCurrentWindow();
    await win.close();
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

  const finishCapture = useCallback(
    async (rect: Rect) => {
      const win = getCurrentWindow();
      const [scale, winPos] = await Promise.all([win.scaleFactor(), win.outerPosition()]);

      const region = {
        x: Math.round(winPos.x + rect.x * scale),
        y: Math.round(winPos.y + rect.y * scale),
        width: Math.max(1, Math.round(rect.width * scale)),
        height: Math.max(1, Math.round(rect.height * scale)),
      };

      const result = await invoke<CaptureResult>("capture_screen_region", { region });
      await emit("clawgotchi://capture-complete", {
        base64: result.base64,
        mimeType: result.mime_type,
      });
    },
    [],
  );

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || busy) return;
    const next = { x: event.clientX, y: event.clientY };
    setStartPoint(next);
    setCurrentPoint(next);
  }, [busy]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!startPoint || busy) return;
    setCurrentPoint({ x: event.clientX, y: event.clientY });
  }, [startPoint, busy]);

  const handleMouseUp = useCallback(async () => {
    if (!startPoint || !currentPoint || busy) return;

    const rect = toRect(startPoint, currentPoint);
    setStartPoint(null);
    setCurrentPoint(null);

    if (rect.width < MIN_CAPTURE_SIZE || rect.height < MIN_CAPTURE_SIZE) {
      await closeWindow();
      return;
    }

    setBusy(true);
    try {
      await finishCapture(rect);
    } catch (err) {
      await emit("clawgotchi://capture-error", {
        message: String(err),
      });
    } finally {
      await closeWindow();
    }
  }, [startPoint, currentPoint, busy, closeWindow, finishCapture]);

  return (
    <div
      className="capture-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => {
        void handleMouseUp();
      }}
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

