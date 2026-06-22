// 앱 데이터 경로·설정 (spec §2, §8). env-paths 로 OS 표준 경로 해석.
import envPaths from "env-paths";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const paths = envPaths("PaperReader", { suffix: "" });

// Windows: %APPDATA%\PaperReader\ , macOS: ~/Library/Application Support/PaperReader/
export const DATA_DIR = paths.data;
export const PAPERS_DIR = join(DATA_DIR, "papers"); // <hash>.pdf
export const WORK_DIR = join(DATA_DIR, "work"); // 논문별 cwd(스킬 사본 등)
export const DB_PATH = join(DATA_DIR, "library.db");

export function ensureDirs(): void {
  for (const d of [DATA_DIR, PAPERS_DIR, WORK_DIR]) {
    mkdirSync(d, { recursive: true });
  }
}

// 설정값 (모델·스킬경로·세션상한 등은 추후 settings.json 으로 외부화. spec §11)
export const config = {
  port: Number(process.env.PORT ?? 5174),
  host: process.env.HOST ?? "127.0.0.1",
  // 모델 문자열은 변동성이 있으므로 설정값 + 합리적 기본값(하드코딩 지양, spec §11)
  model: process.env.PAPER_READER_MODEL ?? undefined, // undefined = CLI 기본
  maxActiveSessions: Number(process.env.PAPER_READER_MAX_SESSIONS ?? 4),
  sessionIdleMs: Number(process.env.PAPER_READER_SESSION_IDLE_MS ?? 15 * 60 * 1000),
};
