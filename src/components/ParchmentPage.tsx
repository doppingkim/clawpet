import { useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderMarkdown } from "../utils/renderMarkdown";
import "./Parchment.css";

export function ParchmentPage() {
  const [text] = useState(
    () => localStorage.getItem("clawgotchi-parchment-text") || "",
  );

  const handleClose = useCallback(() => {
    getCurrentWindow().close();
  }, []);

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
