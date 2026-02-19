/**
 * Extract plain text from a message content structure.
 * Adapted from OpenClaw's ui/src/ui/chat/message-extract.ts
 *
 * Handles both string content and array-of-blocks content:
 *   { content: "string" }
 *   { content: [{ type: "text", text: "..." }] }
 */
export function extractText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const content = m.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  if (typeof m.text === "string") {
    return m.text;
  }

  return null;
}
