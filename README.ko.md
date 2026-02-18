<p align="right">
  <a href="./README.md">English</a> | <a href="./README.ko.md">한국어</a>
</p>

# ClawGotchi

ClawGotchi는 **OpenClaw 실시간 활동**을 반영하는 가상 펫 UI입니다.

## 필수 전제

ClawGotchi는 **OpenClaw Gateway 연동이 필수**입니다.

- Gateway가 설정되지 않으면 오구성(misconfigured) 상태입니다.
- 이 저장소는 단독(standalone) 모드를 제공하지 않습니다.

## 준비물

- Node.js 20+
- npm
- Gateway가 활성화된 OpenClaw 실행 환경
- `~/.openclaw/openclaw.json` 접근 권한
- `.env` 파일 불필요

## 1) OpenClaw Gateway 설정 (필수)

`~/.openclaw/openclaw.json`에 Gateway 설정이 있어야 합니다.

```json
{
  "identity": {
    "name": "YourAssistantName"
  },
  "gateway": {
    "port": 18789,
    "auth": {
      "token": "your-token"
    }
  }
}
```

필수 키:

- `gateway.port`
- `gateway.auth.token`

주의:

- 실제 토큰은 외부에 노출하지 마세요.
- 개인 `openclaw.json`은 Git에 커밋하지 마세요.

## 2) 설치 및 실행

```bash
git clone https://github.com/doppingkim/ClawGotchi.git
cd ClawGotchi
npm install
npm run dev
```

기본 접속 주소:

- 웹 UI: `http://localhost:5173`
- API 서버: `http://localhost:8787`

## 3) Gateway 연결 확인

서버 상태 확인:

```bash
curl http://localhost:8787/health
```

Gateway 릴레이 상태 확인:

```bash
curl http://localhost:8787/debug/gateway
```

정상 기대값:

- `connected: true`
- `wsState: 1`

## 동작 방식

연동이 정상일 때 ClawGotchi는 다음을 수행합니다.

- Gateway WebSocket으로 OpenClaw 이벤트 구독
- 작업 맥락을 카테고리로 분류
- 상황에 맞는 오브젝트로 펫 이동 및 말풍선/상태 표시
- OpenClaw 세션(`agent:main:main`)으로 채팅 릴레이

## API

- `GET /health`: 서버 헬스 체크
- `GET /profile`: 어시스턴트 이름 반환
- `GET /categories`: 활성 카테고리 목록
- `GET /debug/gateway`: Gateway 연결 상태
- `POST /chat`: OpenClaw 세션으로 메시지 릴레이
- `WS /events`: 프론트엔드 실시간 이벤트 스트림

## 문제 해결

### `/debug/gateway`에서 `connected: false`

1. OpenClaw Gateway가 실행 중인지 확인
2. `~/.openclaw/openclaw.json` 값 확인
   - `gateway.port`가 실제 포트와 일치하는지
   - `gateway.auth.token`이 유효한지
3. Gateway에서 세션 릴레이 invoke 흐름이 허용되는지 확인
4. 서버 로그의 `[gateway-ws]` 메시지 확인

### 채팅 릴레이 실패

1. 토큰 유효성 확인
2. 설정된 포트의 Gateway invoke 엔드포인트 접근 가능 여부 확인
3. 대상 세션 키(`agent:main:main`) 사용 가능 여부 확인

### 포트 충돌

`8787` 또는 `5173`이 이미 사용 중이면 충돌 프로세스를 종료 후 재시작하세요.

## 보안

- `gateway.auth.token`은 비밀정보로 취급하세요.
- 로컬 자격증명, 비밀 포함 로그, 개인 OpenClaw 설정 파일은 커밋하지 마세요.

## 제거 (정리)

아래 명령으로 10분 혼잣말 cron 제거 + OpenClaw 설정 복원을 한 번에 수행할 수 있습니다.

```bash
npm run uninstall-clawgotchi
```

스크립트 복원 우선순위:

- `~/.openclaw/openclaw.json.clawgotchi.bak`
- `~/.openclaw/openclaw.json.bak`
- 최신 `~/.openclaw/openclaw.json.bak.*`

현재 설정은 `openclaw.json.before-clawgotchi-uninstall.TIMESTAMP.bak`로 추가 백업 후 복원합니다.

정리 후 프로젝트 폴더 삭제:

```bash
cd ..
rm -rf clawgotchi
```

## 라이선스

MIT