export type LocalChatRole = "user" | "assistant";

export type LocalChatEntry = {
  id: string;
  role: LocalChatRole;
  text: string;
  timestamp: number;
};

const STORAGE_KEY = "clawpet-local-chat-history-v1";
const MAX_ENTRIES = 600;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeEntry(value: unknown): LocalChatEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LocalChatEntry>;
  if (row.role !== "user" && row.role !== "assistant") return null;
  if (typeof row.text !== "string") return null;
  if (typeof row.timestamp !== "number" || !Number.isFinite(row.timestamp)) return null;

  const text = row.text.trim();
  if (!text) return null;

  return {
    id: typeof row.id === "string" && row.id ? row.id : createId(),
    role: row.role,
    text,
    timestamp: row.timestamp,
  };
}

export function readLocalChatHistory(): LocalChatEntry[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeEntry(item))
      .filter((item): item is LocalChatEntry => item !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

function writeLocalChatHistory(entries: LocalChatEntry[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function appendLocalChatHistory(role: LocalChatRole, text: string): LocalChatEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const entries = readLocalChatHistory();
  const next: LocalChatEntry = {
    id: createId(),
    role,
    text: trimmed,
    timestamp: Date.now(),
  };

  const merged = [...entries, next];
  const capped = merged.length > MAX_ENTRIES ? merged.slice(-MAX_ENTRIES) : merged;
  writeLocalChatHistory(capped);
  return next;
}

