# ClawPet

[English](README.md) | [한국어](README.ko.md)

OpenClaw용 데스크톱 펫 UI 프로젝트입니다. (Tauri + React)

ClawPet은 데스크톱 위에 항상 떠 있으면서 OpenClaw Gateway(WebSocket)에 연결되고, 이미지 첨부/화면 캡처를 포함한 채팅을 제공합니다.

## 프로젝트 상태

- 사용 가능한 베타
- 크로스플랫폼 설정 탐색 지원 (Windows, macOS, Linux)
- 현재 가장 많이 검증된 조합: Windows + OpenClaw 로컬/WSL2

## 주요 기능

- 투명한 always-on-top 캐릭터 창 + 트레이 제어
- OpenClaw Gateway 핸드셰이크(`protocol v3`) 및 스트리밍 채팅
- 이미지 첨부 지원:
  - 이미지 파일 드래그 앤 드롭
  - 브라우저 이미지/URL 드래그 앤 드롭
  - 클립보드 이미지 붙여넣기
- 영역 캡처(드래그 선택) 후 즉시 첨부
- 전체화면 캡처(현재 캐릭터가 있는 모니터 기준) 후 즉시 첨부
- **브라우저 읽기**: Chrome DevTools Protocol(CDP)으로 현재 Chrome 탭의 DOM + 스크린샷을 읽어서 AI에게 질문
- ClawPet 전용 로컬 대화 기록 저장/조회
- 외부 채널 메시지 큐 UX(편지 도착 알림)
- OpenClaw `identity.md` 기반 이름표

## 호환 시나리오

1. 같은 PC에 OpenClaw 로컬 설치: 지원
2. Windows에서 ClawPet 실행 + OpenClaw는 WSL2: 지원
3. OpenClaw를 VPS/LAN에 설치: 지원 (`OPENCLAW_GATEWAY_URL` 권장)

## 실행/개발 요구사항

### 사용자(빌드된 앱 실행)

- 실행 중인 OpenClaw Gateway
- 유효한 Gateway 토큰

### 개발자(소스 빌드)

- Node.js 20+
- pnpm 9+
- Rust stable + Cargo
- OS별 Tauri v2 사전 요구사항

## 설치 및 실행

### A. 릴리즈 바이너리 사용 (일반 사용자 권장)

- GitHub Releases에서 다운로드
- Windows: `.msi` 설치 후 `ClawPet` 실행
- macOS: `.dmg` 설치 (Apple Silicon, Intel 모두 지원)
- Linux: 해당 플랫폼 바이너리가 없으면 아래 B 방식으로 소스 빌드

### B. 소스에서 빌드

```bash
pnpm install
pnpm tauri dev
```

프로덕션 빌드:

```bash
pnpm build
pnpm tauri build
```

Windows 스크립트:

- `build.bat`
- `build-debug.bat`
- `build.ps1`

## 설정

ClawPet 설정 로드 우선순위:

1. 환경변수
2. 명시적 경로 환경변수
3. 사용자 경로 자동 탐색

### 환경변수 목록

- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_GATEWAY_PORT`
- `OPENCLAW_GATEWAY_HOST`
- `OPENCLAW_GATEWAY_URL` (원격/VPS는 이 방식 권장)
- `OPENCLAW_CONFIG_PATH` (복수 경로 가능)
- `OPENCLAW_WSL_CONFIG_PATH` (복수 경로 가능)
- `OPENCLAW_WORKSPACE_PATH` (복수 경로 가능)
- `OPENCLAW_IDENTITY_PATH` (복수 경로 가능)
- `OPENCLAW_IDENTITY_NAME` (표시 이름 강제 지정)

경로 구분자:

- Windows: `;`
- macOS/Linux: `:`

### 자동 탐색 경로

설정 파일(`openclaw.json`) 후보:

- `~/.openclaw/openclaw.json`
- `~/.config/openclaw/openclaw.json`
- OS config 디렉터리 내 `openclaw`/`OpenClaw` 변형
- Windows에서는 `\\wsl$\<distro>\home\<user>\.openclaw\openclaw.json` 자동 스캔

아이덴티티 파일(`identity.md`/`IDENTITY.md`) 후보:

- config 내부 workspace(`agents.defaults.workspace` 등) 기준
- `~/.openclaw/workspace`
- `~/.openclaw`
- OS config 디렉터리 변형 경로

## 설정 예시

### 1) Windows + OpenClaw 로컬

일반적으로 `%USERPROFILE%\.openclaw\openclaw.json` 사용 시 추가 설정 없이 동작합니다.

### 2) Windows + OpenClaw in WSL2

```powershell
$env:OPENCLAW_WSL_CONFIG_PATH="\\wsl$\Ubuntu\home\<you>\.openclaw\openclaw.json"
```

### 3) VPS 원격 Gateway

```bash
OPENCLAW_GATEWAY_URL=wss://your-domain-or-ip:18789
OPENCLAW_GATEWAY_TOKEN=...
```

## 기능 토글

`.env`에서 모듈 on/off:

- `VITE_ENABLE_IMAGE_DROP=true|false`
- `VITE_ENABLE_CLIPBOARD_IMAGE=true|false`
- `VITE_ENABLE_PARCHMENT=true|false`
- `VITE_ENABLE_AREA_CAPTURE=true|false`

## 제한사항

- 이미지 입력 최대 10MB
- 화면 캡처 이미지는 채팅 첨부 제한에 맞춰 자동 압축
- 비이미지 파일 첨부(`csv`, `xlsx`, `doc`, `pdf`, `txt`)는 아직 미지원

## 브라우저 읽기 설정

ClawPet이 현재 열려있는 Chrome 탭(HTML + 스크린샷)을 읽어서, 해당 페이지에 대해 AI에게 질문할 수 있습니다.

### 사전 준비

Chrome을 원격 디버깅 포트가 활성화된 상태로 실행해야 합니다. 기존 Chrome과 충돌을 피하기 위해 별도 프로필 사용을 권장합니다.

### Windows

아래 플래그로 바로가기를 만드세요:

```
chrome.exe --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%LOCALAPPDATA%\ClawGotchi\chrome-debug-profile"
```

### macOS

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="$HOME/Library/Application Support/ClawGotchi/chrome-debug-profile"
```

### 사용법

1. 위 바로가기/명령어로 Chrome 실행 (구글 계정 로그인하면 즐겨찾기 등 동기화 가능)
2. 원하는 웹페이지로 이동
3. ClawPet 우클릭 → **Read browser page**
4. 채팅 입력창에 브라우저 컨텍스트 표시가 나타남
5. 페이지에 대해 질문 입력 (빈 채로 Enter 시 기본 요약 생성)

### 참고사항

- 디버깅 플래그로 실행하기 전에 기존 Chrome 창을 모두 닫아야 합니다
- 디버그 포트는 `CLAWGOTCHI_CDP_PORT` 환경변수로 변경 가능 (기본값: 9222)
- 스크린샷은 현재 보이는 화면만 캡처됩니다. HTML/DOM은 전체 페이지를 가져옵니다

## 트러블슈팅

### 연결이 안 될 때

1. OpenClaw Gateway 실행 여부 확인
2. 토큰 유효성 확인
3. URL/host/port 확인
4. 원격 환경이면 `OPENCLAW_GATEWAY_URL` 명시 권장

### 영역 캡처가 멈춘 것처럼 보일 때

1. 최신 릴리즈 실행 파일 사용
2. 기존 캡처 창이 남아있지 않은지 확인
3. 좌클릭 드래그-해제로 다시 시도
4. 계속 재현되면 OS/멀티모니터/배율 정보와 함께 이슈 등록

### 이름표가 잘못 나올 때

아래 중 하나를 명시:

- `OPENCLAW_IDENTITY_NAME`
- `OPENCLAW_IDENTITY_PATH`
- `OPENCLAW_WORKSPACE_PATH`

## 보안 주의사항

- 실제 Gateway 토큰은 절대 저장소에 커밋하지 마세요
- 원격/공용망에서는 `wss://` 권장
- 민감정보는 환경변수/사용자 로컬 설정으로만 관리

## 기여 가이드

우선순위:

1. 안정성(캡처, 재연결, 멀티모니터)
2. 크로스플랫폼 온보딩 개선
3. 기능 모듈화 및 안전한 기본값
4. 릴리즈 자동화 및 서명 배포

## 라이선스

MIT. `LICENSE` 파일을 참고하세요.
