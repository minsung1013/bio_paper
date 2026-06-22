// better-sqlite3 초기화 + DDL (spec §3). 단일 커넥션, WAL 모드.
import Database from "better-sqlite3";
import { DB_PATH, ensureDirs } from "../config.js";

ensureDirs();

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS papers (
  id                TEXT PRIMARY KEY,
  content_hash      TEXT UNIQUE NOT NULL,
  title             TEXT,
  authors_json      TEXT,
  journal           TEXT,
  year              INTEGER,
  file_path         TEXT NOT NULL,
  original_name     TEXT,
  page_count        INTEGER,
  paper_type        TEXT,
  analysis_json     TEXT,
  analysis_status   TEXT NOT NULL DEFAULT 'pending',
  claude_session_id TEXT,
  last_page         INTEGER NOT NULL DEFAULT 1,
  added_at          TEXT NOT NULL,
  last_opened_at    TEXT
);

CREATE TABLE IF NOT EXISTS analyses (
  id         TEXT PRIMARY KEY,
  paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  content_md TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(paper_id, kind)
);

CREATE TABLE IF NOT EXISTS highlights (
  id            TEXT PRIMARY KEY,
  paper_id      TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page          INTEGER NOT NULL,
  rects_json    TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  color         TEXT DEFAULT 'yellow',
  note          TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_highlights_paper ON highlights(paper_id, page);
CREATE INDEX IF NOT EXISTS idx_chat_paper ON chat_messages(paper_id, created_at);
`);
