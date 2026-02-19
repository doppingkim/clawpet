import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
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
const DEFAULT_NAME = "OpenClaw";

type ActionId = "capture" | "memo" | "settings";
type OpenClawIdentity = { name?: string | null };

const MENU_ACTIONS: Array<{ id: ActionId; label: string }> = [
  { id: "capture", label: "Area capture" },
  { id: "memo", label: "Quick memo (coming soon)" },
  { id: "settings", label: "Settings (coming soon)" },
];

function ActionIcon({ action }: { action: ActionId }) {
  if (action === "capture") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="1" width="4" height="2" />
        <rect x="1" y="1" width="2" height="4" />
        <rect x="11" y="1" width="4" height="2" />
        <rect x="13" y="1" width="2" height="4" />
        <rect x="1" y="13" width="4" height="2" />
        <rect x="1" y="11" width="2" height="4" />
        <rect x="11" y="13" width="4" height="2" />
        <rect x="13" y="11" width="2" height="4" />
        <rect x="6" y="6" width="4" height="4" />
      </svg>
    );
  }
  if (action === "memo") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3" y="1" width="10" height="14" />
        <rect x="4" y="2" width="8" height="2" />
        <rect x="5" y="6" width="6" height="1" />
        <rect x="5" y="8" width="5" height="1" />
        <rect x="5" y="10" width="6" height="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="2" width="14" height="2" />
      <rect x="6" y="1" width="2" height="4" />
      <rect x="1" y="7" width="14" height="2" />
      <rect x="9" y="6" width="2" height="4" />
      <rect x="1" y="12" width="14" height="2" />
      <rect x="4" y="11" width="2" height="4" />
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
  const [characterName, setCharacterName] = useState(DEFAULT_NAME);

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
    if (isDragging.current) return;
    if (connectionState !== "connected") return;
    if (parchmentVisible) return;
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    const now = Date.now();
    if (now - lastClickRef.current < 400) {
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
    let cancelled = false;

    (async () => {
      try {
        const identity = await invoke<OpenClawIdentity>("read_openclaw_identity");
        const nextName = identity?.name?.trim();
        if (!cancelled && nextName) {
          setCharacterName(nextName);
        }
      } catch (err) {
        console.warn("[character] failed to read identity:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
  const offsetX = frame * 128;

  return (
    <div className="character-wrapper" ref={wrapperRef}>
      <div className="character-stage">
        <div className={`character-action-row${menuOpen ? " open" : ""}`} aria-hidden={!menuOpen}>
          {MENU_ACTIONS.map((action, index) => {
            const style = { "--index": index } as CSSProperties;
            return (
              <button
                key={action.id}
                className="action-btn"
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

      <div className="character-nameplate" title={characterName}>
        {characterName}
      </div>
    </div>
  );
}
