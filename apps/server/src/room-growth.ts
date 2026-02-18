/**
 * 방 성장 시스템 — Task 히스토리 기반으로 방 아이템 업그레이드
 *
 * 최근 7일/30일 태스크 비중 계산 → 특정 카테고리 임계치 넘으면 아이템 업그레이드
 *
 * 예시:
 * - 코딩 비중 40%↑ → 듀얼모니터    → 80%↑ → 3개 모니터
 * - 쇼핑 비중 25%↑ → 장바구니      → 50%↑ → 배송박스 더미
 * - 글쓰기 비중 30%↑ → 타자기/노트  → 60%↑ → 책장 확장
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

interface TaskRecord {
    category: string;
    ts: number;
}

export interface RoomUpgrade {
    category: string;
    level: number;     // 0=기본, 1=업그레이드1, 2=업그레이드2
    label: string;
    icon: string;
}

const HISTORY_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'clawgotchi', 'data', 'task_history.json');
const UPGRADES_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'clawgotchi', 'data', 'room_upgrades.json');

// 업그레이드 정의
const UPGRADE_RULES: Record<string, { thresholds: number[]; labels: string[]; icons: string[] }> = {
    coding: {
        thresholds: [0.4, 0.8],
        labels: ['듀얼모니터', '3스크린 셋업'],
        icons: ['obj-dual-monitor.png', 'obj-triple-monitor.png']
    },
    shopping: {
        thresholds: [0.25, 0.5],
        labels: ['장바구니 확장', '배송박스 더미'],
        icons: ['obj-cart-large.png', 'obj-delivery-boxes.png']
    },
    writing: {
        thresholds: [0.3, 0.6],
        labels: ['타자기', '책장 확장'],
        icons: ['obj-typewriter.png', 'obj-large-bookshelf.png']
    },
    research: {
        thresholds: [0.3, 0.6],
        labels: ['돋보기', '연구 보드'],
        icons: ['obj-magnifier.png', 'obj-research-board.png']
    },
    calendar: {
        thresholds: [0.3, 0.6],
        labels: ['디지털 달력', '플래너 데스크'],
        icons: ['obj-digital-calendar.png', 'obj-planner-desk.png']
    }
};

let taskHistory: TaskRecord[] = [];
let roomUpgrades: RoomUpgrade[] = [];

export function loadTaskHistory() {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            taskHistory = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        }
    } catch { taskHistory = []; }
    try {
        if (fs.existsSync(UPGRADES_PATH)) {
            roomUpgrades = JSON.parse(fs.readFileSync(UPGRADES_PATH, 'utf8'));
        }
    } catch { roomUpgrades = []; }
}

function saveTaskHistory() {
    try {
        const dir = path.dirname(HISTORY_PATH);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(taskHistory, null, 2));
    } catch { /* noop */ }
}

function saveRoomUpgrades() {
    try {
        const dir = path.dirname(UPGRADES_PATH);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(UPGRADES_PATH, JSON.stringify(roomUpgrades, null, 2));
    } catch { /* noop */ }
}

/**
 * 새 태스크 기록 추가
 */
export function recordTask(category: string) {
    taskHistory.push({ category, ts: Date.now() });
    // 30일 이내 기록만 유지
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    taskHistory = taskHistory.filter(t => t.ts > cutoff);
    saveTaskHistory();
}

/**
 * 최근 N일 카테고리 비중 계산
 */
function getCategoryRatio(days: number): Record<string, number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = taskHistory.filter(t => t.ts > cutoff);
    if (recent.length === 0) return {};

    const counts: Record<string, number> = {};
    for (const t of recent) {
        counts[t.category] = (counts[t.category] || 0) + 1;
    }

    const total = recent.length;
    const ratios: Record<string, number> = {};
    for (const [cat, count] of Object.entries(counts)) {
        ratios[cat] = count / total;
    }
    return ratios;
}

/**
 * 업그레이드 체크 + 적용 — 매 태스크 기록 후 호출
 * Returns: 새로 적용된 업그레이드 목록 (빈 배열이면 변화 없음)
 */
export function checkUpgrades(): RoomUpgrade[] {
    const ratios = getCategoryRatio(7); // 최근 7일 기준
    const newUpgrades: RoomUpgrade[] = [];

    for (const [cat, rules] of Object.entries(UPGRADE_RULES)) {
        const ratio = ratios[cat] || 0;
        const existing = roomUpgrades.find(u => u.category === cat);
        const currentLevel = existing?.level || 0;

        let newLevel = 0;
        for (let i = rules.thresholds.length - 1; i >= 0; i--) {
            if (ratio >= rules.thresholds[i]) {
                newLevel = i + 1;
                break;
            }
        }

        if (newLevel > currentLevel) {
            const upgrade: RoomUpgrade = {
                category: cat,
                level: newLevel,
                label: rules.labels[newLevel - 1],
                icon: rules.icons[newLevel - 1]
            };

            if (existing) {
                existing.level = newLevel;
                existing.label = upgrade.label;
                existing.icon = upgrade.icon;
            } else {
                roomUpgrades.push(upgrade);
            }
            newUpgrades.push(upgrade);
            console.log(`[room-growth] ${cat} upgraded to level ${newLevel}: ${upgrade.label} (ratio: ${(ratio * 100).toFixed(1)}%)`);
        }
    }

    if (newUpgrades.length > 0) {
        saveRoomUpgrades();
    }

    return newUpgrades;
}

/**
 * 현재 방 업그레이드 목록 반환
 */
export function getRoomUpgrades(): RoomUpgrade[] {
    return roomUpgrades;
}
