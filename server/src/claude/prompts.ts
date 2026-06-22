// 프롬프트 모음 (spec §4.5 어댑터, §4.3 온디맨드, §7 선택액션).
import type { AnalysisKind, SelectionAction } from "../../../shared/types.js";

// 첫 턴: PDF 를 Read 시키는 도입부. 이후 턴은 resume 로 맥락 유지.
export function readPdfPreamble(pdfPath: string): string {
  return `이 PDF를 Read 툴로 직접 읽어라(pdf-reading 스킬이나 /mnt/skills 경로는 무시).\n경로: ${pdfPath}`;
}

// STEP 1 어댑터 — 스킬 항목 정의 차용 + §5 JSON 으로만 출력 (spec §4.5).
export function step1Prompt(pdfPath: string): string {
  return `${readPdfPreamble(pdfPath)}

biopaper-analyst STEP 1(논문 기본정보·연구목적·방법론·주요결과·저자결론)의 항목 정의를 따라 분석하되,
산문/마크다운/이모지 불릿로 쓰지 말고 아래 스키마에 맞는 JSON '하나'만 출력하라.
- 코드펜스(\`\`\`), 서문, 설명 문장 금지. 첫 글자가 '{' 이고 마지막 글자가 '}' 여야 한다.
- 모르는 값은 null. 배열 항목이 없으면 빈 배열. "해당 없음"은 문자열로 명시.
- paper_type 은 "ml_method" | "experimental" | "review" 중 하나로 강제.
- 출력 언어: 한국어.

스키마:
{
  "tldr": "한 줄 요약(한국어)",
  "paper_type": "ml_method | experimental | review",
  "basic": { "title": string, "journal": string|null, "year": number|null, "impact_factor": string|null,
             "authors": string[], "affiliations": string[],
             "collab_type": "academic|pharma|startup|mixed|unknown" },
  "objective": { "core_problem": string, "differentiation": string },
  "methods": { "architecture": string, "learning_strategy": string,
               "datasets": [{ "name": string, "size": string, "split": string, "public": boolean|null }],
               "metrics": string[] },
  "results": { "quantitative": string[], "vs_baseline": string,
               "validation_level": "none|in_vitro|in_vivo|clinical" },
  "conclusion": { "contributions": string[], "authors_limitations": string[] }
}`;
}

export function step1RetryPrompt(): string {
  return "직전 응답이 JSON 파싱에 실패했다. 코드펜스·서문 없이, 첫 글자 '{' 마지막 글자 '}' 인 순수 JSON 객체 하나만 다시 출력하라.";
}

// 온디맨드 STEP 2/3/4 — 스킬 원래 마크다운 출력 그대로 (spec §4.5).
export function onDemandPrompt(kind: AnalysisKind): string {
  switch (kind) {
    case "critique":
      return "방금 읽은 이 논문에 대해 biopaper-analyst STEP 2(비판적 분석)을 수행하라. 마크다운으로 출력. 한국어.";
    case "trends":
      return "이 논문에 대해 biopaper-analyst STEP 3(최신 연구 동향 비교)을 수행하라. 반드시 WebSearch 로 최신 문헌을 검색해 비교하라. 마크다운, 한국어.";
    case "implications":
      return "이 논문에 대해 biopaper-analyst STEP 4(시사점 및 제언)을 수행하라. 마크다운으로 출력. 한국어.";
  }
}

// 선택 액션 — 같은 세션으로 보내 "이 문장"이 논문 맥락에서 해석되게 (spec §7).
export function selectionPrompt(action: SelectionAction, page: number, text: string): string {
  const excerpt = `발췌(p.${page}): "${text}"`;
  switch (action) {
    case "translate":
      return `다음 발췌를 자연스러운 한국어로 번역(전문 용어는 원어 병기). ${excerpt}`;
    case "explain_simple":
      return `다음 발췌를 이 논문 맥락에서 비전문가도 이해하도록 쉽게 설명. ${excerpt}`;
    case "explain_deep":
      return `다음 발췌를 이 논문 맥락에서 전문가 수준으로 설명. 필요한 배경·함의 포함. ${excerpt}`;
    case "define_term":
      return `다음 발췌에 등장하는 핵심 용어들을 이 논문 맥락에서 간단히 정의. ${excerpt}`;
  }
}

// resume 실패 후 새 세션에 직전 챗 맥락을 요약 주입 (spec §4.2).
export function chatContextReinjection(summaryLines: string[]): string {
  if (summaryLines.length === 0) return "";
  return `참고: 이전 대화 요약(맥락 복원용)\n${summaryLines.join("\n")}\n\n위 맥락을 기억하고 이어서 답하라.`;
}
