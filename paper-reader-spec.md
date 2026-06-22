# Paper Reader — 구현 스펙 (for Claude Code)

논문 읽기 보조 데스크톱 도구. 로컬 우선(local-first), 크로스플랫폼(Windows / macOS).
좌측에 PDF, 우측에 탭형 패널(정보 / 챗 / 하이라이트). 텍스트 드래그 시 토글 메뉴.
LLM은 **API가 아니라 로컬에 설치된 Claude Code**(Claude Agent SDK)를 통해 호출한다.

> 이 문서는 구현 명세다. 코드 전체를 받아쓰기보다, 아래 계약(데이터 모델·인터페이스·프롬프트·툴 제약)을 지키며 단계적으로 구현할 것.

---

## 0. 핵심 설계 원칙 (먼저 읽을 것)

1. **세션 = 논문 1편.** 논문을 열면 그 논문 전용 Claude Code 세션(`ClaudeSDKClient`)을 하나 띄운다. 정보 패널 · 챗 · 드래그 토글이 **모두 같은 세션**으로 들어간다. PDF는 세션에 한 번만 Read시키고, 이후 요약·질문·"이 부분 설명"은 같은 맥락 위의 싼 후속 턴이 된다.
2. **읽기 전용 툴 잠금.** 세션의 `allowedTools`는 `["Read", "WebSearch"]`만 허용한다. Write/Edit/Bash 불필요 + **Windows의 Bash 도구 이슈를 통째로 회피**. 권한 프롬프트로 멈추지 않도록 fail-closed 권한 모드를 쓴다. **단, 경로 차단은 `allowedTools`만으로 안 된다** — `Read`는 cwd 밖 절대경로도 읽으므로 "논문 폴더 밖 접근 차단"은 `canUseTool` 권한 콜백에서 경로를 검사해 강제한다(§11).
3. **분석 로직은 기존 `biopaper-analyst` 스킬을 재활용.** 정보 패널 = 스킬의 STEP 1. STEP 2/3/4는 온디맨드 버튼. 항목 정의는 스킬 구조에 맞추되, **STEP 1만은 스킬의 마크다운 출력이 아니라 §5 JSON으로 받는 어댑터 프롬프트**를 쓴다(§4.5). 스킬 원문은 `pdf-reading`·`/mnt/skills/...` 같은 샌드박스 전용 경로를 전제하므로, **로컬 패치된 사본**으로 노출한다(§4.2).
4. **세션 resume로 영속성.** 논문별 `session_id`를 저장해 앱 재시작 후에도 챗 맥락이 살아있게 한다. 읽다가 멈춘 위치(마지막 페이지)도 저장한다.
5. **자동 분석은 STEP 1만.** 열 때 STEP 1 자동 실행. STEP 2/3/4(웹검색 포함, 무거움)는 버튼.

---

## 1. 기술 스택

### Frontend (`/client`)
- React + Vite + TypeScript
- Tailwind CSS
- PDF 렌더링: `pdfjs-dist` (텍스트 레이어 직접 제어해 드래그 선택 좌표·페이지 확보) — 단순 표시는 `react-pdf`도 가능하나 토글 메뉴 좌표 제어 때문에 텍스트 레이어 접근이 필요
- 라이브러리 목록: TanStack Table
- 상태관리: Zustand (가벼움)
- 서버 통신: REST(CRUD) + WebSocket(스트리밍)

### Backend (`/server`)
- Node.js (18+) + TypeScript
- HTTP/WS 서버: Fastify + `ws` (또는 Fastify websocket 플러그인)
- **Claude Agent SDK (TypeScript)** — Claude Code를 프로그램에서 구동
  - ⚠️ **패키지명·API는 현재 공식 문서로 반드시 검증할 것.** "Claude Code SDK"가 "Claude Agent SDK"로 개명되었고 패키지/시그니처가 바뀌었다. 예상 패키지: `@anthropic-ai/claude-agent-sdk`. `ClaudeSDKClient`(양방향 멀티턴) / `query()`(단발) 사용. 참조: https://platform.claude.com/docs/en/agent-sdk/overview
- DB: `better-sqlite3` (서버 불필요, 크로스플랫폼 prebuild 존재)
- 앱 데이터 경로: `env-paths` (OS별 표준 경로 자동 해석)
- 파일 해시: Node `crypto` (sha256)

