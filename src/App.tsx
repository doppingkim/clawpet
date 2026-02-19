import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Character } from "./components/Character";
import { SpeechBubble } from "./components/SpeechBubble";
import { ChatInput } from "./components/ChatInput";
import { ParchmentPage } from "./components/ParchmentPage";
import { DisconnectedOverlay } from "./components/DisconnectedOverlay";
import { useGateway } from "./hooks/useGateway";
import { useDrop } from "./hooks/useDrop";
import { useStore } from "./store/useStore";

const isParchmentWindow = getCurrentWindow().label === "parchment";

export default function App() {
  // Parchment window: render standalone parchment page
  if (isParchmentWindow) return <ParchmentPage />;

  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);

  useGateway();
  const { isDragOver } = useDrop();

  // Prevent right-click context menu
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

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
