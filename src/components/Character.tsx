import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

type ActionId = "capture" | "memo" | "settings";

const MENU_ACTIONS: Array<{
  id: ActionId;
  label: string;
  tx: string;
  ty: string;
}> = [
  { id: "capture", label: "Area capture", tx: "-56px", ty: "-48px" },
  { id: "memo", label: "Quick memo (coming soon)", tx: "0px", ty: "-76px" },
  { id: "settings", label: "Settings (coming soon)", tx: "56px", ty: "-48px" },
];

function ActionIcon({ action }: { action: ActionId }) {
  if (action === "capture") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V4h5" />
        <path d="M15 4h5v5" />
        <path d="M20 15v5h-5" />
        <path d="M9 20H4v-5" />
        <rect x="8" y="8" width="8" height="8" />
      </svg>
    );
  }
  if (action === "memo") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h8l4 4v12H6z" />
        <path d="M14 4v4h4" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.7v2.1M12 19.2v2.1M21.3 12h-2.1M4.8 12H2.7" />
      <path d="M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5M18.7 18.7l-1.5-1.5M6.8 6.8L5.3 5.3" />
    </svg>
  );
}

export function Character() {
  const animation = useStore((s) => s.characterAnimation);
  const showChatInput = useStore((s) => s.showChatInput);
  const hideChatInput = useStore((s) => s.hideChatInput);
  const chatInputVisible = useStore((s) => s.chatInputVisible);
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
      // Double-click detected: toggle chat input
      if (chatInputVisible) {
        hideChatInput();
      } else {
        showChatInput();
      }
    }
    lastClickRef.current = now;
  }, [
    chatInputVisible,
    connectionState,
    hideChatInput,
    showChatInput,
    isDragging,
    parchmentVisible,
    menuOpen,
  ]);

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
    (action: ActionId) => {
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
      <div className={`character-radial-menu${menuOpen ? " open" : ""}`} aria-hidden={!menuOpen}>
        <div className="radial-halo" />
        {MENU_ACTIONS.map((action, index) => {
          const style = {
            "--tx": action.tx,
            "--ty": action.ty,
            "--delay": menuOpen ? `${index * 45}ms` : "0ms",
          } as CSSProperties;
          return (
            <button
              key={action.id}
              className="radial-btn"
              style={style}
              onClick={() => handleActionClick(action.id)}
              title={action.label}
            >
              <ActionIcon action={action.id} />
            </button>
          );
        })}
      </div>

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
