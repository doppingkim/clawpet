# ClawGotchi 🦞

OpenClaw 상태를 512x512 픽셀 룸 안에서 보여주는 다마고치형 웹 앱입니다.

## 핵심 기능
- 512x512 단일 룸 UI (외부 패널 없음)
- 픽셀 렌더링 + 커스텀 캐릭터 스프라이트
- 말풍선 상태 표시(단문)
- 게이지 툴팁(라벨 + %)
- 액션 버튼: `🍙`(밥), `🤲`(쓰다듬기), `/`(짧은 채팅)
- 룸 라이트 토글(창문 클릭)
- 상태 기반 SFX + 간단 BGM + 음소거 토글
- 서버 이벤트 브리지 (`/emit`, WS `/events`)
- 프로필 이름 표시 (`/profile`)
- 채팅 엔드포인트 (`/chat`, 입력/응답 20자 제한)
- OpenClaw 릴레이 연동 (`sessions_send` via Gateway `/tools/invoke`)

---

## 요구사항
- Node.js 20+
- npm
- OpenClaw Gateway 실행 중 (릴레이 기능 사용할 때)

---

## 설치
```bash
cd clawgotchi
npm install
```

## 개발 실행
```bash
npm run dev
```

정상 실행 시:
- Web: http://localhost:5173
- Server: http://localhost:8787

---

## 빠른 헬스체크
```bash
curl -I http://localhost:5173
curl http://localhost:8787/health
```

둘 다 정상이어야 브라우저 접속이 됩니다.

---

## OpenClaw 릴레이(실제 전달) 설정
`/chat`에서 입력한 메시지를 OpenClaw 메인 세션으로 전달합니다.

우선순위:
1. `OPENCLAW_GATEWAY_TOKEN` 환경변수
2. `~/.openclaw/openclaw.json`의 `gateway.auth.token`

선택 환경변수:
- `OPENCLAW_GATEWAY_URL` (기본: `http://127.0.0.1:18789`)
- `OPENCLAW_SESSION_KEY` (기본: `agent:main:main`)

예시:
```bash
export OPENCLAW_GATEWAY_TOKEN="..."
export OPENCLAW_SESSION_KEY="agent:main:main"
```

> 참고: Gateway에서 HTTP `sessions_send` 허용이 필요합니다.

---

## API 요약
### `GET /health`
서버 상태 확인

### `GET /profile`
어시스턴트 이름 반환

### `POST /emit`
작업 이벤트 주입
```bash
curl -X POST http://localhost:8787/emit \
  -H 'content-type: application/json' \
  -d '{"category":"coding","status":"working","summary":"파일 구조 확인 중"}'
```

### `POST /chat`
짧은 채팅 (입력/응답 최대 20자)
```bash
curl -X POST http://localhost:8787/chat \
  -H 'content-type: application/json' \
  -d '{"message":"20자 이내 인사"}'
```

---

## QA
```bash
node scripts/qa_20.mjs
```

결과 파일:
- `QA_CHECKLIST_20.md`

---

## 자주 발생하는 문제
### 1) "사이트에 연결할 수 없음"
- dev 서버 미실행 가능성
- 포트 충돌 가능성

해결:
```bash
# 포트 점유 프로세스 종료
lsof -ti tcp:5173 | xargs -r kill
lsof -ti tcp:5174 | xargs -r kill
lsof -ti tcp:8787 | xargs -r kill

# 다시 실행
npm run dev
```

### 2) Web는 뜨는데 이벤트/채팅이 안 됨
- `http://localhost:8787/health` 확인
- 서버 로그 확인 (`npm run dev` 콘솔)

### 3) 채팅 릴레이가 실제 OpenClaw에 안 감
- Gateway 토큰/세션키 확인
- Gateway `tools/invoke`에서 `sessions_send` 허용 확인

---

## 참고
- 오브젝트 생성 규칙: `scripts/OBJECT_GEN_RULE.md`
