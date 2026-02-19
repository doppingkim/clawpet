import { useCallback, useEffect, useRef, useState } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useStore } from "../store/useStore";
import { useAnimation } from "../hooks/useAnimation";
import { useDrag } from "../hooks/useDrag";
import "./Character.css";

const SPRITE_MAP = {
  idle: "/sprites/clawgotchi-idle.png",
  talking: "/sprites/clawgotchi-talk.png",
  thinking: "/sprites/clawgotchi-think.png",
  sleeping: "/sprites/clawgotchi-sleep.png",
};

const ENABLE_AREA_CAPTURE = import.meta.env.VITE_ENABLE_AREA_CAPTURE !== "false";

export function Character() {
  const animation = useStore((s) => s.characterAnimation);
  const showChatInput = useStore((s) => s.showChatInput);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);
  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);
  const frame = useAnimation(animation);
  const { onMouseDown, onMouseMove, onMouseUp, isDragging } = useDrag();
  const lastClickRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openCaptureWindow = useCallback(async () => {
    const existing = await WebviewWindow.getByLabel("capture");
    if (existing) {
      await existing.setFocus();
      return;
    }

    new WebviewWindow("capture", {
      url: "/",
      title: "Capture",
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      fullscreen: true,
      skipTaskbar: true,
      focus: true,
      shadow: false,
    });
  }, []);

  const handleClick = useCallback(() => {
    // Don't handle click if we just finished dragging
    if (isDragging.current) return;
    if (connectionState !== "connected") return;
    if (parchmentVisible) return;
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const now = Date.now();
    if (now - lastClickRef.current < 400) {
      // Double-click detected
      showChatInput();
    }
    lastClickRef.current = now;
  }, [connectionState, showChatInput, isDragging, parchmentVisible, menuOpen]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (connectionState !== "connected") return;
      if (parchmentVisible) return;
      setMenuOpen((prev) => !prev);
    },
    [connectionState, parchmentVisible],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0 && menuOpen) {
        setMenuOpen(false);
      }
      onMouseDown(e);
    },
    [menuOpen, onMouseDown],
  );

  const handleActionClick = useCallback(
    (action: "capture" | "pin" | "star" | "settings") => {
      setMenuOpen(false);
      if (action === "capture") {
        if (!ENABLE_AREA_CAPTURE) {
          showSpeechBubble("Area capture is disabled");
          return;
        }
        void openCaptureWindow();
        return;
      }
      showSpeechBubble("Coming soon");
    },
    [openCaptureWindow, showSpeechBubble],
  );

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!wrapperRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const spriteUrl = SPRITE_MAP[animation];
  const offsetX = frame * 128; // 64px frame * 2x scale = 128px per frame

  return (
    <div className="character-wrapper" ref={wrapperRef}>
      {menuOpen && (
        <div className="character-radial-menu">
          <button className="radial-btn radial-top" onClick={() => handleActionClick("capture")} title="Area capture">
            ✂️
          </button>
          <button className="radial-btn radial-right" onClick={() => handleActionClick("pin")} title="Pin (coming soon)">
            📌
          </button>
          <button className="radial-btn radial-bottom" onClick={() => handleActionClick("star")} title="Favorite (coming soon)">
            ⭐
          </button>
          <button className="radial-btn radial-left" onClick={() => handleActionClick("settings")} title="Settings (coming soon)">
            ⚙️
          </button>
        </div>
      )}

      <div
        className="character"
        style={{
          backgroundImage: `url(${spriteUrl})`,
          backgroundPosition: `-${offsetX}px 0`,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}
