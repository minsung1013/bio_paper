// PDF 해시·사본 저장·페이지수 추정 (spec §1, §2, §8).
import { createHash } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PAPERS_DIR } from "../config.js";

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// 관리 폴더 내 사본 경로(해시 기반). 구분자는 path.join 으로 정규화.
export function paperPathForHash(hash: string): string {
  return join(PAPERS_DIR, `${hash}.pdf`);
}

// 사본 저장(이미 있으면 그대로 둠 = 중복 캐시).
export function storePdf(buf: Buffer, hash: string): string {
  const dest = paperPathForHash(hash);
  if (!existsSync(dest)) writeFileSync(dest, buf);
  return dest;
}

// PDF 페이지 수 대략 추정(Count 항목). 실패해도 null 로 진행 — 정확값은 클라 pdfjs 가 가짐.
export function estimatePageCount(buf: Buffer): number | null {
  try {
    const text = buf.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    if (matches && matches.length > 0) return matches.length;
    const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    if (counts.length) return Math.max(...counts);
  } catch {
    /* ignore */
  }
  return null;
}
