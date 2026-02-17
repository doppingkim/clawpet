/**
 * 동적 카테고리 레지스트리 — 자주 요청되는 업무 유형을 자동으로 추출/관리
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CategoryDef {
    id: string;       // 고유 ID (영문)
    label: string;    // 한국어 라벨
    keywords: string[];  // 매칭 키워드
    target: { x: number; y: number }; // 방 안 위치
    icon: string;     // 아이콘 파일명 (public/assets/ 하위)
    count: number;    // 누적 횟수
    builtIn: boolean; // 기본 내장인지 여부
}

// 기본 내장 카테고리
// builtIn: true → 방 배경 이미지에 이미 그려져 있음 (아이콘 렌더링 안 함)
// builtIn: false → 캔버스에 아이콘을 동적으로 렌더링
const BUILT_IN: CategoryDef[] = [
    { id: 'coding', label: '코딩 작업', keywords: [
        '코드', '코딩', '개발', '버그', '파일', '함수', '변수', '클래스', '모듈', '라이브러리', '프레임워크', '컴파일', '빌드', '배포', '테스트', '깃', '커밋', '브랜치', '풀리퀘', 'api', 'sdk', '서버', '프론트', '백엔드', '데이터베이스', 'db',
        'code', 'coding', 'dev', 'debug', 'fix', 'implement', 'refactor', 'function', 'class', 'module', 'compile', 'build', 'deploy', 'test', 'git', 'commit', 'branch', 'merge', 'pull request', 'npm', 'typescript', 'javascript', 'python', 'react', 'node',
    ], target: { x: 190, y: 344 }, icon: 'obj-laptop.png', count: 0, builtIn: true },
    { id: 'shopping', label: '장바구니 정리', keywords: [
        '쇼핑', '주문', '구매', '배송', '장바구니', '택배', '할인', '쿠폰', '상품', '결제', '환불', '교환', '가격비교',
        'shop', 'order', 'buy', 'cart', 'delivery', 'discount', 'coupon', 'product', 'purchase', 'amazon', 'coupang',
    ], target: { x: 368, y: 420 }, icon: 'obj-basket.png', count: 0, builtIn: true },
    { id: 'calendar', label: '일정 확인', keywords: [
        '일정', '달력', '스케줄', '날짜', '예약', '약속', '미팅', '회의', '마감', '기한', '기념일', '생일',
        'calendar', 'schedule', 'date', 'event', 'meeting', 'appointment', 'deadline', 'reminder',
    ], target: { x: 412, y: 268 }, icon: 'obj-calendar.png', count: 0, builtIn: true },
    { id: 'writing', label: '글쓰기 작업', keywords: [
        '글', '작성', '문서', '블로그', '편집', '원고', '에세이', '리포트', '보고서', '초안', '요약', '정리', '메모', '노트',
        'write', 'document', 'blog', 'edit', 'readme', 'essay', 'report', 'draft', 'summary', 'article', 'post', 'memo', 'note',
    ], target: { x: 400, y: 142 }, icon: 'obj-bookshelf.png', count: 0, builtIn: true },
    { id: 'research', label: '자료 조사', keywords: [
        '조사', '검색', '리서치', '찾아', '분석', '비교', '통계', '데이터', '자료', '논문', '참고', '출처', '팩트체크',
        'research', 'search', 'analyze', 'investigate', 'compare', 'statistics', 'data', 'reference', 'source', 'survey',
    ], target: { x: 162, y: 342 }, icon: 'obj-vanity.png', count: 0, builtIn: true },
    // 확장 카테고리
    { id: 'music', label: '음악', keywords: [
        '음악', '노래', '재생', '플레이리스트', '멜로디', '악기', '기타', '피아노', '드럼', '작곡', '가사',
        'bgm', 'music', 'song', 'playlist', 'melody', 'guitar', 'piano', 'spotify', 'youtube music',
    ], target: { x: 320, y: 200 }, icon: '', count: 0, builtIn: true },
    { id: 'communication', label: '소통', keywords: [
        '메시지', '이메일', '전송', '답장', '연락', '알림', '편지', '공지', '안내', '문의', '응답',
        'dm', 'message', 'email', 'send', 'reply', 'slack', 'telegram', 'chat', 'discord', 'notification',
    ], target: { x: 190, y: 344 }, icon: '', count: 0, builtIn: true },
    { id: 'gaming', label: '게임', keywords: [
        '게임', '플레이', '스코어', '퀘스트', '레벨', '캐릭터', '아이템', '던전', '보스', '랭킹',
        'game', 'play', 'score', 'quest', 'level', 'steam', 'nintendo', 'playstation', 'xbox',
    ], target: { x: 235, y: 290 }, icon: '', count: 0, builtIn: true },
    { id: 'art', label: '미술/디자인', keywords: [
        '그림', '디자인', '이미지', '로고', '일러스트', '스케치', '색상', '폰트', '레이아웃', '와이어프레임', '목업', '픽셀',
        'draw', 'design', 'image', 'logo', 'illustration', 'sketch', 'figma', 'ui', 'ux', 'color', 'font', 'layout', 'mockup',
    ], target: { x: 440, y: 210 }, icon: '', count: 0, builtIn: true },
    { id: 'cooking', label: '요리', keywords: [
        '요리', '레시피', '음식', '식단', '재료', '맛', '식사', '간식', '반찬', '국', '찌개', '볶음', '구이',
        'cook', 'recipe', 'food', 'meal', 'ingredient', 'dish', 'kitchen', 'restaurant', 'cafe',
    ], target: { x: 380, y: 290 }, icon: '', count: 0, builtIn: true },
    { id: 'finance', label: '재무', keywords: [
        '돈', '결제', '예산', '가격', '환율', '계좌', '투자', '주식', '경제', '금융', '세금', '연금', '보험', '대출', '이자', '수익', '손실', '펀드', '채권', '부동산', '거시경제', '미시경제', '인플레이션', 'gdp',
        'money', 'pay', 'budget', 'price', 'finance', 'invest', 'stock', 'crypto', 'economy', 'tax', 'interest', 'profit', 'bitcoin', 'ethereum',
    ], target: { x: 190, y: 344 }, icon: '', count: 0, builtIn: true },
    { id: 'learning', label: '학습', keywords: [
        '공부', '학습', '강의', '시험', '번역', '언어', '수학', '과학', '설명', '알려', '가르쳐', '이해', '개념', '원리', '이론', '역사', '지리', '물리', '화학', '생물', '영어', '한국어', '일본어', '중국어', '교과서', '문제', '풀이', '정의', '뜻',
        'study', 'learn', 'lecture', 'exam', 'translate', 'language', 'math', 'science', 'explain', 'teach', 'understand', 'concept', 'theory', 'history', 'physics', 'chemistry', 'biology', 'english', 'tutorial', 'course', 'lesson',
    ], target: { x: 145, y: 420 }, icon: '', count: 0, builtIn: true },
];

// 동적 카테고리 배치 후보 위치 (방 안 빈 공간)
const DYNAMIC_SLOTS = [
    { x: 310, y: 310 },
    { x: 450, y: 350 },
    { x: 260, y: 440 },
    { x: 150, y: 430 },
    { x: 340, y: 240 },
    { x: 280, y: 200 },
];

const REGISTRY_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'clawgotchi', 'data', 'categories.json');

let categories: CategoryDef[] = [];

export function loadCategories(): CategoryDef[] {
    try {
        if (fs.existsSync(REGISTRY_PATH)) {
            const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
            if (Array.isArray(data)) {
                categories = data;
                // 내장 카테고리: 빠져있으면 추가, 있으면 키워드를 최신으로 갱신
                for (const b of BUILT_IN) {
                    const existing = categories.find(c => c.id === b.id);
                    if (!existing) {
                        categories.push({ ...b });
                    } else {
                        existing.keywords = b.keywords;
                        existing.label = b.label;
                    }
                }
                return categories;
            }
        }
    } catch { /* noop */ }
    categories = BUILT_IN.map(c => ({ ...c }));
    saveCategories();
    return categories;
}

