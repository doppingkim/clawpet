import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GatewayClient } from "../gateway/GatewayClient";
import { extractText } from "../gateway/textExtract";
import { useStore } from "../store/useStore";
import { setGatewayClientRef } from "../components/ChatInput";
import type { ChatEventPayload, GatewayHelloOk } from "../gateway/protocol";

type OpenClawConfig = {
  token: string | null;
  port: number;
};

export function useGateway() {
  const clientRef = useRef<GatewayClient | null>(null);

  const setConnectionState = useStore((s) => s.setConnectionState);
  const setGatewayConfig = useStore((s) => s.setGatewayConfig);
  const setSessionKey = useStore((s) => s.setSessionKey);
  const setCharacterAnimation = useStore((s) => s.setCharacterAnimation);
  const appendStreamingText = useStore((s) => s.appendStreamingText);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);
  const setChatRunId = useStore((s) => s.setChatRunId);
  const setLastResponse = useStore((s) => s.setLastResponse);
  const setChatLoading = useStore((s) => s.setChatLoading);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Read config from Rust backend
      let config: OpenClawConfig;
      try {
        config = await invoke<OpenClawConfig>("read_openclaw_config");
        console.log("[gateway] config loaded:", JSON.stringify({ port: config.port, hasToken: !!config.token }));
      } catch (err) {
        console.error("[gateway] failed to read config:", err);
        config = { token: null, port: 18789 };
      }

      if (cancelled) return;
      if (!config.token) {
        console.warn("[gateway] no auth token found");
        setConnectionState("disconnected");
        return;
      }

      const url = `ws://127.0.0.1:${config.port}`;
      setGatewayConfig(url, config.token);

      const client = new GatewayClient({
        url,
        token: config.token,
        onConnecting: () => {
          if (!cancelled) setConnectionState("connecting");
        },
        onHello: (hello: GatewayHelloOk) => {
          if (cancelled) return;
          setConnectionState("connected");
          setCharacterAnimation("idle");

          // Extract session key from snapshot
          const snapshot = hello.snapshot as
            | { sessionDefaults?: { mainSessionKey?: string } }
            | undefined;
          const sessionKey = snapshot?.sessionDefaults?.mainSessionKey ?? "main";
          setSessionKey(sessionKey);
        },
        onEvent: (evt) => {
          if (cancelled) return;
          if (evt.event === "chat") {
            handleChatEvent(evt.payload as ChatEventPayload | undefined);
          }
        },
        onClose: () => {
          if (!cancelled) {
            setConnectionState("disconnected");
            setCharacterAnimation("sleeping");
          }
        },
      });

      clientRef.current = client;
      setGatewayClientRef(client);
      client.start();
    }

    function handleChatEvent(payload?: ChatEventPayload) {
      if (!payload) return;

      const store = useStore.getState();
      if (payload.sessionKey !== store.sessionKey) return;

      // Ignore events from other runs
      if (payload.runId && store.chatRunId && payload.runId !== store.chatRunId) {
        return;
      }

      if (payload.state === "delta") {
        const text = extractText(payload.message);
        if (typeof text === "string") {
          appendStreamingText(text);
          showSpeechBubble(text.length > 100 ? text.slice(0, 100) + "..." : text);
          setCharacterAnimation("talking");
        }
      } else if (payload.state === "final") {
        const text = extractText(payload.message);
        const finalText = text ?? store.streamingText;
        if (finalText) {
          setLastResponse(finalText);
          showSpeechBubble(finalText.length > 100 ? finalText.slice(0, 100) + "..." : finalText);
        }
        setChatRunId(null);
        setChatLoading(false);
        setCharacterAnimation("idle");
      } else if (payload.state === "error") {
        const errMsg = payload.errorMessage ?? "An error occurred";
        showSpeechBubble(errMsg);
        setChatRunId(null);
        setChatLoading(false);
        setCharacterAnimation("idle");
      } else if (payload.state === "aborted") {
        const text = store.streamingText;
        if (text) {
          setLastResponse(text);
          showSpeechBubble(text.length > 100 ? text.slice(0, 100) + "..." : text);
        }
        setChatRunId(null);
        setChatLoading(false);
        setCharacterAnimation("idle");
      }
    }

    init();

    return () => {
      cancelled = true;
      clientRef.current?.stop();
      clientRef.current = null;
      setGatewayClientRef(null);
    };
  }, [
    setConnectionState,
    setGatewayConfig,
    setSessionKey,
    setCharacterAnimation,
    appendStreamingText,
    showSpeechBubble,
    setChatRunId,
    setLastResponse,
    setChatLoading,
  ]);

  return clientRef;
}
