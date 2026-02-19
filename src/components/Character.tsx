import { useCallback, useRef } from "react";
import { useStore } from "../store/useStore";
import { useAnimation } from "../hooks/useAnimation";
import { useDrag } from "../hooks/useDrag";
import "./Character.css";

const SPRITE_MAP = {
  idle: "/sprites/clawgotchi-idle.png",
  talking: "/sprites/clawgotchi-talk.png",
  thinking: "/sprites/clawgotchi-think.png",
  sleeping: "/sprites/clawgotchi-sleep.png",
};

export function Character() {
  const animation = useStore((s) => s.characterAnimation);
  const showChatInput = useStore((s) => s.showChatInput);
  const connectionState = useStore((s) => s.connectionState);
  const parchmentVisible = useStore((s) => s.parchmentVisible);
  const frame = useAnimation(animation);
  const { onMouseDown, onMouseMove, onMouseUp, isDragging } = useDrag();
  const lastClickRef = useRef(0);

  const handleClick = useCallback(() => {
    // Don't handle click if we just finished dragging
    if (isDragging.current) return;
    if (connectionState !== "connected") return;
    if (parchmentVisible) return;
    const now = Date.now();
    if (now - lastClickRef.current < 400) {
      // Double-click detected
      showChatInput();
    }
    lastClickRef.current = now;
  }, [connectionState, showChatInput, isDragging, parchmentVisible]);

  const spriteUrl = SPRITE_MAP[animation];
  const offsetX = frame * 128; // 64px frame * 2x scale = 128px per frame

  return (
    <div
      className="character"
      style={{
        backgroundImage: `url(${spriteUrl})`,
        backgroundPosition: `-${offsetX}px 0`,
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onClick={handleClick}
    />
  );
}
