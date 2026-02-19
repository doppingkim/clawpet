import { useCallback } from "react";
import { useStore } from "../store/useStore";
import { renderMarkdown } from "../utils/renderMarkdown";
import "./SpeechBubble.css";

const LONG_RESPONSE_THRESHOLD = 100;
const ENABLE_PARCHMENT = import.meta.env.VITE_ENABLE_PARCHMENT !== "false";

export function SpeechBubble() {
  const visible = useStore((s) => s.speechBubbleVisible);
  const text = useStore((s) => s.speechBubbleText);
  const lastResponse = useStore((s) => s.lastResponse);
  const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);
  const showParchment = useStore((s) => s.showParchment);
  const chatLoading = useStore((s) => s.chatLoading);

  const handleMoreClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (lastResponse) {
        showParchment(lastResponse);
      }
    },
    [lastResponse, showParchment],
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hideSpeechBubble();
    },
    [hideSpeechBubble],
  );

  if (!visible) return null;

  const isLong =
    ENABLE_PARCHMENT && lastResponse && lastResponse.length > LONG_RESPONSE_THRESHOLD;

  return (
    <div className="speech-bubble" onClick={handleDismiss}>
      <button className="speech-bubble-dismiss">x</button>
      <div className="speech-bubble-text">{renderMarkdown(text)}</div>
      {isLong && !chatLoading && (
        <button className="speech-bubble-more" onClick={handleMoreClick}>
          read more...
        </button>
      )}
      <div className="speech-bubble-tail" />
    </div>
  );
}
