import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import { GatewayClient } from "../gateway/GatewayClient";
import { generateUUID } from "../utils/uuid";
import "./ChatInput.css";

// We need access to the gateway client ref from useGateway.
// Since useGateway stores the client in a ref, we'll create a module-level accessor.
let _gatewayClient: GatewayClient | null = null;

export function setGatewayClientRef(client: GatewayClient | null) {
  _gatewayClient = client;
}

export function ChatInput() {
  const visible = useStore((s) => s.chatInputVisible);
  const hideChatInput = useStore((s) => s.hideChatInput);
  const setChatLoading = useStore((s) => s.setChatLoading);
  const setChatRunId = useStore((s) => s.setChatRunId);
  const setCharacterAnimation = useStore((s) => s.setCharacterAnimation);
  const clearStreamingText = useStore((s) => s.clearStreamingText);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);
  const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);
  const setLastResponse = useStore((s) => s.setLastResponse);
  const sessionKey = useStore((s) => s.sessionKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      // Small delay to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  const handleSubmit = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      hideChatInput();
      hideSpeechBubble();
      setChatLoading(true);
      clearStreamingText();
      setLastResponse(null);
      setCharacterAnimation("thinking");

      const runId = generateUUID();
      setChatRunId(runId);

      if (!_gatewayClient?.connected) {
        showSpeechBubble("Not connected!");
        setChatLoading(false);
        setCharacterAnimation("idle");
        return;
      }

      try {
        await _gatewayClient.request("chat.send", {
          sessionKey,
          message: trimmed,
          deliver: false,
          idempotencyKey: runId,
        });
      } catch (err) {
        showSpeechBubble(`Error: ${err}`);
        setChatLoading(false);
        setChatRunId(null);
        setCharacterAnimation("idle");
      }
    },
    [
      hideChatInput,
      hideSpeechBubble,
      setChatLoading,
      clearStreamingText,
      setLastResponse,
      setCharacterAnimation,
      setChatRunId,
      showSpeechBubble,
      sessionKey,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit(inputRef.current?.value ?? "");
      } else if (e.key === "Escape") {
        hideChatInput();
      }
    },
    [handleSubmit, hideChatInput],
  );

  if (!visible) return null;

  return (
    <div className="chat-input-container">
      <input
        ref={inputRef}
        className="chat-input"
        type="text"
        placeholder="Ask me anything..."
        onKeyDown={handleKeyDown}
        maxLength={500}
      />
    </div>
  );
}
