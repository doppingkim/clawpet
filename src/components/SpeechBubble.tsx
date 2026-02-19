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
  const externalLetterQueue = useStore((s) => s.externalLetterQueue);
  const externalLetterShowingContent = useStore((s) => s.externalLetterShowingContent);
  const openExternalLetterContent = useStore((s) => s.openExternalLetterContent);
  const consumeExternalLetter = useStore((s) => s.consumeExternalLetter);
  const showParchment = useStore((s) => s.showParchment);
  const chatLoading = useStore((s) => s.chatLoading);
  const isExternalMode = externalLetterQueue.length > 0;
  const externalNoticeText =
    externalLetterQueue.length > 1
      ? `편지가 ${externalLetterQueue.length}개 도착했어요!`
      : "편지가 도착했어요!";
  const externalContentText = externalLetterQueue[0] ?? "";
  const renderText =
    isExternalMode && !externalLetterShowingContent
      ? externalNoticeText
      : isExternalMode
        ? externalContentText
        : text;
  const parchmentSourceText =
    isExternalMode && externalLetterShowingContent ? externalContentText : lastResponse;

  const handleMoreClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (parchmentSourceText) {
        showParchment(parchmentSourceText);
      }
    },
    [parchmentSourceText, showParchment],
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isExternalMode) {
        if (externalLetterShowingContent) {
          consumeExternalLetter();
        } else {
          openExternalLetterContent();
        }
        return;
      }
      hideSpeechBubble();
    },
    [
      hideSpeechBubble,
      isExternalMode,
      externalLetterShowingContent,
      consumeExternalLetter,
      openExternalLetterContent,
    ],
  );

  if (!visible && !isExternalMode) return null;

  const isLong =
    ENABLE_PARCHMENT &&
    !!parchmentSourceText &&
    parchmentSourceText.length > LONG_RESPONSE_THRESHOLD &&
    (!isExternalMode || externalLetterShowingContent);

  return (
    <div className="speech-bubble" onClick={handleDismiss}>
      {!isExternalMode && <button className="speech-bubble-dismiss">x</button>}
      <div className="speech-bubble-text">{renderMarkdown(renderText)}</div>
      {isExternalMode && !externalLetterShowingContent && (
        <button className="speech-bubble-mail-hint">클릭해서 확인</button>
      )}
      {isExternalMode && externalLetterShowingContent && (
        <button className="speech-bubble-mail-hint">
          {externalLetterQueue.length > 1 ? "클릭해서 다음 편지" : "클릭해서 닫기"}
        </button>
      )}
      {isLong && !chatLoading && (
        <button className="speech-bubble-more" onClick={handleMoreClick}>
          read more...
        </button>
      )}
      <div className="speech-bubble-tail" />
    </div>
  );
}
