// REST 클라이언트 (spec §통신규약). 상대 URL → vite 프록시 → 서버.
import type { Paper, Highlight, AnalysisDoc, ChatMessage, NormalizedRect } from "../types";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export interface ClaudeStatus {
  installed: boolean;
  version: string | null;
  install_hint: { platform: string; command: string; note?: string };
}

export interface PaperBundle {
  paper: Paper;
  highlights: Highlight[];
  analyses: AnalysisDoc[];
  chat: ChatMessage[];
}

export interface AppSettings {
  model?: string;
  effectiveModel: string | null;
  envOverride?: boolean;
}

export const api = {
  claudeStatus: () => fetch("/api/claude-status").then(j<ClaudeStatus>),
  getSettings: () => fetch("/api/settings").then(j<AppSettings>),
  setModel: (model: string) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    }).then(j<AppSettings>),
  listPapers: () => fetch("/api/papers").then(j<Paper[]>),
  getPaper: (id: string) => fetch(`/api/papers/${id}`).then(j<PaperBundle>),
  pdfUrl: (id: string) => `/api/papers/${id}/pdf`,

  addPaper: async (file: File): Promise<{ paper: Paper; duplicate: boolean }> => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/papers", { method: "POST", body: fd }).then(
      j<{ paper: Paper; duplicate: boolean }>,
    );
  },

  setLastPage: (id: string, last_page: number) =>
    fetch(`/api/papers/${id}/last-page`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ last_page }),
    }).then(j<{ ok: true }>),

  deletePaper: (id: string) => fetch(`/api/papers/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),

  addHighlight: (
    id: string,
    body: { page: number; rects: NormalizedRect[]; selected_text: string; color?: string; note?: string },
  ) =>
    fetch(`/api/papers/${id}/highlights`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<Highlight>),

  updateHighlight: (hid: string, patch: { note?: string; color?: string }) =>
    fetch(`/api/highlights/${hid}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<{ ok: true }>),

  deleteHighlight: (hid: string) =>
    fetch(`/api/highlights/${hid}`, { method: "DELETE" }).then(j<{ ok: true }>),
};
