// 논문별 Claude 세션 매니저 (spec §4.2).
// 핵심 결정(실제 TS SDK 기준):
//  - TS SDK 는 ClaudeSDKClient(=Python명) 가 아니라 query() 를 쓴다. 멀티턴은 resume 로.
//  - allowedTools 는 "자동승인" 목록일 뿐 화이트리스트가 아니다 →
//    진짜 fail-closed 는 permissionMode:'dontAsk'(미승인 시 프롬프트 없이 거부)
//    + allowedTools:["Read","WebSearch"] + canUseTool 경로검사 조합.
//  - 각 턴은 독립 query() 호출(resume 로 맥락 유지). 프로세스가 턴마다 뜨고 닫혀
//    장기 프로세스 누수가 없다. 세션 영속성은 디스크 resume 로 보장.
//  - 같은 세션에 STEP1/챗/선택액션이 겹치지 않도록 퍼-페이퍼 뮤텍스로 직렬화.
import { query, type Options, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import { config } from "../config.js";
import { getModel } from "../settings.js";
import { ensurePaperWorkspace } from "./skill.js";
import { getSessionId, setSessionId, getPaperFilePath } from "../db/queries.js";

export interface TurnOptions {
  // 첫 턴이면 PDF Read 가 필요 → forceFresh 로 resume 무시(세션 만료 복구 등).
  forceFresh?: boolean;
  // 스트리밍 텍스트 델타 콜백.
  onDelta?: (text: string) => void;
  // 상태 텍스트(스켈레톤 표시용).
  onStatus?: (text: string) => void;
}

export interface TurnResult {
  text: string;
  sessionId: string | null;
  error?: { message: string; code?: string };
}

interface PaperRuntime {
  // 직렬화용 promise 체인 꼬리.
  tail: Promise<unknown>;
  // 진행 중 query (취소용).
  current: ReturnType<typeof query> | null;
  lastUsed: number;
}

const runtimes = new Map<string, PaperRuntime>();

function rt(paperId: string): PaperRuntime {
  let r = runtimes.get(paperId);
  if (!r) {
    r = { tail: Promise.resolve(), current: null, lastUsed: Date.now() };
    runtimes.set(paperId, r);
  }
  return r;
}

// 경로 스코핑: Read 는 해당 논문 PDF 와 작업 디렉토리(cwd) 안만 허용 (spec §0-2, §8).
function makeCanUseTool(allowedRoots: string[]) {
  const roots = allowedRoots.map((p) => resolve(p));
  return async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> => {
    if (toolName === "WebSearch") return { behavior: "allow", updatedInput: input };
    if (toolName === "Read") {
      const fp = typeof input.file_path === "string" ? resolve(input.file_path) : "";
      const ok = roots.some((root) => fp === root || fp.startsWith(root + "\\") || fp.startsWith(root + "/"));
      if (ok) return { behavior: "allow", updatedInput: input };
      return { behavior: "deny", message: `논문 폴더 밖 경로 접근 차단: ${fp}` };
    }
    // 그 외 모든 툴(Write/Edit/Bash 등) 거부 — 읽기전용 잠금.
    return { behavior: "deny", message: `허용되지 않은 툴: ${toolName}` };
  };
}

function extractAssistantText(message: any): string {
  const content = message?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("");
  }
  return "";
}

// 한 턴 실행(직렬화). prompt 는 이번 턴 사용자 입력.
export function runTurn(
  paperId: string,
  prompt: string,
  opts: TurnOptions = {},
): Promise<TurnResult> {
  const r = rt(paperId);
  const task = r.tail.then(() => execTurn(paperId, prompt, opts));
  // 체인 유지(에러가 체인을 끊지 않게 catch 로 흡수).
  r.tail = task.catch(() => undefined);
  return task;
}

async function execTurn(
  paperId: string,
  prompt: string,
  opts: TurnOptions,
): Promise<TurnResult> {
  const r = rt(paperId);
  r.lastUsed = Date.now();

  const pdfPath = getPaperFilePath(paperId);
  if (!pdfPath) return { text: "", sessionId: null, error: { message: "PDF 경로 없음" } };

  const { cwd } = ensurePaperWorkspace(paperId);
  const priorSession = opts.forceFresh ? null : getSessionId(paperId);

  const options: Options = {
    cwd,
    model: getModel(), // 설정/환경변수에서 동적으로(새 턴부터 즉시 적용)
    allowedTools: ["Read", "WebSearch"],
    disallowedTools: ["Bash", "Write", "Edit", "NotebookEdit"],
    permissionMode: "dontAsk", // 미승인 시 프롬프트 없이 거부 = fail-closed
    canUseTool: makeCanUseTool([pdfPath, cwd]),
    settingSources: ["project"], // <cwd>/.claude/skills 의 biopaper-analyst 로드
    ...(priorSession ? { resume: priorSession } : {}),
  };

  let text = "";
  let sessionId: string | null = priorSession;
  let error: TurnResult["error"];

  try {
    const q = query({ prompt, options });
    r.current = q;
    for await (const msg of q as AsyncGenerator<any>) {
      switch (msg.type) {
        case "status":
        case "tool_progress":
          if (opts.onStatus && typeof msg.text === "string") opts.onStatus(msg.text);
          break;
        case "assistant": {
          if (msg.error) {
            error = { message: `모델 오류: ${msg.error}`, code: String(msg.error) };
          }
          const t = extractAssistantText(msg);
          if (t) {
            text += t;
            opts.onDelta?.(t);
          }
          break;
        }
        case "result": {
          if (typeof msg.session_id === "string") sessionId = msg.session_id;
          if (msg.subtype && msg.subtype !== "success") {
            error ??= { message: `실행 종료: ${msg.subtype}`, code: msg.subtype };
          }
          break;
        }
      }
    }
  } catch (e: any) {
    error = { message: e?.message ?? String(e), code: "exception" };
  } finally {
    r.current = null;
    r.lastUsed = Date.now();
  }

  if (sessionId && sessionId !== priorSession) setSessionId(paperId, sessionId);
  return { text, sessionId, error };
}

// 진행 중 턴 취소 (논문 닫기·페이지 이탈, spec §4.2).
export async function cancel(paperId: string): Promise<void> {
  const r = runtimes.get(paperId);
  if (r?.current) {
    try {
      await r.current.interrupt();
    } catch {
      /* ignore */
    }
  }
}

// 유휴 런타임 정리(상한·idle, spec §4.2). 장기 프로세스가 없으므로 맵 정리 수준.
export function reapIdle(): void {
  const now = Date.now();
  for (const [id, r] of runtimes) {
    if (!r.current && now - r.lastUsed > config.sessionIdleMs) runtimes.delete(id);
  }
}
setInterval(reapIdle, 60_000).unref?.();
