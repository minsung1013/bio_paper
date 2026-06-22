// STEP 1 JSON 방어 파싱 (spec §4.3A, §9). 펜스/서문 제거 후 첫 { … } 블록 추출.
import type { StepOneAnalysis, PaperType } from "../../../shared/types.js";

const VALID_TYPES: PaperType[] = ["ml_method", "experimental", "review"];

export function extractJsonObject(raw: string): string | null {
  let s = raw.trim();
  // 코드펜스 제거
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // 첫 '{' 부터 균형 맞는 마지막 '}' 까지
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function parseStepOne(raw: string): StepOneAnalysis | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  let obj: any;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  // paper_type 정규화/검증
  let pt = String(obj.paper_type ?? "").trim() as PaperType;
  if (!VALID_TYPES.includes(pt)) pt = "ml_method";
  obj.paper_type = pt;
  // 최소 필드 보정(누락 시 빈 구조)
  obj.basic ??= {};
  obj.basic.authors ??= [];
  obj.basic.affiliations ??= [];
  obj.objective ??= { core_problem: "", differentiation: "" };
  obj.methods ??= { architecture: "", learning_strategy: "", datasets: [], metrics: [] };
  obj.results ??= { quantitative: [], vs_baseline: "", validation_level: "none" };
  obj.conclusion ??= { contributions: [], authors_limitations: [] };
  return obj as StepOneAnalysis;
}
