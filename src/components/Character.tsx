import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../store/useStore";
import { useAnimation } from "../hooks/useAnimation";
import { useDrag } from "../hooks/useDrag";
import "./Character.css";

const SPRITE_MAP = {
  idle: "/sprites/clawpet-idle.png",
  talking: "/sprites/clawpet-talk.png",
  thinking: "/sprites/clawpet-think.png",
  sleeping: "/sprites/clawpet-sleep.png",
};

const ENABLE_AREA_CAPTURE = import.meta.env.VITE_ENABLE_AREA_CAPTURE !== "false";
const DEFAULT_NAME = "OpenClaw";

type ActionId = "capture-area" | "capture-display" | "read-browser" | "history";
type OpenClawIdentity = { name?: string | null };
type CaptureResult = { base64: string; mime_type: string };

const MENU_ACTIONS: Array<{ id: ActionId; label: string }> = [
  { id: "capture-area", label: "Area capture" },
  { id: "capture-display", label: "Full screen capture" },
  { id: "read-browser", label: "Read browser page" },
  { id: "history", label: "Conversation history" },
];

function ActionIcon({ action }: { action: ActionId }) {
  if (action === "capture-area") {
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
  if (action === "capture-display") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="2" width="14" height="11" />
        <rect x="2" y="3" width="12" height="9" />
        <rect x="6" y="13" width="4" height="1" />
        <rect x="5" y="14" width="6" height="1" />
      </svg>
    );
  }
  if (action === "read-browser") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <rect x="2" y="2" width="12" height="12" rx="1" />
        <rect x="1" y="4" width="14" height="1" />
        <circle cx="3" cy="2.5" r="0.7" />
        <circle cx="5" cy="2.5" r="0.7" />
        <circle cx="7" cy="2.5" r="0.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="10" height="12" />
      <rect x="4" y="3" width="8" height="10" />
      <rect x="4" y="5" width="6" height="1" />
      <rect x="4" y="7" width="6" height="1" />
      <rect x="4" y="9" width="5" height="1" />
    </svg>
  );
}

export function Character() {
  const animation = useStore((s) => s.characterAnimation);
  const showChatInput = useStore((s) => s.showChatInput);
  const hideChatInput = useStore((s) => s.hideChatInput);
  const chatInputVisible = useStore((s) => s.chatInputVisible);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);
  const setAttachedImage = useStore((s) => s.setAttachedImage);
  const setBrowserContext = useStore((s) => s.setBrowserContext);
  const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);
  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);
  const frame = useAnimation(animation);
  const { onMouseDown, onMouseMove, onMouseUp, isDragging } = useDrag();
  const lastClickRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [characterName, setCharacterName] = useState(DEFAULT_NAME);

  const openCaptureWindow = useCallback(async () => {
    const existingOther = await WebviewWindow.getByLabel("capture-display");
    if (existingOther) {
      await existingOther.close();
    }

    const existing = await WebviewWindow.getByLabel("capture-area");
    if (existing) {
      await existing.close();
    }

    new WebviewWindow("capture-area", {
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

  const openHistoryWindow = useCallback(async () => {
    const existing = await WebviewWindow.getByLabel("history");
    if (existing) {
      await existing.setFocus();
      return;
    }

    new WebviewWindow("history", {
      url: "/",
      title: "Conversation History",
      center: true,
      width: 560,
      height: 640,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
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
    async (action: ActionId) => {
      setMenuOpen(false);
      if (action === "capture-area") {
        if (!ENABLE_AREA_CAPTURE) {
          showSpeechBubble("Area capture is disabled");
          return;
        }
        void openCaptureWindow();
        return;
      }
      if (action === "capture-display") {
        try {
          const win = getCurrentWindow();
          const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
          const centerX = Math.round(pos.x + size.width / 2);
          const centerY = Math.round(pos.y + size.height / 2);
          const result = await invoke<CaptureResult>("capture_screen_for_point", {
            x: centerX,
            y: centerY,
          });
          const dataUrl = `data:${result.mime_type};base64,${result.base64}`;
          setAttachedImage({ dataUrl, mimeType: result.mime_type });
          showChatInput();
        } catch (err) {
          showSpeechBubble(String(err));
        }
        return;
      }
      if (action === "read-browser") {
        showSpeechBubble("Reading browser...");
        try {
          const result = await invoke<{
            html: string;
            screenshot: string;
            url: string;
            title: string;
          }>("read_browser_page");
          setBrowserContext(result);
          if (result.screenshot) {
            setAttachedImage({
              dataUrl: `data:image/jpeg;base64,${result.screenshot}`,
              mimeType: "image/jpeg",
            });
          }
          hideSpeechBubble();
          showChatInput();
        } catch (err) {
          showSpeechBubble(String(err));
        }
        return;
      }
      if (action === "history") {
        void openHistoryWindow();
        return;
      }
      showSpeechBubble("Coming soon");
    },
    [openCaptureWindow, openHistoryWindow, setAttachedImage, setBrowserContext, hideSpeechBubble, showChatInput, showSpeechBubble],
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
                onClick={() => {
                  void handleActionClick(action.id);
                }}
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

