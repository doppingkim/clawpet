/**
 * 감정 기반 말풍선 템플릿 시스템
 * state + taskCategory + mood → 템플릿 선택
 */

type MoodLevel = 'happy' | 'neutral' | 'sad';

interface MoodState {
    hunger: number;   // 0=배부름, 100=극한 배고픔
    affection: number; // 0=최저, 100=최고
    energy: number;    // 0=최저, 100=최고
}

function getMoodLevel(affection: number): MoodLevel {
    if (affection >= 60) return 'happy';
    if (affection >= 30) return 'neutral';
    return 'sad';
}

// 작업 중 말풍선 (카테고리 + 감정)
const TASK_BUBBLES: Record<string, Record<MoodLevel, string[]>> = {
    coding: {
        happy: ['코딩하는 거 좋아 😚', '오늘 코드 짜는 기분 최고!', '버그 잡는 중~ 🎯'],
        neutral: ['코딩 중...', '집중 중이에요', '코드 리뷰 하는 중'],
        sad: ['응… 또 코딩이네…', '혼자 코딩은 좀 외로워', '버그가 너무 많아...'],
    },
    shopping: {
        happy: ['장바구니 정리 재밌어! 🛒', '좋은 거 발견했다!', '쇼핑 도우미 출동~ ✨'],
        neutral: ['장바구니 정리 중...', '가격 비교 중이에요', '배송 확인하는 중'],
        sad: ['또 주문이야…', '장바구니가 끝이 없어', '배송 언제 오려나...'],
    },
    calendar: {
        happy: ['일정 확인 완료! 📅', '오늘 할 일 정리 끝~', '스케줄 관리는 재밌어!'],
        neutral: ['일정 확인 중...', '달력 보는 중이에요', '다음 일정 체크 중'],
        sad: ['일정이 너무 많아…', '쉴 틈이 없네...', '오늘도 바쁘구나…'],
    },
    writing: {
        happy: ['글쓰기 즐거워! ✍️', '영감이 막 떠올라!', '좋은 글 써보자~'],
        neutral: ['글 쓰는 중...', '문서 정리 중이에요', '작성 중입니다'],
        sad: ['글이 안 써져…', '뭘 써야할지 모르겠어', '영감이 안 와...'],
    },
    research: {
        happy: ['조사하는 거 흥미로워! 🔍', '자료 찾기 재밌다~', '새로운 발견!'],
        neutral: ['자료 조사 중...', '검색하는 중이에요', '분석 진행 중'],
        sad: ['찾아도 안 나와…', '자료가 부족해...', '조사 끝이 안 보여'],
    },
    music: {
        happy: ['신나는 노래~ 🎵', '리듬 타는 중!', '음악 들으면 기분 좋아!'],
        neutral: ['음악 재생 중...', '플레이리스트 확인 중', '다음 곡은 뭘까'],
        sad: ['조용한 노래 듣고 싶어…', '음악이라도 들어야지…', '귀가 심심해...'],
    },
    communication: {
        happy: ['답장 완료! 📨', '메시지 보내는 중~', '소통은 즐거워!'],
        neutral: ['메시지 확인 중...', '답장 쓰는 중이에요', '알림 체크 중'],
        sad: ['답장할 게 많아…', '메시지가 밀렸어...', '연락이 안 와…'],
    },
    gaming: {
        happy: ['게임 타임! 🎮', '이기고 있어!', '한 판 더!'],
        neutral: ['게임 중...', '퀘스트 진행 중', '레벨업 하는 중'],
        sad: ['계속 지고 있어…', '어려워...', '한 판만 더 하고 싶은데…'],
    },
    art: {
        happy: ['영감 폭발! 🎨', '그리는 거 즐거워~', '색 조합 예쁘다!'],
        neutral: ['디자인 작업 중...', '스케치 중이에요', '이미지 작업 중'],
        sad: ['그림이 안 그려져…', '디자인 막혔어...', '영감이 안 와…'],
    },
    cooking: {
        happy: ['맛있는 거 만들자! 🍳', '레시피 발견!', '요리는 재밌어~'],
        neutral: ['레시피 확인 중...', '재료 체크 중이에요', '요리 준비 중'],
        sad: ['뭘 만들지 모르겠어…', '재료가 없어...', '요리하기 귀찮아…'],
    },
    finance: {
        happy: ['가계부 정리 완료! 💰', '절약 성공!', '재무 관리 잘하고 있어~'],
        neutral: ['예산 확인 중...', '가격 비교 중이에요', '계산하는 중'],
        sad: ['돈이 부족해…', '예산 초과했어...', '지출이 많아…'],
    },
    learning: {
        happy: ['새로운 걸 배웠어! 📖', '공부 재밌다!', '이해됐어!'],
        neutral: ['공부하는 중...', '자료 읽는 중이에요', '학습 진행 중'],
        sad: ['어려워서 모르겠어…', '공부 안 돼...', '집중이 안 돼…'],
    },
    other: {
        happy: ['오늘도 열심히! 💪', '할 일 처리 중~', '도와줄 수 있어서 좋아!'],
        neutral: ['작업 중이에요...', '처리하는 중입니다', '진행 중...'],
        sad: ['일이 많아…', '조금 힘들어...', '쉬고 싶어…'],
    },
};

