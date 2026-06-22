// 인터페이스별 오케스트레이션 (spec §4.3). emit 으로 WS 스트리밍.
import type { WsServerMessage, AnalysisKind, SelectionAction } from "../../../shared/types.js";
import { runTurn } from "./sessionManager.js";
import {
  step1Prompt,
  step1RetryPrompt,
  onDemandPrompt,
  selectionPrompt,
  chatContextReinjection,
} from "./prompts.js";
import { parseStepOne } from "./parse.js";
import * as Q from "../db/queries.js";

type Emit = (m: WsServerMessage) => void;

// (A) STEP 1 자동 분석. JSON 은 부분 파싱 안 함 → 상태 텍스트만 스트리밍, 완료 시 카드 (spec §4.3A).
export async function runStep1(paperId: string, emit: Emit): Promise<void> {
  const pdfPath = Q.getPaperFilePath(paperId);
  if (!pdfPath) {
    emit({ type: "error", paperId, channel: "step1", message: "PDF 없음" });
    return;
  }
  Q.setAnalysisStatus(paperId, "running");
  emit({ type: "status", paperId, channel: "step1", text: "PDF 읽는 중…" });

  const first = await runTurn(paperId, step1Prompt(pdfPath), {
    onStatus: (t) => emit({ type: "status", paperId, channel: "step1", text: t }),
  });
  if (first.error) {
    Q.setAnalysisStatus(paperId, "error");
    emit({ type: "error", paperId, channel: "step1", message: first.error.message, code: first.error.code });
    return;
  }

  let analysis = parseStepOne(first.text);
  if (!analysis) {
    // 1회 재시도 (spec §9)
    emit({ type: "status", paperId, channel: "step1", text: "JSON 재시도 중…" });
    const retry = await runTurn(paperId, step1RetryPrompt(), {});
    analysis = parseStepOne(retry.text);
  }

  if (!analysis) {
    Q.setAnalysisStatus(paperId, "error");
    emit({
      type: "error",
      paperId,
      channel: "step1",
      message: "STEP 1 JSON 파싱 실패. 수동 재분석이 필요합니다.",
      code: "parse_failed",
    });
    return;
  }

  Q.saveStepOne(paperId, analysis);
  emit({ type: "step1_done", paperId, analysis });
}

// (B) 온디맨드 STEP 2/3/4. 마크다운 그대로 스트리밍 + 캐시 (spec §4.3B, §4.5).
export async function runOnDemand(
  paperId: string,
  kind: AnalysisKind,
  force: boolean,
  emit: Emit,
): Promise<void> {
  if (!force) {
    const cached = Q.getAnalyses(paperId).find((a) => a.kind === kind);
    if (cached) {
      emit({ type: "ondemand_done", paperId, kind, content_md: cached.content_md });
      return;
    }
  }
  emit({ type: "status", paperId, channel: "ondemand", text: "분석 중…" });
  const res = await runTurn(paperId, onDemandPrompt(kind), {
    onDelta: (t) => emit({ type: "delta", paperId, channel: "ondemand", text: t }),
    onStatus: (t) => emit({ type: "status", paperId, channel: "ondemand", text: t }),
  });
  if (res.error) {
    emit({ type: "error", paperId, channel: "ondemand", message: res.error.message, code: res.error.code });
    return;
  }
  Q.upsertAnalysis(paperId, kind, res.text);
  emit({ type: "ondemand_done", paperId, kind, content_md: res.text });
}

// (C) 챗. 같은 세션 멀티턴 + 미러 저장 (spec §4.3C).
export async function runChat(paperId: string, userText: string, emit: Emit): Promise<void> {
  Q.insertChat(paperId, "user", userText);

  // resume 가능하면 그대로, 없으면(만료) 직전 챗 요약 주입 후 fresh (spec §4.2).
  const hasSession = !!Q.getSessionId(paperId);
  let prompt = userText;
  let forceFresh = false;
  if (!hasSession) {
    forceFresh = true;
    const recent = Q.recentChat(paperId, 6).map((m) => `- ${m.role}: ${m.content.slice(0, 200)}`);
    const reinj = chatContextReinjection(recent);
    prompt = reinj ? `${reinj}\n\n질문: ${userText}` : userText;
  }

  const res = await runTurn(paperId, prompt, {
    forceFresh,
    onDelta: (t) => emit({ type: "delta", paperId, channel: "chat", text: t }),
    onStatus: (t) => emit({ type: "status", paperId, channel: "chat", text: t }),
  });
  if (res.error) {
    emit({ type: "error", paperId, channel: "chat", message: res.error.message, code: res.error.code });
    return;
  }
  const saved = Q.insertChat(paperId, "assistant", res.text);
  emit({ type: "chat_done", paperId, message: saved });
}

// (D) 선택 액션 — 같은 세션으로 (spec §7).
export async function runSelection(
  paperId: string,
  action: SelectionAction,
  page: number,
  text: string,
  emit: Emit,
): Promise<void> {
  emit({ type: "status", paperId, channel: "selection", text: "처리 중…" });
  const res = await runTurn(paperId, selectionPrompt(action, page, text), {
    onDelta: (t) => emit({ type: "delta", paperId, channel: "selection", text: t }),
  });
  if (res.error) {
    emit({ type: "error", paperId, channel: "selection", message: res.error.message, code: res.error.code });
    return;
  }
  emit({ type: "selection_done", paperId, action, text: res.text });
}
