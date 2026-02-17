import { create } from 'zustand';
import { getTaskBubble, getStateBubble, getIdleMoodBubble } from './bubbleTemplates';

type HeldItem = 'none' | 'book' | 'watering' | 'duster' | 'roller';
type SleepPhase = 'none' | 'moving' | 'settling' | 'blanketed' | 'sleeping' | 'waking';
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
  taskLockedUntil: number;  // 작업 고정 만료 시각 (0이면 미고정)
  sleepPhase: SleepPhase;  // 수면 단계 추적
  monologueEnabled: boolean;  // 혼잣말 on/off
  feed: () => void;
  pet: () => void;
  rest: () => void;
  tick: () => void;
  tickMove: () => void;
  reactPetClick: () => void;
  toggleRoomLight: () => void;
  toggleMonologue: () => void;
  say: (text: string, durationMs?: number) => void;
  setTaskState: (status: string, summary?: string, category?: string) => void;
  setDynamicCategories: (cats: CategoryDef[]) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const TARGET: Record<string, { x: number; y: number }> = {
  laptop: { x: 190, y: 344 },
  cart: { x: 368, y: 420 },
  calendar: { x: 440, y: 218 },
  shelf: { x: 400, y: 142 },
  plant: { x: 440, y: 404 },
  bed: { x: 214, y: 170 },
  bedSleep: { x: 124, y: 96 },
  cushion: { x: 190, y: 344 },
  desk: { x: 162, y: 342 },
  center: { x: 260, y: 300 },
  guitar: { x: 320, y: 200 },
  stove: { x: 380, y: 290 },
  canvas: { x: 440, y: 210 },
  gamepad: { x: 235, y: 290 },
  notebook: { x: 145, y: 420 },
  notepad: { x: 165, y: 370 },
};

const builtInCategoryTarget: Record<string, string> = {
  coding: 'laptop',
  shopping: 'cart',
  calendar: 'calendar',
  writing: 'notepad',
  research: 'shelf',
  music: 'guitar',
  cooking: 'stove',
  art: 'canvas',
  gaming: 'gamepad',
  learning: 'shelf',
  communication: 'calendar',
  finance: 'laptop',
  other: 'laptop'
};

