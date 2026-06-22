// DB 접근 레이어. row(JSON 문자열) ↔ shared 타입 변환을 한곳에 모은다.
import { db } from "./schema.js";
import { v4 as uuid } from "uuid";
import type {
  Paper,
  Highlight,
  AnalysisDoc,
  AnalysisKind,
  ChatMessage,
  StepOneAnalysis,
  PaperType,
  AnalysisStatus,
  NormalizedRect,
} from "../../../shared/types.js";

interface PaperRow {
  id: string;
  content_hash: string;
  title: string | null;
  authors_json: string | null;
  journal: string | null;
  year: number | null;
  file_path: string;
  original_name: string | null;
  page_count: number | null;
  paper_type: string | null;
  analysis_json: string | null;
  analysis_status: string;
  claude_session_id: string | null;
  last_page: number;
  added_at: string;
  last_opened_at: string | null;
}

function parseArr(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToPaper(r: PaperRow): Paper {
  return {
    id: r.id,
    content_hash: r.content_hash,
    title: r.title,
    authors: parseArr(r.authors_json),
    journal: r.journal,
    year: r.year,
    original_name: r.original_name,
    page_count: r.page_count,
    paper_type: (r.paper_type as PaperType | null) ?? null,
    analysis: r.analysis_json ? (JSON.parse(r.analysis_json) as StepOneAnalysis) : null,
    analysis_status: r.analysis_status as AnalysisStatus,
    last_page: r.last_page,
    added_at: r.added_at,
    last_opened_at: r.last_opened_at,
  };
}

// ── papers ──────────────────────────────────────────────────
export function findPaperByHash(hash: string): PaperRow | undefined {
  return db.prepare("SELECT * FROM papers WHERE content_hash = ?").get(hash) as PaperRow | undefined;
}

export function getPaperRow(id: string): PaperRow | undefined {
  return db.prepare("SELECT * FROM papers WHERE id = ?").get(id) as PaperRow | undefined;
}

export function getPaper(id: string): Paper | undefined {
  const r = getPaperRow(id);
  return r ? rowToPaper(r) : undefined;
}

export function getPaperFilePath(id: string): string | undefined {
  return getPaperRow(id)?.file_path;
}

export function listPapers(): Paper[] {
  const rows = db
    .prepare("SELECT * FROM papers ORDER BY COALESCE(last_opened_at, added_at) DESC")
    .all() as PaperRow[];
  return rows.map(rowToPaper);
}

export function insertPaper(args: {
  contentHash: string;
  filePath: string;
  originalName: string;
  pageCount: number | null;
}): Paper {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO papers (id, content_hash, file_path, original_name, page_count, analysis_status, last_page, added_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 1, ?)`,
  ).run(id, args.contentHash, args.filePath, args.originalName, args.pageCount, now);
  return getPaper(id)!;
}

export function setAnalysisStatus(id: string, status: AnalysisStatus): void {
  db.prepare("UPDATE papers SET analysis_status = ? WHERE id = ?").run(status, id);
}

export function saveStepOne(id: string, a: StepOneAnalysis): void {
  db.prepare(
    `UPDATE papers SET analysis_json = ?, paper_type = ?, title = ?, authors_json = ?,
       journal = ?, year = ?, analysis_status = 'done' WHERE id = ?`,
  ).run(
    JSON.stringify(a),
    a.paper_type,
    a.basic.title ?? null,
    JSON.stringify(a.basic.authors ?? []),
    a.basic.journal ?? null,
    a.basic.year ?? null,
    id,
  );
}

export function setSessionId(id: string, sessionId: string): void {
  db.prepare("UPDATE papers SET claude_session_id = ? WHERE id = ?").run(sessionId, id);
}

export function getSessionId(id: string): string | null {
  return getPaperRow(id)?.claude_session_id ?? null;
}

export function setLastPage(id: string, page: number): void {
  db.prepare("UPDATE papers SET last_page = ? WHERE id = ?").run(page, id);
}

export function touchOpened(id: string): void {
  db.prepare("UPDATE papers SET last_opened_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function deletePaper(id: string): void {
  db.prepare("DELETE FROM papers WHERE id = ?").run(id);
}

// ── analyses (STEP 2/3/4) ───────────────────────────────────
export function getAnalyses(paperId: string): AnalysisDoc[] {
  return db
    .prepare("SELECT * FROM analyses WHERE paper_id = ? ORDER BY created_at")
    .all(paperId) as AnalysisDoc[];
}

export function upsertAnalysis(paperId: string, kind: AnalysisKind, contentMd: string): AnalysisDoc {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO analyses (id, paper_id, kind, content_md, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(paper_id, kind) DO UPDATE SET content_md = excluded.content_md, created_at = excluded.created_at`,
  ).run(id, paperId, kind, contentMd, now);
  return db
    .prepare("SELECT * FROM analyses WHERE paper_id = ? AND kind = ?")
    .get(paperId, kind) as AnalysisDoc;
}

// ── highlights ──────────────────────────────────────────────
interface HiRow {
  id: string;
  paper_id: string;
  page: number;
  rects_json: string;
  selected_text: string;
  color: string;
  note: string | null;
  created_at: string;
}
function rowToHi(r: HiRow): Highlight {
  return {
    id: r.id,
    paper_id: r.paper_id,
    page: r.page,
    rects: JSON.parse(r.rects_json) as NormalizedRect[],
    selected_text: r.selected_text,
    color: r.color,
    note: r.note,
    created_at: r.created_at,
  };
}

export function listHighlights(paperId: string): Highlight[] {
  const rows = db
    .prepare("SELECT * FROM highlights WHERE paper_id = ? ORDER BY page, created_at")
    .all(paperId) as HiRow[];
  return rows.map(rowToHi);
}

export function insertHighlight(args: {
  paperId: string;
  page: number;
  rects: NormalizedRect[];
  selectedText: string;
  color?: string;
  note?: string | null;
}): Highlight {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO highlights (id, paper_id, page, rects_json, selected_text, color, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    args.paperId,
    args.page,
    JSON.stringify(args.rects),
    args.selectedText,
    args.color ?? "yellow",
    args.note ?? null,
    now,
  );
  return rowToHi(db.prepare("SELECT * FROM highlights WHERE id = ?").get(id) as HiRow);
}

export function updateHighlight(id: string, patch: { note?: string | null; color?: string }): void {
  if (patch.note !== undefined)
    db.prepare("UPDATE highlights SET note = ? WHERE id = ?").run(patch.note, id);
  if (patch.color !== undefined)
    db.prepare("UPDATE highlights SET color = ? WHERE id = ?").run(patch.color, id);
}

export function deleteHighlight(id: string): void {
  db.prepare("DELETE FROM highlights WHERE id = ?").run(id);
}

// ── chat (UI 미러) ──────────────────────────────────────────
export function listChat(paperId: string): ChatMessage[] {
  return db
    .prepare("SELECT * FROM chat_messages WHERE paper_id = ? ORDER BY created_at")
    .all(paperId) as ChatMessage[];
}

export function insertChat(paperId: string, role: "user" | "assistant", content: string): ChatMessage {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO chat_messages (id, paper_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, paperId, role, content, now);
  return db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as ChatMessage;
}

export function recentChat(paperId: string, n: number): ChatMessage[] {
  const rows = db
    .prepare("SELECT * FROM chat_messages WHERE paper_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(paperId, n) as ChatMessage[];
  return rows.reverse();
}
