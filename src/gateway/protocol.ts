export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: {
    sessionDefaults?: {
      mainSessionKey?: string;
    };
  };
  auth?: {
    role?: string;
    scopes?: string[];
  };
  policy?: { tickIntervalMs?: number };
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export const PROTOCOL_VERSION = 3;

export const CLIENT_INFO = {
  id: "webchat" as const,
  version: "0.1.0",
  platform: "windows",
  mode: "webchat" as const,
};
