import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Character } from "./components/Character";
import { SpeechBubble } from "./components/SpeechBubble";
import { ChatInput } from "./components/ChatInput";
import { ParchmentPage } from "./components/ParchmentPage";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { DisconnectedOverlay } from "./components/DisconnectedOverlay";
import { useGateway } from "./hooks/useGateway";
import { useDrop } from "./hooks/useDrop";
import { useStore } from "./store/useStore";

const windowLabel = getCurrentWindow().label;
const isParchmentWindow = windowLabel === "parchment";
const isCaptureWindow = windowLabel === "capture";

export default function App() {
  // Parchment window: render standalone parchment page
  if (isParchmentWindow) return <ParchmentPage />;
  // Capture window: render area capture overlay
  if (isCaptureWindow) return <CaptureOverlay />;

  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);
  const setAttachedImage = useStore((s) => s.setAttachedImage);
  const showChatInput = useStore((s) => s.showChatInput);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);

  useGateway();
  const { isDragOver } = useDrop();

  // Prevent right-click context menu
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  useEffect(() => {
    let active = true;
    const unlistenFns: Array<() => void> = [];

    (async () => {
      const unlistenCapture = await listen<{
        base64?: string;
        mimeType?: string;
      }>("clawgotchi://capture-complete", (event) => {
        const base64 = event.payload?.base64 ?? "";
        const mimeType = event.payload?.mimeType ?? "image/png";
        if (!base64) return;
        const dataUrl = `data:${mimeType};base64,${base64}`;
        setAttachedImage({ dataUrl, mimeType });
        showChatInput();
      });

      const unlistenError = await listen<{ message?: string }>(
        "clawgotchi://capture-error",
        (event) => {
          const msg = event.payload?.message ?? "Failed to capture area";
          showSpeechBubble(msg);
        },
      );

      if (!active) {
        unlistenCapture();
        unlistenError();
        return;
      }

      unlistenFns.push(unlistenCapture, unlistenError);
    })();

    return () => {
      active = false;
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, [setAttachedImage, showChatInput, showSpeechBubble]);

  return (
    <>
      {isDragOver && connectionState === "connected" && !parchmentVisible && (
        <div className="drop-overlay" />
      )}
      {connectionState === "disconnected" ? (
        <DisconnectedOverlay />
      ) : (
        <>
          {!parchmentVisible && <SpeechBubble />}
          {!parchmentVisible && <ChatInput />}
          <Character />
        </>
      )}
    </>
  );
}