const BLOCKS = [
  { x1: 52, y1: 52, x2: 260, y2: 196 },   // 침대 영역
  { x1: 300, y1: 52, x2: 456, y2: 194 },   // 책장/기타/캔버스 영역
  { x1: 28, y1: 250, x2: 138, y2: 500 },   // 왼쪽 벽
  { x1: 306, y1: 430, x2: 486, y2: 504 },  // 우하단
  { x1: 358, y1: 265, x2: 408, y2: 312 }   // 가스레인지 (통과 불가)
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
  // 책장 → 만화책
  { target: 'shelf', msg: '어디 보자... 읽을 거 뭐 있나', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'cushion', msg: '만화책 보러 가는 중~', hold: 3000, held: 'book', effect: 'none', doneMsg: '' },
  { target: 'cushion', msg: '만화책 보는 중... 📖', hold: 30000, held: 'book', effect: 'none', doneMsg: '재밌었다! 다음 권도 궁금해~' },
  // 침대 낮잠 (sleepPhase 시스템으로 관리)
  { target: 'bed', msg: '하아~ 졸리다... 낮잠 자야겠다', hold: 3000, held: 'none', effect: 'none', doneMsg: '', sleepStart: true },
  { target: 'bedSleep', msg: '', hold: 180000, held: 'none', effect: 'none', doneMsg: '잘 잤다! 개운해~ 😊', sleepEnd: true },
  // 식물 물주기
  { target: 'plant', msg: '화분한테 가야겠다 🌱', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'plant', msg: '칙칙~ 💦', hold: 5000, held: 'watering', effect: 'water', doneMsg: '다 줬다! 쑥쑥 자라렴~' },
  // 🎸 기타 연주
  { target: 'guitar', msg: '기타 좀 쳐볼까~ 🎸', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'guitar', msg: '둥가둥가~ 🎶', hold: 20000, held: 'none', effect: 'none', doneMsg: '기분 좋다! 한 곡 완성~ 🎵' },
  // 청소
  { target: 'desk', msg: '청소 상태 확인해봐야지', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'shelf', msg: '책장 먼지 좀 털어야겠다', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'shelf', msg: '싹싹~ 먼지 털어주는 중 🧹', hold: 30000, held: 'duster', effect: 'dust', doneMsg: '깨끗해졌다! 뿌듯해~ ✨' },
  // 🎨 캔버스 그림 그리기
  { target: 'canvas', msg: '그림 좀 그려볼까 🎨', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'canvas', msg: '슥슥~ 그림 그리는 중 🖌️', hold: 25000, held: 'none', effect: 'none', doneMsg: '완성! ...나 천재인 듯? 😎' },
  // 이불 돌돌이
  { target: 'bed', msg: '이불 정리해야지~', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'bed', msg: '이불 돌돌이 중... 🧻', hold: 30000, held: 'roller', effect: 'none', doneMsg: '보송보송해졌다! 기분 좋아~' },
  // 🍳 가스레인지 요리
  { target: 'stove', msg: '뭔가 만들어 먹을까... 🤔', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'stove', msg: '지글지글~ 요리 중! 🍳', hold: 20000, held: 'none', effect: 'none', doneMsg: '맛있게 완성! 요리왕~ 🍲' },
  // 달력
  { target: 'calendar', msg: '달력 한번 볼까~', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'calendar', msg: '일정 확인 중... 📅', hold: 8000, held: 'none', effect: 'none', doneMsg: '확인 완료! 다음 일정은... 음...' },
  // 🎮 게임
  { target: 'gamepad', msg: '게임 한 판 할까! 🎮', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'gamepad', msg: '집중... 게임 중! 🕹️', hold: 25000, held: 'none', effect: 'none', doneMsg: '이겼다!! 역시 나야~ 🏆' },
  // 장바구니 정리
  { target: 'cart', msg: '장바구니 좀 정리하자', hold: 3000, held: 'none', effect: 'none', doneMsg: '' },
  { target: 'cart', msg: '장바구니 정리 중... 🛒', hold: 30000, held: 'none', effect: 'none', doneMsg: '깔끔하게 정리 끝! 👍' },
  // 센터 (쉬기)
  { target: 'center', msg: '', hold: 5000, held: 'none', effect: 'none', doneMsg: '' }
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
  taskLockedUntil: 0,
  sleepPhase: 'none',
  monologueEnabled: true,

  setDynamicCategories: (cats) => set({ dynamicCategories: cats }),

  toggleMonologue: () => set((s) => ({ monologueEnabled: !s.monologueEnabled })),

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
    // 자고 있으면 창문 열고 닫아도 반응 안 함
    if (s.sleepPhase === 'sleeping' || s.sleepPhase === 'blanketed' || s.sleepPhase === 'settling') {
      return {};
    }
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
    let currentCategory = s.currentCategory;
    let taskLockedUntil = s.taskLockedUntil;

    // 작업 고정 타임아웃 만료 → 자동 해제 (5분 안전장치)
    if (taskLockedUntil > 0 && now > taskLockedUntil) {
      currentCategory = '';
      taskLockedUntil = 0;
    }

    // reactUntil 만료 처리
    if (reactUntil > 0 && now > reactUntil) {
      statusText = '';
      reactUntil = 0;
    }

    // 상태 기반 말풍선 (작업 중이 아닐 때만)
    if (!currentCategory && (!statusText || reactUntil === 0)) {
      const stateMsg = getStateBubble({ hunger, affection, energy });
      if (stateMsg) {
        statusText = stateMsg;
        reactUntil = now + 8000; // 8초 표시
      }
    }

    return { hunger, affection, energy, statusText, reactUntil, currentCategory, taskLockedUntil };
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
    let sleepPhase: SleepPhase = s.sleepPhase;

    // 작업 고정 중이면 idle 진입 차단 (5분 타임아웃 안전장치)
    const taskLocked = s.taskLockedUntil > now;
    const isIdleTime = !taskLocked && now - s.lastTaskAt > 18000;
    const isAtTarget = Math.hypot(s.targetX - s.petX, s.targetY - s.petY) < 5;

    // 수면 단계 전환 처리 (도착했을 때)
    if (sleepPhase === 'moving' && isAtTarget) {
      // 침대에 도착함 → settling 단계 (회전 준비)
      sleepPhase = 'settling';
      idleAt = now;
      statusText = '으으... 자리 잡는 중...';
    } else if (sleepPhase === 'settling' && now - idleAt > 1500) {
      // 1.5초 후 이불 덮기
      sleepPhase = 'blanketed';
      idleAt = now;
      statusText = '이불 덮었다... 따뜻해... 😴';
    } else if (sleepPhase === 'blanketed' && now - idleAt > 1500) {
      // 1.5초 후 잠들기
      sleepPhase = 'sleeping';
      statusText = '💤';
    } else if (sleepPhase === 'waking') {
      sleepPhase = 'none';
    }

    if (isIdleTime && isAtTarget && now - s.idleAt > IDLE_STEPS[s.idleStep].hold) {
      // 완료 메시지 표시
      const outgoingStep = IDLE_STEPS[idleStep];
      const doneMsg = (outgoingStep as any).doneMsg;

      // 잠에서 깨는 처리
      if ((outgoingStep as any).sleepEnd && sleepPhase === 'sleeping') {
        sleepPhase = 'waking';
        statusText = doneMsg || '잘 잤다! 개운해~ 😊';
      } else if (doneMsg) {
        statusText = doneMsg;
      }

      idleStep = (idleStep + 1) % IDLE_STEPS.length;
      idleAt = now;
      const step = IDLE_STEPS[idleStep];
      const p = TARGET[step.target];
      // 가구 위치에 직접 가야 하는 타겟은 충돌 검사 건너뛰기
      const skipCollision = step.target === 'bedSleep' || step.target === 'shelf'
        || step.target === 'bed' || step.target === 'stove'
        || step.target === 'guitar' || step.target === 'canvas';
      const safe = skipCollision ? p : nearestWalkable(p.x, p.y);
      targetX = safe.x;
      targetY = safe.y;
      heldItem = step.held as HeldItem;
      if (!doneMsg && !((outgoingStep as any).sleepEnd)) {
        statusText = step.msg;
      }
      effect = step.effect as Effect;
      effectUntil = step.effect === 'water' ? now + 4000 : step.effect === 'dust' ? now + 4000 : 0;

      // 수면 시작 처리
      if ((step as any).sleepStart) {
        sleepPhase = 'moving';
      }

      // center에 도착하면 idle 감정 말풍선 (가끔)
      if (step.target === 'center' && !step.msg) {
        const moodMsg = getIdleMoodBubble({ hunger: s.hunger, affection: s.affection, energy: s.energy });
        if (moodMsg) statusText = moodMsg;
      }
    }

    if (effect !== 'none' && now > effectUntil) effect = 'none';
    if (s.reactUntil > 0 && now > s.reactUntil) {
      statusText = '';
      return { petX: s.petX, petY: s.petY, statusText: '', reactUntil: 0, targetX, targetY, idleStep, idleAt, heldItem, effect, effectUntil, sleepPhase };
    }

    const speed = 2.8;
    const dx = targetX - s.petX;
    const dy = targetY - s.petY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      return { targetX, targetY, idleStep, idleAt, heldItem, effect, effectUntil, statusText, sleepPhase };
    }

    const step = Math.min(speed, dist);
    const candX = s.petX + (dx / dist) * step;
    const candY = s.petY + (dy / dist) * step;

    let nx = s.petX;
    let ny = s.petY;

    const isSleepMoving = sleepPhase === 'moving' || sleepPhase === 'settling' || sleepPhase === 'blanketed' || sleepPhase === 'sleeping';
    // 타겟 자체가 블록 영역 안에 있으면 통과 허용 (가구로 이동 중)
    const targetInBlocked = isBlocked(targetX, targetY);
    const allowPassBlocked = isSleepMoving || targetInBlocked;
    const escapingBlockedZone = isBlocked(s.petX, s.petY);
    const blockedXY = (allowPassBlocked || escapingBlockedZone) ? false : isBlocked(candX, candY);
    const blockedX = (allowPassBlocked || escapingBlockedZone) ? false : isBlocked(candX, s.petY);
    const blockedY = (allowPassBlocked || escapingBlockedZone) ? false : isBlocked(s.petX, candY);

    if (!blockedXY) { nx = candX; ny = candY; }
    else if (!blockedX) nx = candX;
    else if (!blockedY) ny = candY;

    return { petX: nx, petY: ny, targetX, targetY, idleStep, idleAt, heldItem, effect, effectUntil, statusText, sleepPhase };
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
      effectUntil: 0,
      sleepPhase: 'none' as SleepPhase
    };
  }),

  setTaskState: (status, summary, category = 'other') => set((s) => {
    let targetX = s.targetX;
    let targetY = s.targetY;

    // 1) 기본 내장 카테고리
    const builtInKey = builtInCategoryTarget[category];
    if (builtInKey && TARGET[builtInKey]) {
      const safe = nearestWalkable(TARGET[builtInKey].x, TARGET[builtInKey].y);
      targetX = safe.x;
      targetY = safe.y;
    }

    // 말풍선: summary 우선, 없으면 템플릿 fallback
    const mood = { hunger: s.hunger, affection: s.affection, energy: s.energy };
    let statusText = '';
    if (status === 'done') {
      statusText = '완료! ✨';
    } else if (status === 'error') {
      statusText = '에러 확인 중... 🔍';
    } else if (summary && summary.trim()) {
      statusText = summary.trim().slice(0, 60);
    } else {
      statusText = getTaskBubble(category, mood);
    }

    const isDone = status === 'done' || status === 'error';

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
      currentCategory: isDone ? '' : category,
      taskLockedUntil: isDone ? 0 : Date.now() + 5 * 60 * 1000,
      sleepPhase: 'none' as SleepPhase
    };
  })
}));