function saveCategories() {
    try {
        const dir = path.dirname(REGISTRY_PATH);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(REGISTRY_PATH, JSON.stringify(categories, null, 2), 'utf8');
    } catch (err) {
        console.error('[categories] save error:', err);
    }
}

export function getCategories(): CategoryDef[] {
    return categories;
}

/**
 * 작업 텍스트로부터 카테고리를 분석하여 반환
 * 매칭되는 카테고리가 없으면 'other'를 반환
 */
export function analyzeCategory(text: string): CategoryDef | null {
    const lower = text.toLowerCase();
    let bestMatch: CategoryDef | null = null;
    let bestScore = 0;

    for (const cat of categories) {
        let score = 0;
        for (const kw of cat.keywords) {
            if (lower.includes(kw.toLowerCase())) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = cat;
        }
    }

    if (bestMatch && bestScore > 0) {
        bestMatch.count++;
        saveCategories();
        return bestMatch;
    }

    return null; // 매칭 없음 → 호출자가 'other' 처리 또는 새 카테고리 생성
}

/**
 * 새로운 카테고리를 등록 (동적 생성)
 */
export function registerCategory(id: string, label: string, keywords: string[]): CategoryDef {
    const existing = categories.find(c => c.id === id);
    if (existing) return existing;

    // 다음 빈 슬롯 할당
    const usedSlots = categories.filter(c => !c.builtIn).length;
    const slot = DYNAMIC_SLOTS[usedSlots % DYNAMIC_SLOTS.length];

    const cat: CategoryDef = {
        id,
        label,
        keywords,
        target: slot,
        icon: `obj-${id}.png`,
        count: 1,
        builtIn: false,
    };

    categories.push(cat);
    saveCategories();
    console.log(`[categories] registered new: ${id} (${label}) at (${slot.x}, ${slot.y})`);
    return cat;
}
