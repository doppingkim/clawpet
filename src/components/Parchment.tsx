import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { useStore } from "../store/useStore";
import { renderMarkdown } from "../utils/renderMarkdown";
import "./Parchment.css";

const PARCHMENT_WIDTH = 500;
const PARCHMENT_HEIGHT = 600;
const NORMAL_WIDTH = 300;
const NORMAL_HEIGHT = 350;

export function Parchment() {
  const text = useStore((s) => s.parchmentText);
  const hideParchment = useStore((s) => s.hideParchment);
  const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);
  const savedPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    // Expand window upward from current position so character stays in place
    (async () => {
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      const scaleFactor = await win.scaleFactor();
      savedPos.current = { x: pos.x, y: pos.y };

      const physW = PARCHMENT_WIDTH * scaleFactor;
      const physH = PARCHMENT_HEIGHT * scaleFactor;

      // Expand upward & horizontally centered: bottom edge stays fixed
      const newX = Math.max(0, Math.round(pos.x - (physW - size.width) / 2));
      const newY = Math.max(0, Math.round(pos.y - (physH - size.height)));

      await win.setSize(new LogicalSize(PARCHMENT_WIDTH, PARCHMENT_HEIGHT));
      await win.setPosition(new PhysicalPosition(newX, newY));
    })();

    return () => {
      // Restore size & position on unmount
      (async () => {
        await win.setSize(new LogicalSize(NORMAL_WIDTH, NORMAL_HEIGHT));
        if (savedPos.current) {
          await win.setPosition(new PhysicalPosition(savedPos.current.x, savedPos.current.y));
        }
      })();
    };
  }, []);

  const handleClose = useCallback(() => {
    hideParchment();
    hideSpeechBubble();
  }, [hideParchment, hideSpeechBubble]);

  return (
    <div className="parchment-overlay">
      <div className="parchment-scroll">
        <button className="parchment-close" onClick={handleClose}>
          X
        </button>
        <div className="parchment-content">{renderMarkdown(text)}</div>
      </div>
    </div>
  );
}
