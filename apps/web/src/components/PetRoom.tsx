import { useEffect, useRef } from 'react';
import { usePetStore } from '../store/usePetStore';

const TILE = 32;
const ROOM = 16 * TILE;

type Dir = 'down' | 'left' | 'right' | 'up';
const dirRow: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

export function PetRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petX = usePetStore((s) => s.petX);
  const petY = usePetStore((s) => s.petY);
  const targetX = usePetStore((s) => s.targetX);
  const targetY = usePetStore((s) => s.targetY);
  const heldItem = usePetStore((s) => s.heldItem);
  const effect = usePetStore((s) => s.effect);
  const jumpUntil = usePetStore((s) => s.jumpUntil);
  const statusText = usePetStore((s) => s.statusText);
  const roomDark = usePetStore((s) => s.roomDark);
  const sleepPhase = usePetStore((s) => s.sleepPhase);
  const currentCategory = usePetStore((s) => s.currentCategory);
  const reactPetClick = usePetStore((s) => s.reactPetClick);
  const toggleRoomLight = usePetStore((s) => s.toggleRoomLight);

  const prevRef = useRef({ x: petX, y: petY, frame: 0, t: 0, dir: 'down' as Dir });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ROOM / rect.width;
      const sy = ROOM / rect.height;
      const x = (ev.clientX - rect.left) * sx;
      const y = (ev.clientY - rect.top) * sy;

      // window click area (left wall window)
      if (x >= 14 && x <= 62 && y >= 170 && y <= 286) {
        toggleRoomLight();
        return;
      }

      const drawW = 78;
      const drawH = 78;
      const bx = petX - drawW / 2;
      const by = petY - drawH / 2;
      if (x >= bx && x <= bx + drawW && y >= by && y <= by + drawH) reactPetClick();
    };

    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [petX, petY, reactPetClick, toggleRoomLight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const roomImg = new Image();
    roomImg.src = '/assets/room-custom.png';
    const roomOnImg = new Image();
    roomOnImg.src = '/assets/room-laptop-on.png';
    const roomDarkImg = new Image();
    roomDarkImg.src = '/assets/room-dark.png';

    const charImg = new Image();
    charImg.src = '/assets/character-custom.png';

    const pix = document.createElement('canvas');
    pix.width = 24;
    pix.height = 24;
    const pctx = pix.getContext('2d');
    if (pctx) pctx.imageSmoothingEnabled = false;

    let raf = 0;
    const render = (now: number) => {
      ctx.clearRect(0, 0, ROOM, ROOM);

      const atLaptop = Math.hypot(petX - 190, petY - 344) < 24;
      const laptopCategories = ['coding', 'finance', 'other'];
      const laptopActive = laptopCategories.includes(currentCategory) && atLaptop;
      if (roomDark && roomDarkImg.complete) ctx.drawImage(roomDarkImg, 0, 0, ROOM, ROOM);
      else if (laptopActive && roomOnImg.complete) ctx.drawImage(roomOnImg, 0, 0, ROOM, ROOM);
      else if (roomImg.complete) ctx.drawImage(roomImg, 0, 0, ROOM, ROOM);

      const prev = prevRef.current;
      const dx = petX - prev.x;
      const dy = petY - prev.y;
      const moving = Math.hypot(dx, dy) > 0.2 || Math.hypot(targetX - petX, targetY - petY) > 2;

      if (Math.abs(targetX - petX) > Math.abs(targetY - petY)) prev.dir = targetX > petX ? 'right' : 'left';
      else if (Math.abs(targetY - petY) > 1) prev.dir = targetY > petY ? 'down' : 'up';

      if (moving) {
        if (now - prev.t > 140) {
          prev.frame = (prev.frame + 1) % 3;
          prev.t = now;
        }
      } else prev.frame = 1;

      prev.x = petX;
      prev.y = petY;

      if (charImg.complete && charImg.naturalWidth > 0 && pctx) {
        const frameW = Math.floor(charImg.naturalWidth / 3);
        const frameH = Math.floor(charImg.naturalHeight / 4);
        const sx = prev.frame * frameW;
        const sy = dirRow[prev.dir] * frameH;

        pctx.clearRect(0, 0, 24, 24);
        pctx.drawImage(charImg, sx, sy, frameW, frameH, 0, 0, 24, 24);

        const drawW = 78;
        const drawH = 78;
        const wallNow = Date.now();
        const jumping = wallNow < jumpUntil;
        const jumpOffset = jumping ? Math.round(Math.sin((wallNow % 260) / 260 * Math.PI) * 12) : 0;
        const drawX = Math.round(petX - drawW / 2);
        const drawY = Math.round(petY - drawH / 2 - jumpOffset);

        const atBed = Math.hypot(petX - 140, petY - 110) < 30;
        const isSleeping = (sleepPhase === 'settling' || sleepPhase === 'blanketed' || sleepPhase === 'sleeping') && atBed;
        const showBlanket = (sleepPhase === 'blanketed' || sleepPhase === 'sleeping') && atBed;

        if (isSleeping) {
          // 침대에서 낮잠: 90도 반시계 회전 (눕는 포즈)
          const cx = drawX + drawW / 2;
          const cy = drawY + drawH / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-Math.PI / 2);
          ctx.translate(-cx, -cy);
          ctx.drawImage(pix, 0, 0, 24, 24, drawX, drawY, drawW, drawH);
          // 이불 (회전 상태로 같이 그려짐) — blanketed 이후에만
          if (showBlanket) {
            ctx.fillStyle = '#d6d1c3';
            ctx.fillRect(drawX + 10, drawY + 30, 54, 28);
            ctx.fillStyle = '#9eb3bf';
            ctx.fillRect(drawX + 18, drawY + 36, 12, 10);
            ctx.fillRect(drawX + 36, drawY + 40, 12, 10);
            ctx.strokeStyle = '#4d5f6d';
            ctx.strokeRect(drawX + 10, drawY + 30, 54, 28);
          }
          ctx.restore();

          // Zzz 이펙트 — sleeping 단계에서만
          if (sleepPhase === 'sleeping') {
            const zzz = ['Z', 'z', 'Z'];
            ctx.fillStyle = '#8090a0';
            ctx.font = '10px "Press Start 2P", monospace';
            const t = Date.now() / 800;
            zzz.forEach((c, i) => {
              const ox = petX + 20 + i * 8;
              const oy = petY - 30 - i * 10 + Math.sin(t + i) * 3;
              ctx.globalAlpha = 0.4 + i * 0.2;
              ctx.fillText(c, ox, oy);
            });
            ctx.globalAlpha = 1;
          }
        } else {
          // 일반 상태: 비회전 캐릭터
          ctx.drawImage(pix, 0, 0, 24, 24, drawX, drawY, drawW, drawH);
        }

        // 아이템 렌더
        if (heldItem === 'book') {
          ctx.fillStyle = '#f3e0ab';
          ctx.fillRect(drawX + 44, drawY + 40, 12, 8);
          ctx.strokeStyle = '#3a2b20';
          ctx.strokeRect(drawX + 44, drawY + 40, 12, 8);
        } else if (heldItem === 'watering') {
          ctx.fillStyle = '#7aa4d6';
          ctx.fillRect(drawX + 44, drawY + 38, 12, 9);
          ctx.strokeStyle = '#1f2d46';
          ctx.strokeRect(drawX + 44, drawY + 38, 12, 9);
          ctx.fillStyle = '#9fc7f2';
          ctx.fillRect(drawX + 54, drawY + 41, 4, 2);
        } else if (heldItem === 'duster') {
          ctx.fillStyle = '#d7bf7a';
          ctx.fillRect(drawX + 45, drawY + 39, 11, 3);
          ctx.fillStyle = '#c7c7c7';
          ctx.fillRect(drawX + 52, drawY + 35, 8, 8);
          ctx.strokeStyle = '#505050';
          ctx.strokeRect(drawX + 52, drawY + 35, 8, 8);
        } else if (heldItem === 'roller') {
          // 이불 돌돌이 (먼지 스티커 롤러)
          // 손잡이
          ctx.fillStyle = '#a0a0a0';
          ctx.fillRect(drawX + 46, drawY + 34, 3, 16);
          // 롤러 헤드 (흰색 원통)
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(drawX + 42, drawY + 46, 11, 8);
          ctx.strokeStyle = '#888';
          ctx.strokeRect(drawX + 42, drawY + 46, 11, 8);
          // 접착면 표시 (점선)
          ctx.fillStyle = '#ddd';
          ctx.fillRect(drawX + 44, drawY + 49, 2, 2);
          ctx.fillRect(drawX + 48, drawY + 49, 2, 2);
        }

        if (effect === 'water') {
          ctx.fillStyle = '#8fd4ff';
          for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(petX + 16 + i * 4), Math.round(petY + 6 + (i % 2) * 5), 2, 6);
        } else if (effect === 'dust') {
          ctx.fillStyle = '#d9d9d9';
          for (let i = 0; i < 6; i++) {
            const ox = Math.round(petX + 14 + (i % 3) * 6);
            const oy = Math.round(petY - 8 + Math.floor(i / 3) * 6);
            ctx.fillRect(ox, oy, 2, 2);
          }
          ctx.fillStyle = '#f2f2f2';
          for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(petX + 10 + i * 7), Math.round(petY - 14 - (i % 2) * 2), 1, 1);
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [petX, petY, targetX, targetY, heldItem, effect, jumpUntil, statusText, roomDark, sleepPhase, currentCategory]);

  return <canvas ref={canvasRef} className="roomCanvas" width={ROOM} height={ROOM} />;
}
