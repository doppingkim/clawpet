import { useDrag } from "../hooks/useDrag";
import "./DisconnectedOverlay.css";

export function DisconnectedOverlay() {
  const { onMouseDown, onMouseMove, onMouseUp } = useDrag();

  return (
    <div
      className="disconnected-overlay"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="disconnected-character">
        <img
          src="/sprites/clawgotchi-sleep.png"
          alt="sleeping"
          className="disconnected-sprite"
        />
      </div>
      <div className="disconnected-text">Cannot connect to OpenClaw</div>
    </div>
  );
}
