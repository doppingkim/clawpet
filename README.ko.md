<p align="right">
  <a href="./README.md">English</a> | <a href="./README.ko.md">한국어</a>
</p>

# ClawGotchi

아늑한 픽셀아트 방 안에서 살아가는 다마고치 스타일의 가상 펫입니다. [OpenClaw](https://github.com/anthropics/openclaw) 에이전트의 작업 상태를 실시간으로 반영합니다.

밥을 주고, 쓰다듬고, 대화하거나 — AI 에이전트가 백그라운드에서 일하는 동안 펫이 자기만의 일상을 보내는 모습을 지켜보세요.

## 주요 기능

**펫 상호작용**
- 밥주기(`🍙`), 쓰다듬기(`🤲`), 대화(`/`)
- 배고픔/애정도/에너지에 따라 달라지는 감정 기반 말풍선
- 펫 클릭 시 깜짝 반응, 창문 클릭으로 방 조명 토글

**실시간 에이전트 연동**
- OpenClaw Gateway에 WebSocket으로 연결해 에이전트 이벤트를 실시간 수신
- 작업을 자동 분류 (코딩, 쇼핑, 글쓰기, 조사 등 12개 내장 카테고리)
- 펫이 해당 가구로 이동하며 맥락에 맞는 상태 메시지 표시

**대기 루틴**
- 대기 상태에서 펫이 책 읽기, 식물 물주기, 책장 먼지 털기, 이불 돌돌이, 달력 확인, 낮잠 등을 수행
- 이불 덮고 자는 애니메이션 + 떠다니는 Zzz

**사운드**
- 액션별 절차적 SFX (타이핑, 물주기, 페이지 넘기기, 걷기, 먹기, 쓰다듬기, 잠자기, 팝)
- 칩튠 BGM 루프
- 우측 상단 음소거 토글

## 프로젝트 구조

```
clawgotchi/
├── apps/
│   ├── server/          # Express + WebSocket 서버 (포트 8787)
│   │   ├── index.ts           # REST API + WS 브로드캐스트
│   │   ├── categories.ts      # 동적 카테고리 레지스트리 (12개 내장 + 커스텀)
│   │   └── gateway-listener.ts # OpenClaw Gateway WS 클라이언트
│   └── web/             # React + Canvas 프론트엔드 (포트 5173)
│       ├── components/PetRoom.tsx    # 캔버스 렌더러 (방, 캐릭터, 아이템, 이펙트)
│       ├── hooks/useTaskEvents.ts    # WS 이벤트 리스너
│       ├── store/usePetStore.ts      # Zustand 상태 (이동, 대기 FSM, 게이지)
│       └── store/bubbleTemplates.ts  # 감정 × 카테고리 말풍선 시스템
├── packages/shared/     # 공유 TypeScript 타입
├── bin/clawgotchi.mjs   # CLI 런처 (브라우저 창 열기)
├── scripts/             # 에셋 생성 스크립트 (pngjs 기반 픽셀아트)
└── data/                # 런타임 데이터 (카테고리)
```

## 요구사항

- Node.js 20+
- npm
- OpenClaw Gateway 실행 중 (선택사항 — 실시간 에이전트 이벤트 수신용)

## 시작하기

```bash
git clone https://github.com/doppingkim/ClawGotchi.git
cd ClawGotchi
npm install
npm run dev
```

실행 후 접속:
- **웹 UI**: http://localhost:5173
- **API 서버**: http://localhost:8787

서버 상태 확인:
```bash
curl http://localhost:8787/health
```

## OpenClaw Gateway 연동

ClawGotchi는 로컬 OpenClaw Gateway에 연결해 에이전트 이벤트를 실시간으로 수신합니다.

설정은 `~/.openclaw/openclaw.json`에서 읽어옵니다:
```json
{
  "gateway": {
    "port": 18789,
    "auth": { "token": "your-token" }
  }
}
```

연결되면 펫이 에이전트의 작업에 자동으로 반응합니다 — 코딩할 때 노트북으로 이동, 일정 작업 시 달력 확인 등.

Gateway가 없어도 `/emit` API로 이벤트를 수동 전송할 수 있습니다.

## API

### `GET /health`
서버 상태 확인.

### `GET /profile`
어시스턴트 이름 반환 (`openclaw.json` 또는 `IDENTITY.md`에서 읽음).

### `GET /categories`
등록된 작업 카테고리 전체 반환 (내장 + 동적).

### `POST /emit`
작업 이벤트 주입. 카테고리 미지정 시 서버가 summary에서 자동 분류.
```bash
curl -X POST http://localhost:8787/emit \
  -H 'content-type: application/json' \
  -d '{"category":"coding","status":"working","summary":"인증 모듈 리팩토링 중"}'
```

### `POST /chat`
펫과 대화 (최대 100자). Gateway 연결 시 메인 에이전트 세션으로 메시지 릴레이.
```bash
curl -X POST http://localhost:8787/chat \
  -H 'content-type: application/json' \
  -d '{"message":"안녕!"}'
```

### `WS /events`
프론트엔드로 실시간 작업 이벤트를 스트리밍하는 WebSocket 엔드포인트.

## 내장 카테고리

| 카테고리 | 라벨 | 이동 대상 가구 |
|----------|------|---------------|
| coding | 코딩 작업 | 노트북 |
| shopping | 장바구니 정리 | 바구니 |
| calendar | 일정/소통 | 달력 |
| writing | 글쓰기 작업 | 노트와 연필 (방석 근처) |
| research | 자료 조사 | 책장 |
| music | 음악 | 기타 |
| communication | 소통 | 달력 |
| gaming | 게임 | 게임패드 |
| art | 미술/디자인 | 캔버스 |
| cooking | 요리 | 가스레인지 |
| finance | 재무/경제 | 노트북 |
| learning | 학습 | 책장 |

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MOCK_EVENTS` | `0` | `1`로 설정 시 테스트용 목 이벤트 브로드캐스트 활성화 |
| `GEMINI_API_KEY` | — | Gemini API 키 (에셋 생성 스크립트용) |
| `CLAWGOTCHI_URL` | `http://localhost:5173` | CLI 런처 URL |

## 스크립트

```bash
npm run dev          # 웹 + 서버 동시 실행
npm run open         # 브라우저에서 ClawGotchi 열기
node scripts/qa_20.mjs           # QA 체크리스트 실행
node scripts/generate_assets.mjs # 기본 픽셀아트 에셋 생성
node scripts/generate_cozy_pack.mjs # 아늑한 스타일 에셋 팩 생성
```

## 문제 해결

### "사이트에 연결할 수 없음"
개발 서버 미실행 또는 포트 충돌:
```bash
lsof -ti tcp:5173 | xargs -r kill
lsof -ti tcp:8787 | xargs -r kill
npm run dev
```

### 이벤트/채팅이 안 됨
`http://localhost:8787/health`에서 서버 상태를 확인하고 개발 콘솔 출력을 검토하세요.

### Gateway 릴레이 연결 안 됨
- `~/.openclaw/openclaw.json`에 유효한 `gateway.auth.token`이 있는지 확인
- Gateway에서 HTTP tools/invoke를 통한 `sessions_send` 허용 확인
- 서버 로그에서 `[gateway-ws]` 메시지 확인

## 라이선스

MIT
