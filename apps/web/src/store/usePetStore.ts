import { create } from 'zustand';

type Category = 'coding' | 'shopping' | 'calendar' | 'writing' | 'research' | 'other';
type HeldItem = 'none' | 'book' | 'watering' | 'duster';
type Effect = 'none' | 'water' | 'dust';

type Scores = Record<Category, number>;

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
  scores: Scores;
  heldItem: HeldItem;
  effect: Effect;
  effectUntil: number;
  lastTaskAt: number;
  idleStep: number;
  idleAt: number;
  jumpUntil: number;
  reactUntil: number;
  feedCount: number;
  petCount: number;
  feedResetAt: number;
  petResetAt: number;
  roomDark: boolean;
  feed: () => void;
  pet: () => void;
  rest: () => void;
  tick: () => void;
  tickMove: () => void;
  reactPetClick: () => void;
  toggleRoomLight: () => void;
  say: (text: string, durationMs?: number) => void;
  setTaskState: (status: string, summary?: string, category?: Category) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const TARGET = {
  laptop: { x: 190, y: 344 },
  cart: { x: 368, y: 420 },
  calendar: { x: 412, y: 268 },
  shelf: { x: 400, y: 142 },
  plant: { x: 440, y: 404 },
  bed: { x: 214, y: 214 },
  bedSleep: { x: 124, y: 96 },
  cushion: { x: 190, y: 344 },
  desk: { x: 162, y: 342 },
  center: { x: 260, y: 300 }
};

const categoryToTarget: Partial<Record<Category, keyof typeof TARGET>> = {
  coding: 'laptop',
  shopping: 'cart',
  calendar: 'calendar',
  writing: 'shelf',
  research: 'desk'
};

const emptyScores: Scores = { coding: 0, shopping: 0, calendar: 0, writing: 0, research: 0, other: 0 };

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
  { target: 'bed', msg: '이불 돌돌이 하는 중...', hold: 5000, held: 'none', effect: 'none' },
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
  scores: emptyScores,
  heldItem: 'none',
  effect: 'none',
  effectUntil: 0,
  lastTaskAt: Date.now(),
  idleStep: 0,
  idleAt: Date.now(),
  jumpUntil: 0,
  reactUntil: 0,
  feedCount: 0,
  petCount: 0,
  feedResetAt: Date.now(),
  petResetAt: Date.now(),
  roomDark: false,

  feed: () => set((s) => {
    const now = Date.now();
    const expired = now - s.feedResetAt > 10 * 60 * 1000;
    const count = expired ? 0 : s.feedCount;
    if (count >= 2) return { statusText: '한번에 다 못먹어요!', reactUntil: now + 2000, lastTaskAt: now, feedCount: count, feedResetAt: expired ? now : s.feedResetAt };
    return {
      hunger: clamp(s.hunger - 22, 0, 100),
      affection: clamp(s.affection + 2, 0, 100),
      statusText: '밥 먹는 중...',
      reactUntil: now + 2500,
      lastTaskAt: now,
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
    if (count >= 3) return { statusText: '너무 많이 쓰다듬는 거아니에요?', reactUntil: now + 2000, lastTaskAt: now, petCount: count, petResetAt: expired ? now : s.petResetAt };
    return {
      affection: clamp(s.affection + 12, 0, 100),
      statusText: '쓰다듬 받는 중...',
      reactUntil: now + 2500,
      lastTaskAt: now,
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

  tick: () => set((s) => {
    const now = Date.now();
    const hunger = clamp(s.hunger + 1, 0, 100);
    const affection = clamp(s.affection - 0.12, 0, 100);
    const energy = clamp(s.energy - 0.55, 0, 100);
    let statusText = s.statusText;
    if (s.reactUntil > 0 && now > s.reactUntil) { statusText = ''; }
    if (hunger > 78) statusText = '배고픈 상태...';
    else if (energy < 22) statusText = '졸린 상태...';
    else if (affection < 20) statusText = '외로운 상태...';
    return { hunger, affection, energy, statusText, reactUntil: (s.reactUntil > 0 && now > s.reactUntil) ? 0 : s.reactUntil };
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
      // bedSleep and shelf are inside blocked zones — skip nearestWalkable for them
      const skipCollision = step.target === 'bedSleep' || step.target === 'shelf';
      const safe = skipCollision ? p : nearestWalkable(p.x, p.y);
      targetX = safe.x;
      targetY = safe.y;
      heldItem = step.held as HeldItem;
      statusText = step.msg;
      effect = step.effect as Effect;
      effectUntil = step.effect === 'water' ? now + 4000 : step.effect === 'dust' ? now + 4000 : 0;
    }

    if (effect !== 'none' && now > effectUntil) effect = 'none';
    if (s.reactUntil > 0 && now > s.reactUntil) {
      statusText = '';
      // reactUntil을 0으로 리셋하여 이후 새 statusText 설정 시 재클리어 방지
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

  reactPetClick: () => set(() => {
    const now = Date.now();
    return { statusText: '왜요?', jumpUntil: now + 2000, reactUntil: now + 2000, lastTaskAt: now };
  }),

  say: (text, durationMs = 2000) => set(() => {
    const now = Date.now();
    return {
      statusText: (text || '').slice(0, 100),
      reactUntil: now + durationMs,
      lastTaskAt: now,
      idleStep: 0,
      idleAt: now,
      heldItem: 'none' as HeldItem,
      effect: 'none' as Effect,
      effectUntil: 0
    };
  }),

  setTaskState: (status, _summary, category = 'other') => set((s) => {
    const nextScores = { ...s.scores, [category]: s.scores[category] + 1 } as Scores;
    const key = categoryToTarget[category];
    let targetX = s.targetX;
    let targetY = s.targetY;
    if (key) {
      const safe = nearestWalkable(TARGET[key].x, TARGET[key].y);
      targetX = safe.x;
      targetY = safe.y;
    }

    const statusLabel = status === 'thinking' ? '생각중...' : status === 'working' ? '진행 중...' : status === 'done' ? '완료!' : status === 'error' ? '에러 확인 중...' : '';
    const categoryLabel: Record<Category, string> = {
      coding: '코딩 작업', shopping: '장바구니 정리', calendar: '일정 확인', writing: '글쓰기 작업', research: '자료 조사', other: '기타 작업'
    };

    return {
      statusText: statusLabel ? `${categoryLabel[category]} ${statusLabel}` : '',
      scores: nextScores,
      targetX,
      targetY,
      heldItem: 'none',
      effect: 'none',
      effectUntil: 0,
      reactUntil: 0,
      idleStep: 0,
      idleAt: Date.now(),
      lastTaskAt: Date.now()
    };
  })
}));