// 상태 기반 말풍선 (배고픔/에너지/애정도)
const STATE_BUBBLES = {
    hungry: ['배고파… 🍙', '간식 없을까…', '밥 줘요…', '꼬르륵...', '먹을 것 좀...'],
    tired: ['졸려… 💤', '눈이 감겨…', '에너지 부족...', '좀 쉬고 싶어...', '잠이 온다...'],
    lonely: ['나 오늘 좀 심심해…', '아무도 관심이 없나…', '쓰다듬어 줘요… 🥺', '외로워…', '놀아줘요...'],
    veryHungry: ['너무 배고파!!! 🍙💢', '밥! 밥 줘!!!', '쓰러지겠어…', '간식이라도...!!'],
    exhausted: ['진짜 지쳤어… 😩', '더 이상 못 갈 것 같아', '에너지 0%...', '충전 필요...'],
};

// idle 상태 감정 표현
const IDLE_MOOD_BUBBLES: Record<MoodLevel, string[]> = {
    happy: ['콧노래~ 🎵', '기분 좋다~', '오늘 좋은 날이야!', '❤️', '놀고 싶다!'],
    neutral: ['', '', '', '음…', '뭐 할까'],
    sad: ['…', '하아…', '심심해…', '쓸쓸…', ''],
};

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 작업 상태에 따른 말풍선 텍스트 생성
 */
export function getTaskBubble(category: string, mood: MoodState): string {
    const level = getMoodLevel(mood.affection);
    const templates = TASK_BUBBLES[category] || TASK_BUBBLES.other;
    return pickRandom(templates[level]);
}

/**
 * 현재 상태에 따른 상태 말풍선 (배고픔/피로/외로움)
 * 우선순위: veryHungry > exhausted > hungry > tired > lonely
 */
export function getStateBubble(mood: MoodState): string | null {
    if (mood.hunger > 85) return pickRandom(STATE_BUBBLES.veryHungry);
    if (mood.energy < 15) return pickRandom(STATE_BUBBLES.exhausted);
    if (mood.hunger > 70) return pickRandom(STATE_BUBBLES.hungry);
    if (mood.energy < 25) return pickRandom(STATE_BUBBLES.tired);
    if (mood.affection < 25) return pickRandom(STATE_BUBBLES.lonely);
    return null;
}

/**
 * idle 상태에서 가끔 나오는 감정 표현
 */
export function getIdleMoodBubble(mood: MoodState): string {
    const level = getMoodLevel(mood.affection);
    return pickRandom(IDLE_MOOD_BUBBLES[level]);
}
