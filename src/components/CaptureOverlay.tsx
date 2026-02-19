import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./CaptureOverlay.css";

type CaptureMode = "area" | "display";
type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type CaptureResult = { base64: string; mime_type: string };
type CaptureDisplayInfo = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
};

const MIN_CAPTURE_SIZE = 4;
const DISPLAY_MAP_MAX_WIDTH = 760;
const DISPLAY_MAP_MAX_HEIGHT = 360;

function toRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

export function CaptureOverlay({ mode = "area" }: { mode?: CaptureMode }) {
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [displays, setDisplays] = useState<CaptureDisplayInfo[]>([]);
  const [loadingDisplays, setLoadingDisplays] = useState(mode === "display");
  const [hoveredDisplayId, setHoveredDisplayId] = useState<number | null>(null);

  const selectionRect = useMemo(() => {
    if (!startPoint || !currentPoint) return null;
    return toRect(startPoint, currentPoint);
  }, [startPoint, currentPoint]);

  const displayMap = useMemo(() => {
    if (displays.length === 0) return null;

    const minX = Math.min(...displays.map((display) => display.x));
    const minY = Math.min(...displays.map((display) => display.y));
    const maxX = Math.max(...displays.map((display) => display.x + display.width));
    const maxY = Math.max(...displays.map((display) => display.y + display.height));
    const totalWidth = Math.max(1, maxX - minX);
    const totalHeight = Math.max(1, maxY - minY);

    const scale = Math.min(
      DISPLAY_MAP_MAX_WIDTH / totalWidth,
      DISPLAY_MAP_MAX_HEIGHT / totalHeight,
    );

    const width = Math.round(totalWidth * scale);
    const height = Math.round(totalHeight * scale);

    const items = displays.map((display, index) => ({
      ...display,
      index,
      left: Math.round((display.x - minX) * scale),
      top: Math.round((display.y - minY) * scale),
      boxWidth: Math.max(60, Math.round(display.width * scale)),
      boxHeight: Math.max(40, Math.round(display.height * scale)),
    }));

    return { width, height, items };
  }, [displays]);

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

  useEffect(() => {
    if (mode !== "display") return;

    let cancelled = false;

    (async () => {
      try {
        const rows = await invoke<CaptureDisplayInfo[]>("list_capture_displays");
        if (!cancelled) {
          setDisplays(rows);
        }
      } catch (err) {
        await emit("clawgotchi://capture-error", {
          message: String(err),
        });
        if (!cancelled) {
          await closeWindow();
        }
      } finally {
        if (!cancelled) {
          setLoadingDisplays(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, closeWindow]);

  const finishAreaCapture = useCallback(
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

  const finishDisplayCapture = useCallback(async (displayId: number) => {
    const result = await invoke<CaptureResult>("capture_screen_display", { displayId });
    await emit("clawgotchi://capture-complete", {
      base64: result.base64,
      mimeType: result.mime_type,
    });
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== "area") return;
      if (event.button !== 0 || busy) return;
      const next = { x: event.clientX, y: event.clientY };
      setStartPoint(next);
      setCurrentPoint(next);
    },
    [busy, mode],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== "area") return;
      if (!startPoint || busy) return;
      setCurrentPoint({ x: event.clientX, y: event.clientY });
    },
    [startPoint, busy, mode],
  );

  const handleMouseUp = useCallback(async () => {
    if (mode !== "area") return;
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
      await finishAreaCapture(rect);
    } catch (err) {
      await emit("clawgotchi://capture-error", {
        message: String(err),
      });
    } finally {
      await closeWindow();
    }
  }, [mode, startPoint, currentPoint, busy, closeWindow, finishAreaCapture]);

  const handleDisplayClick = useCallback(
    async (displayId: number) => {
      if (busy) return;
      setBusy(true);
      try {
        await finishDisplayCapture(displayId);
      } catch (err) {
        await emit("clawgotchi://capture-error", {
          message: String(err),
        });
      } finally {
        await closeWindow();
      }
    },
    [busy, finishDisplayCapture, closeWindow],
  );

  if (mode === "display") {
    return (
      <div className="capture-overlay capture-overlay-display">
        <div className="capture-hint">Select a monitor to capture full screen</div>
        <div className="capture-subhint">Click once and it will be attached immediately</div>

        <div className="display-picker-panel">
          {loadingDisplays && <div className="display-picker-loading">Loading displays...</div>}
          {!loadingDisplays && (!displayMap || displayMap.items.length === 0) && (
            <div className="display-picker-loading">No display found</div>
          )}

          {!loadingDisplays && displayMap && displayMap.items.length > 0 && (
            <div
              className="display-map"
              style={{ width: `${displayMap.width}px`, height: `${displayMap.height}px` }}
            >
              {displayMap.items.map((display) => (
                <button
                  key={display.id}
                  className={`display-tile${hoveredDisplayId === display.id ? " hovered" : ""}`}
                  style={{
                    left: `${display.left}px`,
                    top: `${display.top}px`,
                    width: `${display.boxWidth}px`,
                    height: `${display.boxHeight}px`,
                  }}
                  onMouseEnter={() => setHoveredDisplayId(display.id)}
                  onMouseLeave={() => setHoveredDisplayId((prev) => (prev === display.id ? null : prev))}
                  onClick={() => {
                    void handleDisplayClick(display.id);
                  }}
                  disabled={busy}
                >
                  <span className="display-tile-label">
                    {`Monitor ${display.index + 1}`}
                    {display.is_primary ? " (main)" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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