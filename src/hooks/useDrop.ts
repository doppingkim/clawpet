import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store/useStore";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_SIZE_LIMIT_MESSAGE = "Image too large! (max 10MB)";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|bmp)([?#].*)?$/i;
const ENABLE_IMAGE_DROP = import.meta.env.VITE_ENABLE_IMAGE_DROP !== "false";
const ENABLE_CLIPBOARD_IMAGE = import.meta.env.VITE_ENABLE_CLIPBOARD_IMAGE !== "false";

type ImageReadResult = { base64: string; mime_type: string };

function isLikelyImageFileName(name: string) {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function extractFirstUrlFromUriList(value: string): string | null {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("#"));
  return line ?? null;
}

function extractImageUrlFromHtml(html: string): string | null {
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const src =
      doc.querySelector("img[src]")?.getAttribute("src") ??
      doc.querySelector("a[href]")?.getAttribute("href");
    return src?.trim() || null;
  } catch {
    return null;
  }
}

function normalizeUrlCandidate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyImageUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  return IMAGE_URL_RE.test(url);
}

function parseDataImageUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex <= 0) return null;

  const header = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  if (!base64) return null;

  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  return { base64, mimeType };
}

export function useDrop() {
  const [isDragOver, setIsDragOver] = useState(false);
  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);
  const setAttachedImage = useStore((s) => s.setAttachedImage);
  const showChatInput = useStore((s) => s.showChatInput);
  const showSpeechBubble = useStore((s) => s.showSpeechBubble);

  const storeImageFromBase64 = useCallback(
    (base64: string, mimeType: string) => {
      const dataUrl = `data:${mimeType};base64,${base64}`;
      setAttachedImage({ dataUrl, mimeType });
      showChatInput();
    },
    [setAttachedImage, showChatInput],
  );

  const handleImageFile = useCallback(
    (file: File) => {
      if (file.size > MAX_SIZE) {
        showSpeechBubble(IMAGE_SIZE_LIMIT_MESSAGE);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const mimeType = file.type || "image/png";
          setAttachedImage({ dataUrl: reader.result, mimeType });
          showChatInput();
        }
      };
      reader.readAsDataURL(file);
    },
    [setAttachedImage, showChatInput, showSpeechBubble],
  );

  const handleImageUrl = useCallback(
    async (url: string) => {
      if (url.startsWith("data:image/")) {
        const parsed = parseDataImageUrl(url);
        if (!parsed) return;
        storeImageFromBase64(parsed.base64, parsed.mimeType);
        return;
      }

      try {
        const result = await invoke<ImageReadResult>("fetch_image_url", { url });
        storeImageFromBase64(result.base64, result.mime_type);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("10MB")) {
          showSpeechBubble(IMAGE_SIZE_LIMIT_MESSAGE);
        } else if (msg.includes("supported image") || msg.includes("not an image")) {
          showSpeechBubble("Only image URLs are supported");
        } else {
          showSpeechBubble("Failed to fetch image");
          console.error("[useDrop] fetch_image_url error:", err);
        }
      }
    },
    [showSpeechBubble, storeImageFromBase64],
  );

  const resolveDroppedImageUrl = useCallback((dt: DataTransfer): string | null => {
    const uriList = dt.getData("text/uri-list");
    const html = dt.getData("text/html");
    const text = dt.getData("text/plain");

    const candidates = [
      extractFirstUrlFromUriList(uriList),
      extractImageUrlFromHtml(html),
      text?.trim() || null,
    ].filter((v): v is string => !!v);

    for (const raw of candidates) {
      const normalized = normalizeUrlCandidate(raw);
      if (normalized && isLikelyImageUrl(normalized)) {
        return normalized;
      }
    }

    return null;
  }, []);

  // Handle file paths from Tauri native drag-drop
  const handleFilePaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;

      for (const path of paths) {
        try {
          const result = await invoke<ImageReadResult>("read_image_file", { path });
          storeImageFromBase64(result.base64, result.mime_type);
          return;
        } catch (err) {
          const msg = String(err);
          if (msg.includes("10MB")) {
            showSpeechBubble(IMAGE_SIZE_LIMIT_MESSAGE);
            return;
          }
          if (msg.includes("Not a supported")) {
            continue;
          }
          showSpeechBubble("Failed to read image");
          console.error("[useDrop] read_image_file error:", err);
          return;
        }
      }
    },
    [storeImageFromBase64, showSpeechBubble],
  );

  // Tauri native drag-drop events
  useEffect(() => {
    if (!ENABLE_IMAGE_DROP) return;
    const active = connectionState === "connected" && !parchmentVisible;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        if (cancelled || !active) return;
        const { type } = event.payload;
        if (type === "enter") {
          setIsDragOver(true);
        } else if (type === "leave") {
          setIsDragOver(false);
        } else if (type === "drop") {
          setIsDragOver(false);
          const paths = (event.payload as { paths: string[] }).paths ?? [];
          void handleFilePaths(paths);
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [connectionState, parchmentVisible, handleFilePaths]);

  // HTML5 drag-drop (browser image/file drops)
  useEffect(() => {
    if (!ENABLE_IMAGE_DROP) return;
    if (connectionState !== "connected" || parchmentVisible) return;

    let dragDepth = 0;

    const hasDropPayload = (dt: DataTransfer | null) => {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return (
        types.includes("Files") ||
        types.includes("text/uri-list") ||
        types.includes("text/html") ||
        types.includes("text/plain")
      );
    };

    const onDragEnter = (e: DragEvent) => {
      if (!hasDropPayload(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth += 1;
      setIsDragOver(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasDropPayload(e.dataTransfer)) return;
      e.preventDefault();
      setIsDragOver(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasDropPayload(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setIsDragOver(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!hasDropPayload(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth = 0;
      setIsDragOver(false);

      const dt = e.dataTransfer;
      if (!dt) return;

      const files = Array.from(dt.files || []);
      const imageFile = files.find(
        (file) => file.type.startsWith("image/") || isLikelyImageFileName(file.name),
      );
      if (imageFile) {
        handleImageFile(imageFile);
        return;
      }

      const imageUrl = resolveDroppedImageUrl(dt);
      if (imageUrl) {
        void handleImageUrl(imageUrl);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      setIsDragOver(false);
    };
  }, [connectionState, parchmentVisible, handleImageFile, handleImageUrl, resolveDroppedImageUrl]);

  // Clipboard paste handler
  useEffect(() => {
    if (!ENABLE_CLIPBOARD_IMAGE) return;
    if (connectionState !== "connected" || parchmentVisible) return;

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
          }
          return;
        }
      }
      // No image found: let normal text paste happen.
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [connectionState, parchmentVisible, handleImageFile]);

  return { isDragOver };
}
