import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readLocalChatHistory, type LocalChatEntry } from "../utils/localChatHistory";
import { renderMarkdown } from "../utils/renderMarkdown";
import "./HistoryPage.css";

function formatStamp(timestamp: number) {
  const value = new Date(timestamp);
  return value.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryPage() {
  const [entries, setEntries] = useState<LocalChatEntry[]>(() => readLocalChatHistory());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      setEntries(readLocalChatHistory());
    };

    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries]);

  const titleText = useMemo(() => {
    return entries.length > 0 ? `ClawPet Conversations (${entries.length})` : "ClawPet Conversations";
  }, [entries.length]);

  const handleClose = useCallback(() => {
    const closeAsync = async () => {
      const win = getCurrentWindow();
      try {
        await win.close();
      } catch {
        await win.hide();
      }
    };
    void closeAsync();
  }, []);

  return (
    <div className="history-overlay">
      <div className="history-panel">
        <button className="history-close" onClick={handleClose}>
          X
        </button>
        <div className="history-title">{titleText}</div>

        <div className="history-list" ref={listRef}>
          {entries.length === 0 && (
            <div className="history-empty">No ClawPet conversation history yet.</div>
          )}

          {entries.map((entry) => (
            <div key={entry.id} className={`history-row ${entry.role}`}>
              <div className="history-bubble">{renderMarkdown(entry.text)}</div>
              <div className="history-time">{formatStamp(entry.timestamp)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

