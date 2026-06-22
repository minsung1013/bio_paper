// 앱 설정 영속화 (모델 등). DATA_DIR/settings.json. 환경변수 > 파일 > 기본값.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, ensureDirs } from "./config.js";

export interface AppSettings {
  // 모델 별칭("sonnet"|"opus"|"haiku") 또는 풀네임. 빈값/undefined = CLI 기본.
  model?: string;
}

const SETTINGS_PATH = join(DATA_DIR, "settings.json");

let cache: AppSettings | null = null;

function load(): AppSettings {
  if (cache) return cache;
  ensureDirs();
  if (existsSync(SETTINGS_PATH)) {
    try {
      cache = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as AppSettings;
    } catch {
      cache = {};
    }
  } else {
    cache = {};
  }
  return cache;
}

export function getSettings(): AppSettings {
  return { ...load() };
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...load(), ...patch };
  // 빈 문자열 model 은 "기본값으로 되돌리기"로 처리 → 키 제거
  if (patch.model !== undefined && patch.model.trim() === "") delete next.model;
  cache = next;
  writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  return { ...next };
}

// 실제 사용할 모델. 환경변수가 최우선(운영 오버라이드), 그다음 설정 파일.
export function getModel(): string | undefined {
  const env = process.env.PAPER_READER_MODEL;
  if (env && env.trim()) return env.trim();
  const m = load().model;
  return m && m.trim() ? m.trim() : undefined;
}
