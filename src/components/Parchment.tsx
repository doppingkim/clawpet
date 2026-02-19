import { useCallback } from "react";
import { useStore } from "../store/useStore";
import { renderMarkdown } from "../utils/renderMarkdown";
import "./Parchment.css";

export function Parchment() {
  const text = useStore((s) => s.parchmentText);
  const hideParchment = useStore((s) => s.hideParchment);
  const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);

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