### 통신 규약
- **REST**: 라이브러리 CRUD, 논문 추가/조회, 하이라이트 CRUD
- **WebSocket**: 분석 스트리밍, 챗 토큰 스트리밍, 선택 액션 결과 스트리밍 (메시지 타입으로 멀티플렉싱)

---

## 2. 프로젝트 구조

```
paper-reader/
├── client/                 # Vite React 앱
│   ├── src/
│   │   ├── views/          # LibraryView, ReaderView
│   │   ├── components/      # PdfViewer, InfoPanel, ChatPanel,
│   │   │                    #   HighlightPanel, SelectionToggle, AddPaperDropzone
│   │   ├── store/           # zustand
│   │   ├── api/             # REST 클라이언트, WS 클라이언트
│   │   └── types/           # shared 타입 (server와 동기화)
│   └── ...
├── server/
│   ├── src/
│   │   ├── claude/          # 세션 매니저, 프롬프트, JSON 파서
│   │   ├── db/              # better-sqlite3 스키마·쿼리
│   │   ├── routes/          # REST 핸들러
│   │   ├── ws/              # WebSocket 허브
│   │   ├── library/         # PDF 복사·해시·앱데이터 경로
│   │   └── index.ts
│   └── ...
└── shared/                  # client·server 공용 타입(선택)
```

데이터 실체(라이브러리 DB + PDF 사본)는 레포가 아니라 **OS 앱데이터 폴더**에 저장:
- Windows: `%APPDATA%\PaperReader\`
- macOS: `~/Library/Application Support/PaperReader/`
- 내부: `library.db`, `papers/<hash>.pdf`

---

## 3. 데이터 모델 (SQLite)

```sql
CREATE TABLE papers (
  id              TEXT PRIMARY KEY,         -- uuid
  content_hash    TEXT UNIQUE NOT NULL,     -- sha256, 중복·캐시 판정 키
  title           TEXT,
  authors_json    TEXT,                     -- JSON 배열
  journal         TEXT,
  year            INTEGER,
  file_path       TEXT NOT NULL,            -- 관리 폴더 내 사본 경로
  original_name   TEXT,
  page_count      INTEGER,
  paper_type      TEXT,                     -- ml_method | experimental | review
  analysis_json   TEXT,                     -- STEP 1 구조화 결과(아래 스키마)
  analysis_status TEXT NOT NULL,            -- pending | running | done | error
  claude_session_id TEXT,                   -- resume용
  last_page       INTEGER DEFAULT 1,        -- 읽던 위치
  added_at        TEXT NOT NULL,
  last_opened_at  TEXT
);

