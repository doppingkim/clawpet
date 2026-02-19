import { useEffect } from "react";
import { Character } from "./components/Character";
import { SpeechBubble } from "./components/SpeechBubble";
import { ChatInput } from "./components/ChatInput";
import { Parchment } from "./components/Parchment";
import { DisconnectedOverlay } from "./components/DisconnectedOverlay";
import { useGateway } from "./hooks/useGateway";
import { useStore } from "./store/useStore";

export default function App() {
  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);

  useGateway();

  // Prevent right-click context menu
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  return (
    <>
      {connectionState === "disconnected" ? (
        <DisconnectedOverlay />
      ) : (
        <>
          {!parchmentVisible && <SpeechBubble />}
          {!parchmentVisible && <ChatInput />}
          <Character />
        </>
      )}
      {parchmentVisible && <Parchment />}
    </>
  );
}
