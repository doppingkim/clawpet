import { create } from 'zustand';
import { getTaskBubble, getStateBubble, getIdleMoodBubble } from './bubbleTemplates';

type HeldItem = 'none' | 'book' | 'watering' | 'duster' | 'roller';
type Effect = 'none' | 'water' | 'dust';

/** 서버에서 받아온 동적 카테고리 */
export interface CategoryDef {
  id: string;
  label: string;
  target: { x: number; y: number };
  icon: string;
  builtIn: boolean;
}

type State = {
  hunger: number;
  affection: number;
  energy: number;
  statusText: string;
  thoughtText: string;
  petX: number;
  petY: number;
  targetX: number;
  targetY: number;
  heldItem: HeldItem;
  effect: Effect;
  effectUntil: number;
  lastTaskAt: number;
  lastInteractAt: number;  // 마지막 상호작용 시각 (feed/pet/chat)
  idleStep: number;
  idleAt: number;
  jumpUntil: number;
  reactUntil: number;
  feedCount: number;
  petCount: number;
  feedResetAt: number;
  petResetAt: number;
  roomDark: boolean;
  dynamicCategories: CategoryDef[];
  currentCategory: string;  // 현재 작업 카테고리
  feed: () => void;
  pet: () => void;
  rest: () => void;
  tick: () => void;
  tickMove: () => void;
  reactPetClick: () => void;
  toggleRoomLight: () => void;
  say: (text: string, durationMs?: number) => void;
  setTaskState: (status: string, summary?: string, category?: string) => void;
  setDynamicCategories: (cats: CategoryDef[]) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const TARGET: Record<string, { x: number; y: number }> = {
  laptop: { x: 190, y: 344 },
  cart: { x: 368, y: 420 },
  calendar: { x: 412, y: 268 },
  shelf: { x: 400, y: 142 },
  plant: { x: 440, y: 404 },
  bed: { x: 214, y: 214 },
  bedSleep: { x: 124, y: 96 },
  cushion: { x: 190, y: 344 },
  desk: { x: 162, y: 342 },
  center: { x: 260, y: 300 },
  guitar: { x: 320, y: 200 },
  stove: { x: 380, y: 290 },
  canvas: { x: 440, y: 210 },
  gamepad: { x: 235, y: 290 },
  notebook: { x: 145, y: 420 }
};

const builtInCategoryTarget: Record<string, string> = {
  coding: 'laptop',
  shopping: 'cart',
  calendar: 'calendar',
  writing: 'shelf',
  research: 'desk',
  music: 'guitar',
  cooking: 'stove',
  art: 'canvas',
  gaming: 'gamepad',
  learning: 'notebook',
  communication: 'laptop',
  finance: 'laptop'
};

const BLOCKS = [
  { x1: 52, y1: 52, x2: 260, y2: 196 },
  { x1: 300, y1: 52, x2: 456, y2: 194 },
  { x1: 28, y1: 250, x2: 138, y2: 500 },
  { x1: 306, y1: 430, x2: 486, y2: 504 }
];

function isBlocked(x: number, y: number) {
  if (x < 52 || x > 462 || y < 82 || y > 474) return true;
  const r = 16;
  return BLOCKS.some((b) => x + r > b.x1 && x - r < b.x2 && y + r > b.y1 && y - r < b.y2);
}

function nearestWalkable(x: number, y: number) {
  if (!isBlocked(x, y)) return { x, y };
  const radii = [10, 20, 30, 40, 55, 70, 90];
  for (const r of radii) {
    for (let a = 0; a < 360; a += 20) {
      const rad = (a * Math.PI) / 180;
      const nx = Math.round(x + Math.cos(rad) * r);
      const ny = Math.round(y + Math.sin(rad) * r);
      if (!isBlocked(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x: 260, y: 300 };
}

const IDLE_STEPS = [
  { target: 'shelf', msg: '책장으로 이동 중...', hold: 3000, held: 'none', effect: 'none' },
  { target: 'cushion', msg: '만화책 보러 가는 중...', hold: 3000, held: 'book', effect: 'none' },
  { target: 'cushion', msg: '만화책 보는 중...', hold: 30000, held: 'book', effect: 'none' },
  { target: 'bed', msg: '낮잠 자러 침대로 이동...', hold: 3000, held: 'none', effect: 'none' },
  { target: 'bedSleep', msg: '침대에서 낮잠 자는 중...', hold: 180000, held: 'none', effect: 'none' },
  { target: 'plant', msg: '물 주러 가야겠다', hold: 3000, held: 'none', effect: 'none' },
  { target: 'plant', msg: '칙칙~', hold: 5000, held: 'watering', effect: 'water' },
  { target: 'desk', msg: '청소 상태 확인 중...', hold: 3000, held: 'none', effect: 'none' },
  { target: 'shelf', msg: '책장 앞까지 이동 중...', hold: 3000, held: 'none', effect: 'none' },
  { target: 'shelf', msg: '책장 먼지 털어주는 중...', hold: 30000, held: 'duster', effect: 'dust' },
  { target: 'bed', msg: '이불 돌돌이 하러 가는 중...', hold: 3000, held: 'none', effect: 'none' },
  { target: 'bed', msg: '이불 돌돌이 하는 중...', hold: 30000, held: 'roller', effect: 'none' },
  { target: 'calendar', msg: '달력 보러 가는 중...', hold: 3000, held: 'none', effect: 'none' },
  { target: 'calendar', msg: '달력 확인 중...', hold: 8000, held: 'none', effect: 'none' },
  { target: 'cart', msg: '장바구니 정리하러 가야지', hold: 3000, held: 'none', effect: 'none' },
  { target: 'cart', msg: '장바구니 정리 중...', hold: 30000, held: 'none', effect: 'none' },
  { target: 'center', msg: '', hold: 5000, held: 'none', effect: 'none' }
] as const;

export const usePetStore = create<State>((set) => ({
  hunger: 22,
  affection: 62,
  energy: 78,
  statusText: '',
  thoughtText: '',
  petX: 256,
  petY: 300,
  targetX: 256,
  targetY: 300,
  heldItem: 'none',
  effect: 'none',
  effectUntil: 0,
  lastTaskAt: Date.now(),
  lastInteractAt: Date.now(),
  idleStep: 0,
  idleAt: Date.now(),
  jumpUntil: 0,
  reactUntil: 0,
  feedCount: 0,
  petCount: 0,
  feedResetAt: Date.now(),
  petResetAt: Date.now(),
  roomDark: false,
  dynamicCategories: [],
  currentCategory: '',

  setDynamicCategories: (cats) => set({ dynamicCategories: cats }),

  feed: () => set((s) => {
    const now = Date.now();
    const expired = now - s.feedResetAt > 10 * 60 * 1000;
    const count = expired ? 0 : s.feedCount;
    if (count >= 2) return { statusText: '한번에 다 못먹어요!', reactUntil: now + 2000, lastTaskAt: now, lastInteractAt: now, feedCount: count, feedResetAt: expired ? now : s.feedResetAt };
    return {
      hunger: clamp(s.hunger - 22, 0, 100),
      affection: clamp(s.affection + 2, 0, 100),
      statusText: '냠냠~ 맛있다! 🍙',
      reactUntil: now + 2500,
      lastTaskAt: now,
      lastInteractAt: now,
      idleStep: 0,
      idleAt: now,
      heldItem: 'none' as HeldItem,
      effect: 'none' as Effect,
      effectUntil: 0,
      feedCount: count + 1,
      feedResetAt: expired ? now : s.feedResetAt
    };
  }),

  pet: () => set((s) => {
    const now = Date.now();
    const expired = now - s.petResetAt > 10 * 60 * 1000;
    const count = expired ? 0 : s.petCount;
    if (count >= 3) return { statusText: '너무 많이 쓰다듬는 거아니에요?', reactUntil: now + 2000, lastTaskAt: now, lastInteractAt: now, petCount: count, petResetAt: expired ? now : s.petResetAt };
    const msgs = ['기분 좋아~ ❤️', '으헤헤 간지러워~', '더 해줘요! 🥰', '좋아좋아~!'];
    return {
      affection: clamp(s.affection + 12, 0, 100),
      statusText: msgs[Math.floor(Math.random() * msgs.length)],
      reactUntil: now + 2500,
      lastTaskAt: now,
      lastInteractAt: now,
      idleStep: 0,
      idleAt: now,
      heldItem: 'none' as HeldItem,
      effect: 'none' as Effect,
      effectUntil: 0,
      petCount: count + 1,
      petResetAt: expired ? now : s.petResetAt
    };
  }),

  rest: () => set((s) => s),

  toggleRoomLight: () => set((s) => {
    const dark = !s.roomDark;
    const now = Date.now();
    return {
      roomDark: dark,
      statusText: dark ? '어두워...' : '밝아졌어!',
      reactUntil: now + 2000
    };
  }),

  // 1분마다 실행 — 상태 감쇠
  tick: () => set((s) => {
    const now = Date.now();
    // 포만감: 1분마다 +1 (배고파짐)
    const hunger = clamp(s.hunger + 1, 0, 100);
    // 에너지: 2분마다 -1 → 1분마다 -0.5
    const energy = clamp(s.energy - 0.5, 0, 100);
    // 애정도: 5분간 상호작용 없으면 1분마다 -1, 있으면 감소 없음
    const noInteract = now - s.lastInteractAt > 5 * 60 * 1000;
    const affection = clamp(s.affection - (noInteract ? 1 : 0), 0, 100);

    let statusText = s.statusText;
    let reactUntil = s.reactUntil;

    // reactUntil 만료 처리
    if (reactUntil > 0 && now > reactUntil) {
      statusText = '';
      reactUntil = 0;
    }

    // 상태 기반 말풍선 (reactUntil이 비어있을 때만)
    if (!statusText || reactUntil === 0) {
      const stateMsg = getStateBubble({ hunger, affection, energy });
      if (stateMsg) {
        statusText = stateMsg;
        reactUntil = now + 8000; // 8초 표시
      }
    }

    return { hunger, affection, energy, statusText, reactUntil };
  }),

  tickMove: () => set((s) => {
    const now = Date.now();

    let targetX = s.targetX;
    let targetY = s.targetY;
    let idleStep = s.idleStep;
    let idleAt = s.idleAt;
    let heldItem: HeldItem = s.heldItem;
    let effect: Effect = s.effect;
    let effectUntil = s.effectUntil;
    let statusText = s.statusText;

    const isIdleTime = now - s.lastTaskAt > 18000;
    const isAtTarget = Math.hypot(s.targetX - s.petX, s.targetY - s.petY) < 5;

    if (isIdleTime && isAtTarget && now - s.idleAt > IDLE_STEPS[s.idleStep].hold) {
      idleStep = (idleStep + 1) % IDLE_STEPS.length;
      idleAt = now;
      const step = IDLE_STEPS[idleStep];
      const p = TARGET[step.target];
      const skipCollision = step.target === 'bedSleep' || step.target === 'shelf';
      const safe = skipCollision ? p : nearestWalkable(p.x, p.y);
      targetX = safe.x;
      targetY = safe.y;
      heldItem = step.held as HeldItem;
      statusText = step.msg;
      effect = step.effect as Effect;
      effectUntil = step.effect === 'water' ? now + 4000 : step.effect === 'dust' ? now + 4000 : 0;

      // center에 도착하면 idle 감정 말풍선 (가끔)
      if (step.target === 'center' && !step.msg) {
        const moodMsg = getIdleMoodBubble({ hunger: s.hunger, affection: s.affection, energy: s.energy });
        if (moodMsg) statusText = moodMsg;
      }
    }

    if (effect !== 'none' && now > effectUntil) effect = 'none';
    if (s.reactUntil > 0 && now > s.reactUntil) {
      statusText = '';
      return { petX: s.petX, petY: s.petY, statusText: '', reactUntil: 0, targetX, targetY, idleStep, idleAt, heldItem, effect, effectUntil };
    }

    const speed = 2.8;
    const dx = targetX - s.petX;
    const dy = targetY - s.petY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      return { targetX, targetY, idleStep, idleAt, heldItem, effect, effectUntil, statusText };
    }

    const step = Math.min(speed, dist);
    const candX = s.petX + (dx / dist) * step;
    const candY = s.petY + (dy / dist) * step;

    let nx = s.petX;
    let ny = s.petY;

    const allowPassBlocked = statusText.includes('침대에서 낮잠') || statusText.includes('책장');
    const escapingBlockedZone = isBlocked(s.petX, s.petY);
    const blockedXY = (allowPassBlocked || escapingBlockedZone) ? false : isBlocked(candX, candY);
    const blockedX = (allowPassBlocked || escapingBlockedZone) ? false : isBlocked(candX, s.petY);
    const blockedY = (allowPassBlocked || escapingBlockedZone) ? false : isBlocked(s.petX, candY);

    if (!blockedXY) { nx = candX; ny = candY; }
    else if (!blockedX) nx = candX;
    else if (!blockedY) ny = candY;

    return { petX: nx, petY: ny, targetX, targetY, idleStep, idleAt, heldItem, effect, effectUntil, statusText };
  }),

  reactPetClick: () => set((s) => {
    const now = Date.now();
    const msgs = ['왜요?', '뭐? 🤨', '부르셨나요?', '헤?'];
    return {
      statusText: msgs[Math.floor(Math.random() * msgs.length)],
      jumpUntil: now + 2000,
      reactUntil: now + 2000,
      lastTaskAt: now,
      lastInteractAt: now
    };
  }),

  say: (text, durationMs = 2000) => set(() => {
    const now = Date.now();
    return {
      statusText: (text || '').slice(0, 100),
      reactUntil: now + durationMs,
      lastTaskAt: now,
      lastInteractAt: now,
      idleStep: 0,
      idleAt: now,
      heldItem: 'none' as HeldItem,
      effect: 'none' as Effect,
      effectUntil: 0
    };
  }),

  setTaskState: (status, _summary, category = 'other') => set((s) => {
    let targetX = s.targetX;
    let targetY = s.targetY;

    // 1) 기본 내장 카테고리
    const builtInKey = builtInCategoryTarget[category];
    if (builtInKey && TARGET[builtInKey]) {
      const safe = nearestWalkable(TARGET[builtInKey].x, TARGET[builtInKey].y);
      targetX = safe.x;
      targetY = safe.y;
    }

    // 감정 기반 말풍선
    const mood = { hunger: s.hunger, affection: s.affection, energy: s.energy };
    let statusText = '';
    if (status === 'done') {
      statusText = '완료! ✨';
    } else if (status === 'error') {
      statusText = '에러 확인 중... 🔍';
    } else {
      statusText = getTaskBubble(category, mood);
    }

    return {
      statusText,
      targetX,
      targetY,
      heldItem: 'none',
      effect: 'none',
      effectUntil: 0,
      reactUntil: 0,
      idleStep: 0,
      idleAt: Date.now(),
      lastTaskAt: Date.now(),
      currentCategory: category
    };
  })
}));
