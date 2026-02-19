import { create } from "zustand";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type AnimationState = "idle" | "talking" | "thinking" | "sleeping";
export type ConnectionState = "disconnected" | "connecting" | "connected";

interface ClawGotchiState {
  // Connection
  connectionState: ConnectionState;
  gatewayUrl: string;
  authToken: string | null;
  sessionKey: string;

  // Chat
  chatInputVisible: boolean;
  chatLoading: boolean;
  chatRunId: string | null;
  streamingText: string;
  lastResponse: string | null;

  // UI
  speechBubbleVisible: boolean;
  speechBubbleText: string;
  parchmentVisible: boolean;
  parchmentText: string;
  characterAnimation: AnimationState;

  // Actions
  setConnectionState: (state: ConnectionState) => void;
  setGatewayConfig: (url: string, token: string | null) => void;
  setSessionKey: (key: string) => void;

  showChatInput: () => void;
  hideChatInput: () => void;
  setChatLoading: (loading: boolean) => void;
  setChatRunId: (id: string | null) => void;
  appendStreamingText: (text: string) => void;
  clearStreamingText: () => void;

  showSpeechBubble: (text: string) => void;
  hideSpeechBubble: () => void;
  showParchment: (text: string) => void;
  hideParchment: () => void;
  setCharacterAnimation: (anim: AnimationState) => void;
  setLastResponse: (text: string | null) => void;
}

export const useStore = create<ClawGotchiState>((set) => ({
  // Connection
  connectionState: "disconnected",
  gatewayUrl: "ws://127.0.0.1:18789",
  authToken: null,
  sessionKey: "main",

  // Chat
  chatInputVisible: false,
  chatLoading: false,
  chatRunId: null,
  streamingText: "",
  lastResponse: null,

  // UI
  speechBubbleVisible: false,
  speechBubbleText: "",
  parchmentVisible: false,
  parchmentText: "",
  characterAnimation: "idle",

  // Actions
  setConnectionState: (connectionState) => set({ connectionState }),
  setGatewayConfig: (gatewayUrl, authToken) => set({ gatewayUrl, authToken }),
  setSessionKey: (sessionKey) => set({ sessionKey }),

  showChatInput: () => set({ chatInputVisible: true, speechBubbleVisible: false }),
  hideChatInput: () => set({ chatInputVisible: false }),
  setChatLoading: (chatLoading) => set({ chatLoading }),
  setChatRunId: (chatRunId) => set({ chatRunId }),
  appendStreamingText: (text) => set({ streamingText: text }),
  clearStreamingText: () => set({ streamingText: "" }),

  showSpeechBubble: (text) => set({ speechBubbleVisible: true, speechBubbleText: text }),
  hideSpeechBubble: () => set({ speechBubbleVisible: false, speechBubbleText: "" }),
  showParchment: (text) => {
    localStorage.setItem("clawgotchi-parchment-text", text);
    set({ parchmentVisible: true, parchmentText: text });

    // Open parchment in a separate window, centered on screen
    (async () => {
      const existing = await WebviewWindow.getByLabel("parchment");
      if (existing) {
        await existing.setFocus();
        return;
      }

      const win = new WebviewWindow("parchment", {
        url: "/",
        center: true,
        width: 500,
        height: 500,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        shadow: false,
      });

      win.once("tauri://destroyed", () => {
        set({ parchmentVisible: false, speechBubbleVisible: false, speechBubbleText: "" });
      });
    })();
  },
  hideParchment: () => {
    set({ parchmentVisible: false, parchmentText: "" });
    // Close the parchment window if open
    (async () => {
      const existing = await WebviewWindow.getByLabel("parchment");
      if (existing) {
        await existing.close();
      }
    })();
  },
  setCharacterAnimation: (characterAnimation) => set({ characterAnimation }),
  setLastResponse: (lastResponse) => set({ lastResponse }),
}));
