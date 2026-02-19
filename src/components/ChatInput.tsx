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
  const chatLoading = useStore((s) => s.chatLoading);
  const setChatLoading = useStore((s) => s.setChatLoading);
  const setChatRunId = useStore((s) => s.setChatRunId);
  const setCharacterAnimation = useStore((s) => s.setCharacterAnimation);
  const clearStreamingText = useStore((s) => s.clearStreamingText);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);
  const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);
  const setLastResponse = useStore((s) => s.setLastResponse);
  const sessionKey = useStore((s) => s.sessionKey);
  const attachedImage = useStore((s) => s.attachedImage);
  const clearAttachedImage = useStore((s) => s.clearAttachedImage);
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
      const hasImage = !!attachedImage;
      if (!trimmed && !hasImage) return;
      if (chatLoading) return;

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
        setChatRunId(null);
        setCharacterAnimation("idle");
        return;
      }

      // Build request params
      const params: Record<string, unknown> = {
        sessionKey,
        message: trimmed || "What's in this image?",
        deliver: false,
        idempotencyKey: runId,
      };

      if (hasImage) {
        const base64Data = attachedImage.dataUrl.split(",")[1] ?? "";
        if (base64Data) {
          params.attachments = [
            { type: "image", mimeType: attachedImage.mimeType, content: base64Data },
          ];
        }
        clearAttachedImage();
      }

      try {
        const res = await _gatewayClient.request<{ runId?: string }>("chat.send", params);
        if (typeof res?.runId === "string" && res.runId) {
          setChatRunId(res.runId);
        }
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
      attachedImage,
      clearAttachedImage,
      chatLoading,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit(inputRef.current?.value ?? "");
      } else if (e.key === "Escape") {
        clearAttachedImage();
        if (inputRef.current) inputRef.current.value = "";
        hideChatInput();
      }
    },
    [handleSubmit, hideChatInput, clearAttachedImage],
  );

  const handleRemoveImage = useCallback(() => {
    clearAttachedImage();
  }, [clearAttachedImage]);

  if (!visible) return null;

  return (
    <div className="chat-input-container">
      {attachedImage && (
        <div className="chat-image-preview">
          <img src={attachedImage.dataUrl} alt="attached" className="chat-image-thumb" />
          <button className="chat-image-remove" onClick={handleRemoveImage} title="Remove image">
            x
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        className="chat-input"
        type="text"
        placeholder={attachedImage ? "Add a question... (Enter to send)" : "Ask me anything..."}
        onKeyDown={handleKeyDown}
        maxLength={500}
      />
    </div>
  );
}
