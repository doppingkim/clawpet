import React from "react";

/**
 * Simple markdown-to-React renderer.
 * Supports: **bold**, *italic*, `code`, and newlines (including across line breaks).
 */
export function renderMarkdown(text: string): React.ReactNode {
  const ctx = { key: 0 };
  const parts = renderWithMarkdown(text, ctx);
  return parts.length === 0 ? text : parts;
}

function renderWithMarkdown(text: string, ctx: { key: number }): React.ReactNode[] {
  // Match **bold**, *italic*, `code` — [\s\S] allows matching across newlines
  const pattern = /(\*\*([\s\S]+?)\*\*|\*([\s\S]+?)\*|`([^`]+)`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      injectTextWithBreaks(parts, text.slice(lastIndex, match.index), ctx);
    }

    if (match[2] !== undefined) {
      // **bold** — inner content may contain newlines
      const inner: React.ReactNode[] = [];
      injectTextWithBreaks(inner, match[2], ctx);
      parts.push(<strong key={ctx.key++}>{inner}</strong>);
    } else if (match[3] !== undefined) {
      // *italic*
      const inner: React.ReactNode[] = [];
      injectTextWithBreaks(inner, match[3], ctx);
      parts.push(<em key={ctx.key++}>{inner}</em>);
    } else if (match[4] !== undefined) {
      // `code`
      parts.push(
        <code key={ctx.key++} style={{ background: "rgba(0,0,0,0.08)", padding: "1px 3px", borderRadius: 3 }}>
          {match[4]}
        </code>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    injectTextWithBreaks(parts, text.slice(lastIndex), ctx);
  }

  return parts;
}

function injectTextWithBreaks(parts: React.ReactNode[], text: string, ctx: { key: number }) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) parts.push(<br key={ctx.key++} />);
    if (line) parts.push(line);
  });
}
