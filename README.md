# Paper Reader

논문 읽기 보조 데스크톱 도구 (local-first). 좌측 PDF, 우측 탭(정보·챗·하이라이트), 텍스트 드래그 토글 메뉴.
LLM은 API가 아니라 **로컬에 설치된 Claude Code**(Claude Agent SDK)로 호출합니다. 구현 명세는 [`paper-reader-spec.md`](./paper-reader-spec.md).

## 사전 요구
- Node.js 18+ (개발은 24에서 확인)
- **Claude Code 설치 + 구독(Pro/Max) 인증.** 미설치 시 앱이 온보딩 화면으로 설치 명령을 안내합니다.
  - Windows: PowerShell에서 `irm https://claude.ai/install.ps1 | iex` (WSL 불필요, Git Bash 금지)
  - macOS: `curl -fsSL https://claude.ai/install.sh | bash`
- 분석 스킬 `biopaper-analyst` (플러그인/전역 스킬 어디든) — 없으면 STEP 1 어댑터 프롬프트만으로도 동작하지만 STEP 2/3/4 품질이 떨어집니다.

## 실행 (개발)
```bash
npm install
npm run dev          # server(5174) + client(5173) 동시 기동
```
브라우저에서 http://localhost:5173 접속. (client 는 /api·/ws 를 server 로 프록시)

## 빌드 / 실행 (프로덕션)
```bash
npm run build        # server(tsc) + client(vite)
npm start            # 빌드된 server 기동, client 는 client/dist 정적 호스팅
```

## 데이터 위치
라이브러리 DB와 PDF 사본은 레포가 아니라 OS 앱데이터 폴더에 저장됩니다(`env-paths`):
- Windows: `%APPDATA%\PaperReader\`  ·  macOS: `~/Library/Application Support/PaperReader/`
- `library.db`, `papers/<hash>.pdf`, `work/<paperId>/`(논문별 Claude 작업 디렉토리 + 패치된 스킬 사본)

## 구조
- `server/` — Fastify + WebSocket + better-sqlite3 + Claude Agent SDK
  - `claude/sessionManager.ts` — 논문별 세션. `query()` + `resume` 멀티턴, 퍼-페이퍼 뮤텍스 직렬화, `permissionMode:'dontAsk'` + `canUseTool` 경로 스코핑(fail-closed 읽기전용)
  - `claude/skill.ts` — `biopaper-analyst` 를 논문 cwd 에 복사 + 로컬 패치(샌드박스 경로 제거)
  - `claude/prompts.ts` — STEP 1 JSON 어댑터, STEP 2/3/4, 선택 액션
- `client/` — React + Vite + Tailwind + zustand + pdfjs-dist + TanStack Table
- `shared/types.ts` — client·server 공용 타입(데이터 모델 · WS 프로토콜)

## 설정(환경변수)
- `PORT`(기본 5174), `HOST`(127.0.0.1)
- `PAPER_READER_MODEL` — 모델 문자열(미지정 시 CLI 기본)
- `PAPER_READER_MAX_SESSIONS`, `PAPER_READER_SESSION_IDLE_MS`

## 알아둘 점 / 한계 (spec §9, §11)
- **사용량**: 헤드리스 Claude 사용은 Claude 구독 한도에서 차감됩니다(향후 별도 풀로 분리될 수 있음).
- **프롬프트 캐싱**: resume 멀티턴은 매 턴 PDF 포함 트랜스크립트를 재입력 → 캐싱이 켜져야 후속 턴이 실제로 저렴해짐(SDK 동작 확인 필요).
- **스캔 PDF**: 텍스트 레이어가 없으면 드래그 선택 불가(분석은 Claude의 이미지 읽기로 가능, OCR은 범위 외).
- **패키징**: 현재는 로컬 웹앱(브라우저 + localhost). 데스크톱 패키지(Tauri/Electron)로 전환 시 `better-sqlite3` ABI 재빌드가 필요합니다.
