import { useEffect, useState } from "react";
import type { AnimationState } from "../store/useStore";

const ANIM_CONFIG: Record<AnimationState, { frames: number; fps: number }> = {
  idle: { frames: 4, fps: 4 },
  talking: { frames: 4, fps: 6 },
  thinking: { frames: 4, fps: 3 },
  sleeping: { frames: 1, fps: 1 },
};

export function useAnimation(animation: AnimationState): number {
  const [frame, setFrame] = useState(0);
  const config = ANIM_CONFIG[animation];

  useEffect(() => {
    setFrame(0);
    if (config.frames <= 1) return;

    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % config.frames);
    }, 1000 / config.fps);

    return () => clearInterval(interval);
  }, [animation, config.frames, config.fps]);

  return frame;
}
