// biopaper-analyst 스킬을 논문 작업 디렉토리(cwd)에 복사 + 로컬 패치 (spec §0-3, §4.2).
// 현재 스킬은 플러그인으로 설치돼 있어 버전 폴더가 바뀌므로 경로를 탐색해 복사한다.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WORK_DIR } from "../config.js";

// 플러그인 캐시에서 biopaper-analyst 스킬 폴더(최신 버전) 탐색.
function findInstalledSkillDir(): string | null {
  const candidates = [
    join(homedir(), ".claude", "skills", "biopaper-analyst"), // 전역 스킬 폴더 우선
    join(homedir(), ".claude", "plugins", "cache", "local-skills", "biopaper-analyst"),
  ];
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    // base 자체가 SKILL.md 를 가지면 그대로
    if (existsSync(join(base, "SKILL.md"))) return base;
    // 버전 폴더(<ver>/skills/biopaper-analyst/) 구조 탐색
    const versions = readdirSync(base)
      .map((v) => join(base, v))
      .filter((p) => statSync(p).isDirectory())
      .sort()
      .reverse();
    for (const v of versions) {
      const inner = join(v, "skills", "biopaper-analyst");
      if (existsSync(join(inner, "SKILL.md"))) return inner;
    }
  }
  return null;
}

// 샌드박스 전용 경로 지시를 로컬용으로 치환.
function patchSkillMd(md: string): string {
  let out = md;
  // pdf-reading 스킬 / /mnt/skills 경로 지시 제거 → Read 툴 직접 사용
  out = out.replace(
    /PDF인 경우 반드시 `\/mnt\/skills\/public\/pdf-reading\/SKILL\.md`를 먼저 읽고 텍스트를 추출하세요\./g,
    "PDF는 `Read` 툴로 직접 읽으세요(샌드박스 전용 `pdf-reading`·`/mnt/skills` 경로는 로컬에 없으므로 사용 금지).",
  );
  out = out.replace(/`\/mnt\/skills\/public\/pdf-reading\/SKILL\.md`/g, "`Read` 툴");
  out = out.replace(/`\/mnt\/skills\/public\/pdf\/SKILL\.md`/g, "로컬 저장 기능(이 앱이 처리)");
  out = out.replace(
    /1\. \*\*PDF 파일\*\*: `pdf-reading` 스킬을 먼저 사용해 텍스트 추출 후 분석/g,
    "1. **PDF 파일**: `Read` 툴로 직접 읽어 분석",
  );
  // 패치 표식
  out = "<!-- patched for local Paper Reader: sandbox paths removed -->\n" + out;
  return out;
}

// 논문별 cwd 경로.
export function workDirForPaper(paperId: string): string {
  return join(WORK_DIR, paperId);
}

// cwd 준비: <cwd>/.claude/skills/biopaper-analyst 에 패치된 스킬 복사.
// 반환: { cwd, skillReady }. 스킬을 못 찾아도 cwd 는 반환(분석은 어댑터 프롬프트로 진행 가능).
export function ensurePaperWorkspace(paperId: string): { cwd: string; skillReady: boolean } {
  const cwd = workDirForPaper(paperId);
  const skillDest = join(cwd, ".claude", "skills", "biopaper-analyst");
  mkdirSync(skillDest, { recursive: true });

  const src = findInstalledSkillDir();
  if (!src) return { cwd, skillReady: false };

  // SKILL.md 패치 복사
  const skillMd = readFileSync(join(src, "SKILL.md"), "utf8");
  writeFileSync(join(skillDest, "SKILL.md"), patchSkillMd(skillMd));

  // references/*.md 통째 복사(있으면)
  const refSrc = join(src, "references");
  if (existsSync(refSrc)) {
    cpSync(refSrc, join(skillDest, "references"), { recursive: true });
  }
  return { cwd, skillReady: true };
}