CREATE TABLE analyses (                     -- STEP 2/3/4 결과 (마크다운)
  id         TEXT PRIMARY KEY,
  paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                 -- critique | trends | implications
  content_md TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE highlights (
  id            TEXT PRIMARY KEY,
  paper_id      TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page          INTEGER NOT NULL,
  rects_json    TEXT NOT NULL,              -- 하이라이트 박스 좌표(렌더 복원용)
  selected_text TEXT NOT NULL,
  color         TEXT DEFAULT 'yellow',
  note          TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE chat_messages (                -- UI 표시용 미러 (실제 맥락은 세션에 있음)
  id         TEXT PRIMARY KEY,
  paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,                 -- user | assistant
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

---

## 4. Claude Code 연동 (핵심)

### 4.1 사전 점검 (앱 첫 실행)
- `claude` 설치·인증 여부 확인 (SDK 프로브 또는 `claude --version` 시도).
- 없으면 OS별 설치 안내 온보딩 화면:
  - macOS: 네이티브 인스톨러(`curl -fsSL https://claude.ai/install.sh | bash`) 또는 Homebrew
  - Windows: PowerShell 네이티브 인스톨러(`irm https://claude.ai/install.ps1 | iex`). **WSL 불필요.** Git Bash에서 실행하지 말 것(raw mode 미지원).
- 인증은 Claude 구독(Pro/Max) OAuth로 처리됨 — 앱이 API 키를 받지 않는다.

### 4.2 세션 매니저 (`server/src/claude/sessionManager.ts`)
논문별로 `ClaudeSDKClient` 인스턴스를 관리한다.

세션 생성 옵션(개념):
```ts
{
  cwd: <논문 작업 디렉토리>,        // PDF + 스킬 discoverable
  allowedTools: ["Read", "WebSearch"],
  permissionMode: <fail-closed 모드>, // allowlist 밖은 거부, 프롬프트 없이
  settingSources: ["project"],       // 프로젝트 스킬 로드
  model: <설정값 또는 기본>,          // 모델 문자열은 변하므로 설정 가능하게
}
```

- **스킬 discoverability(결정: 작업 디렉토리 복사 방식)**: 현재 `biopaper-analyst`는 **플러그인**으로 설치돼 있어(`~/.claude/plugins/cache/local-skills/biopaper-analyst/<ver>/skills/biopaper-analyst/`) `settingSources:["project"]`의 자동 발견 메커니즘과 다르게 로드된다. 전역(`~/.claude/skills`) 유무에도 의존하지 않도록, **앱이 작업 디렉토리(`<cwd>/.claude/skills/biopaper-analyst/`)에 스킬 SKILL.md와 `references/*.md` 4개를 모두 복사**하고 `settingSources:["project"]`로 로드한다.
  - 복사 시 **로컬 패치 적용**(원문은 샌드박스 전제): ① `pdf-reading` 스킬·`/mnt/skills/public/...` 경로 지시 제거, "PDF는 `Read` 툴로 직접 읽으라"로 치환 ② STEP 1을 §5 JSON으로만 출력하라는 어댑터 지시(§4.5)와 일관되게.
  - 플러그인 원본 경로는 버전 폴더(`<ver>`)가 바뀌므로 하드코딩 금지 — 설치 위치 탐색 후 복사하거나, 앱 번들에 패치된 사본을 동봉하고 그걸 cwd로 복사.
- **세션 동시성(직렬화 필수)**: `ClaudeSDKClient` 1개는 단일 대화 스트림이라 같은 세션에 자동 STEP1·챗·선택액션이 동시에 들어가면 턴이 충돌한다. **세션별 요청 큐(뮤텍스)** 로 턴을 직렬화하고, 진행 중 요청은 취소 가능하게 한다(논문 닫기·페이지 이탈 시 abort). UI는 큐 대기/진행 상태를 표시.
- **세션 수명주기**: 논문을 여러 개 열면 `claude` 프로세스가 누적되므로 **유휴 세션 LRU 종료 + 동시 활성 세션 상한**을 둔다(상한은 설정값).
- **프롬프트 캐싱**: resume/멀티턴은 매 턴 전체 트랜스크립트(큰 PDF 텍스트 포함)를 재입력하므로 후속 턴이 자동으로 싸지 않는다. "한 번만 Read"가 실제로 싸지려면 **프롬프트 캐싱을 활성화**해야 한다(§11에서 SDK 지원 방식 확인).
- **resume**: 세션 결과에서 `session_id`를 캡처해 `papers.claude_session_id`에 저장. 재오픈 시 resume 시도, 실패(만료 등) 시 새 세션 생성 후 PDF 재-Read. 새 세션일 때 `chat_messages` 미러의 직전 대화는 모델에 없으므로, **직전 N개 챗을 요약 주입**해 UI 미러와 모델 맥락의 불일치를 줄인다.

### 4.3 세 가지 인터페이스 (모두 같은 세션)

**(A) 자동 분석 — STEP 1**
- 논문 열 때 `analysis_status=running`으로 두고 실행.
- 프롬프트는 §4.5 어댑터를 사용한다. **주의: 스킬 STEP 1의 기본 출력은 마크다운(이모지 불릿)이다.** "STEP 1을 수행"이라고만 하면 JSON이 아니라 마크다운이 나오므로, 어댑터에서 "항목 정의는 STEP 1을 따르되 **오직 §5 JSON만** 출력(코드펜스·서문 금지)"을 명시한다.
- 응답을 방어적으로 파싱(펜스 제거 후 `JSON.parse`, 실패 시 재시도 1회), `analysis_json`·`paper_type`·기본 메타(title/authors/journal/year) 저장 → 카드 렌더.
- **스트리밍 표시**: JSON은 완성 전까지 `JSON.parse` 불가하므로 부분 필드 점진 렌더는 하지 않는다. WS로는 **진행 상태 텍스트만** 스트리밍(스켈레톤 유지)하고, JSON 완성·파싱 성공 시점에 카드를 한 번에 렌더한다. (필드 단위 점진 표시가 꼭 필요하면 §4.5의 NDJSON 옵션 사용.)

**(B) 온디맨드 — STEP 2/3/4**
- 정보 패널의 버튼: `비판적 분석`(STEP 2) / `최신 동향 비교`(STEP 3, 웹검색) / `시사점·BD 함의`(STEP 4).
- 마크다운으로 스트리밍 출력 → 해당 섹션에 렌더 + `analyses` 테이블에 캐시. 재방문 시 캐시 표시 + "다시 분석" 버튼.

**(C) 챗 탭**
- 자유 멀티턴. 토큰 스트리밍. `chat_messages`에 미러 저장(UI 복원용).
- 같은 세션이므로 PDF·이전 분석·이전 질문을 이미 알고 있음.

**(D) 선택 액션** — §7 참조 (역시 같은 세션).

### 4.4 출력 언어
- 기본 한국어(스킬 기본값과 일치). 번역 액션은 한국어로.

### 4.5 STEP 1 어댑터 프롬프트
스킬 STEP 1은 마크다운을 출력하도록 설계돼 있어 그대로 쓰면 JSON이 안 나온다. 아래처럼 **항목 정의는 스킬 STEP 1을 차용하되 출력 계약만 JSON으로 바꾼다.**

```
이 PDF를 Read 툴로 직접 읽어라(pdf-reading 스킬이나 /mnt/skills 경로는 무시).
경로: <absolute_pdf_path>

biopaper-analyst STEP 1(논문 기본정보·연구목적·방법론·주요결과·저자결론)의 항목 정의를 따라 분석하되,
산문/마크다운/이모지 불릿로 쓰지 말고 아래 스키마(§5)에 맞는 JSON '하나'만 출력하라.
- 코드펜스(```), 서문, 설명 문장 금지. 첫 글자가 '{' 이고 마지막 글자가 '}' 여야 한다.
- 모르는 값은 null, "해당 없음"은 빈 배열이 아니라 명시적 값으로 구분.
- paper_type은 ml_method | experimental | review 중 하나로 강제.
```

- 파서는 펜스/선행 텍스트를 한 번 제거 후 `JSON.parse`. 실패 시 "JSON만, 코드펜스 없이 다시" 1회 재시도. 그래도 실패면 §9에 따라 원문 표시 + 수동 재분석.
- **(옵션) 필드 단위 점진 표시가 필요하면** 위 JSON 대신 **NDJSON**(한 줄 = `{"field":"basic","value":{...}}`)을 요청하고, 서버가 줄 단위로 파싱해 카드를 부분 렌더한 뒤 최종 합쳐 `analysis_json`에 저장.
- STEP 2/3/4 온디맨드 호출은 JSON 강제 없이 **스킬 원래 마크다운 출력**을 그대로 받아 `analyses.content_md`에 저장한다(어댑터는 STEP 1에만 적용).

---

## 5. STEP 1 분석 JSON 스키마

`biopaper-analyst` STEP 1과 1:1 대응. 정보 패널 카드의 데이터 소스.

```json
{
  "tldr": "한 줄 요약(한국어)",
  "paper_type": "ml_method | experimental | review",
  "basic": {
    "title": "string",
    "journal": "string|null",
    "year": "number|null",
    "impact_factor": "string|null",
    "authors": ["string"],
    "affiliations": ["string"],
    "collab_type": "academic | pharma | startup | mixed | unknown"
  },
  "objective": {
    "core_problem": "해결하려는 핵심 문제(1~2문장)",
    "differentiation": "기존 방법 대비 차별점"
  },
  "methods": {
    "architecture": "모델/접근 종류",
    "learning_strategy": "지도/비지도/강화/파운데이션 등",
    "datasets": [{ "name": "string", "size": "string", "split": "string", "public": "boolean|null" }],
    "metrics": ["AUC, RMSE, Pearson R 등"]
  },
  "results": {
    "quantitative": ["숫자 포함 주요 성과"],
    "vs_baseline": "베이스라인 대비 개선 정도",
    "validation_level": "none | in_vitro | in_vivo | clinical"
  },
  "conclusion": {
    "contributions": ["저자가 강조하는 기여"],
    "authors_limitations": ["저자가 인정한 한계"]
  }
}
```

> 실험/리뷰 논문이면 일부 필드가 비거나 의미가 달라질 수 있음. `paper_type`에 따라 카드 표시를 조정(예: 리뷰는 `methods.datasets`/`metrics` 숨김, 핵심주장·미해결과제 강조). 빈 필드는 "해당 없음"으로 표기하고 누락과 구분.

---

## 6. UI 레이아웃

### 6.1 라이브러리 뷰(홈)
- 논문 목록(TanStack Table): 제목 / 저자 / 저널·연도 / 추가일 / 분석상태 배지(`분석 중`/`완료`/`오류`).
- 검색·필터(제목·저자·연도·paper_type).
- **PDF 드래그앤드롭으로 추가** → 해시 계산 → 중복이면 기존 항목 오픈, 신규면 사본 저장 후 리더로 진입하며 자동 분석 시작.
- 항목 클릭 → 리더 뷰.

### 6.2 리더 뷰
- **좌측: PDF 뷰어**
  - 페이지 네비/줌, 텍스트 레이어(드래그 선택), 하이라이트 오버레이.
  - 마지막 읽던 페이지 복원, 페이지 이동 시 `last_page` 저장.
- **우측: 탭 패널** — `정보` | `챗` | `하이라이트`
  - **정보 탭**: 상단에 STEP 1 카드들(TL;DR → 기본정보 → 목적 → 방법 → 결과 → 결론/한계). 그 아래 온디맨드 버튼 3개(STEP 2/3/4)와 결과 섹션(접기/펼치기, 캐시 표시).
  - **챗 탭**: 메시지 스트림 + 입력창. 스트리밍.
  - **하이라이트 탭**: 페이지순 하이라이트 목록(텍스트·메모·색), 클릭 시 해당 페이지로 점프, 편집/삭제.

---

## 7. 드래그 토글 메뉴

### 동작
- PDF 텍스트 레이어에서 선택 발생 시, 선택 텍스트 + 페이지 + 바운딩 rect를 캡처.
- 선택 영역 근처에 플로팅 메뉴 표시. 액션:
  1. **번역(→한국어)** — 빠름. 컴팩트 팝오버에 스트리밍.
  2. **쉽게 설명** — 팝오버, 펼치기 가능.
  3. **깊게 설명** — 전문가 수준. 팝오버 + 펼치기.
  4. **용어 정의** — 빠름. 팝오버.
  5. **채팅으로 보내기** — `챗` 탭으로 전환하며 선택 텍스트를 인용해 입력 프리필.
  6. **하이라이트 저장** — LLM 호출 없음. `highlights`에 저장(메모 입력 옵션).

### 구현 메모
- 1~4번 LLM 액션은 **해당 논문 세션**으로 보낸다 → "이 문장"이 논문 맥락 안에서 해석됨. 프롬프트에 선택 텍스트와 페이지를 포함.
  - 예) 번역: `다음 발췌를 자연스러운 한국어로 번역(전문 용어는 원어 병기). 발췌(p.<page>): "<selected>"`
  - 예) 깊게 설명: `다음 발췌를 이 논문 맥락에서 전문가 수준으로 설명. 필요한 배경·함의 포함. 발췌(p.<page>): "<selected>"`
- 결과 팝오버는 WS 스트리밍으로 점진 표시.
- 스캔 PDF(텍스트 레이어 없음)는 선택 불가 → 메뉴 미표시(분석 자체는 Claude가 이미지 페이지를 읽어 가능, OCR은 v1 범위 외).

---

## 8. 크로스플랫폼 주의사항

- **경로**: 모든 파일 경로는 Node `path`로 정규화. 구분자 하드코딩 금지. Windows/POSIX 경로 혼용 금지.
- **앱데이터**: `env-paths`로 해석(§2).
- **Claude 탐지 실패 시** OS별 안내(§4.1).
- **툴 잠금**으로 Windows Bash 도구 이슈 회피(§0-2). 즉 별도 Windows 분기 불필요.
- **better-sqlite3**: 네이티브 모듈. 두 OS prebuild 존재하므로 일반 `npm install`로 충분(Electron 미사용).

---

## 9. 에러·엣지 처리

- Claude 미설치/미인증 → 온보딩 화면(차단형).
- STEP 1 JSON 파싱 실패 → 1회 재시도, 그래도 실패면 원문 표시 + 수동 "재분석".
- 세션 resume 만료 → 조용히 새 세션 + PDF 재-Read.
- 대용량 PDF → Claude의 `Read` 툴이 페이지 청크로 직접 처리(샌드박스 전용 `pdf-reading` 스킬·`/mnt/skills` 경로는 로컬에 없으므로 의존하지 않음). 앱은 타임아웃·진행표시만 책임.
- **사용량 한도 초과**(구독 quota) → 사용자 친화적 에러 메시지로 surface. (헤드리스 사용은 Claude 구독 한도에서 차감되며, 향후 별도 풀로 분리될 수 있음을 README에 note.)
- WS 연결 끊김 → 자동 재연결, 진행 중 작업 상태 복구.

---

## 10. 구현 단계 (권장 순서)

- **Phase 0** — 모노레포 스캐폴딩, 서버/클라 기동, Claude 탐지·온보딩, DB 초기화.
- **Phase 1** — 라이브러리: PDF 드래그 추가(해시·사본·중복판정), 목록, 리더의 PDF 뷰어 + 읽던 위치 복원.
- **Phase 2** *(핵심)* — 세션 매니저 + 자동 STEP 1 분석 + 정보 카드 렌더(스트리밍).
- **Phase 3** — 챗 탭(스트리밍, 세션 resume, 미러 저장).
- **Phase 4** — 드래그 토글(번역/쉽게·깊게 설명/용어/채팅 전송).
- **Phase 5** — 하이라이트/노트 영속화 + 하이라이트 탭.
- **Phase 6** — STEP 2/3/4 온디맨드 섹션 + 캐시.
- **Phase 7** — 폴리시: 에러 상태, 재연결, 빈/스캔 PDF 처리, 설정(모델·스킬 경로).

각 Phase 끝에서 두 OS(가능하면) 또는 최소 현재 OS에서 동작 확인 후 다음으로.

---

## 11. 구현 전 확인·검증 항목

- [ ] **Claude Agent SDK 정확한 TS 패키지명·현재 API** (개명되었으므로 공식 문서 확인 필수). `ClaudeSDKClient` 멀티턴·`session_id` resume·`allowedTools`·`permissionMode`·`settingSources` 시그니처.
- [ ] **JSON 구조화 출력** 방식: 프롬프트로 "JSON만" 강제 + 방어 파싱으로 갈지, SDK의 structured output 기능이 있으면 그쪽을 쓸지.
- [ ] **biopaper-analyst 스킬 노출**: 작업 디렉토리(`<cwd>/.claude/skills/`)에 SKILL.md + references 4개 복사 + 로컬 패치(샌드박스 경로 제거) + `settingSources:["project"]` 로드가 실제로 발견되는지 확인(현재 플러그인 설치 상태와 무관하게 동작해야 함).
- [ ] **기본 모델 문자열**: 변동성이 있으므로 설정값 + 합리적 기본값. 하드코딩 지양.
- [ ] **권한 모드 + 경로 스코핑**: allowlist 밖 거부 + 무인 실행 시 프롬프트로 멈추지 않는 fail-closed 모드 확인. **추가로 `Read` 경로를 `canUseTool` 콜백으로 논문 폴더 내부로 제한**(절대경로 우회 차단).
- [ ] **프롬프트 캐싱**: resume/멀티턴에서 PDF를 포함한 트랜스크립트가 캐시되어 후속 턴 비용이 실제로 절감되는지 SDK 지원 방식 확인.
- [ ] **세션 동시성**: 같은 세션에 자동 STEP1·챗·선택액션이 겹칠 때 큐/뮤텍스로 직렬화되는지, 진행 중 abort가 동작하는지 확인.
- [ ] **패키징·실행 방식**: Vite+Fastify 로컬앱을 사용자가 실제로 어떻게 기동·배포하는지(브라우저 localhost / 트레이 / 설치 패키지) 결정. 추후 Electron/Tauri 전환 시 better-sqlite3 ABI 재빌드 필요함을 README note.
