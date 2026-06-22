// 전역 상태 (spec §2 store). zustand.
import { create } from "zustand";
import type {
  Paper,
  Highlight,
  AnalysisDoc,
  ChatMessage,
  StepOneAnalysis,
  AnalysisKind,
  StreamChannel,
} from "../types";
import { api } from "../api/rest";
import { ws } from "../api/ws";

type Route = { name: "library" } | { name: "reader"; paperId: string };

interface Streams {
  // 진행 중 채널별 누적 텍스트/상태
  step1Status: string;
  chatDraft: string; // 스트리밍 중 어시스턴트 답변
  ondemand: Partial<Record<AnalysisKind, string>>;
  ondemandStatus: string;
  selection: { text: string; busy: boolean } | null;
  busy: Partial<Record<StreamChannel, boolean>>;
  error: Partial<Record<StreamChannel, string>>;
}

interface State {
  route: Route;
  papers: Paper[];
  // reader 상태
  paper: Paper | null;
  highlights: Highlight[];
  analyses: AnalysisDoc[];
  chat: ChatMessage[];
  streams: Streams;

  goLibrary: () => void;
  openPaper: (id: string) => Promise<void>;
  refreshPapers: () => Promise<void>;

  // 액션
  sendChat: (text: string) => void;
  runOndemand: (kind: AnalysisKind, force?: boolean) => void;
  runSelection: (action: import("../types").SelectionAction, page: number, text: string) => void;
  addHighlight: (h: Highlight) => void;
  removeHighlight: (hid: string) => void;
}

const emptyStreams = (): Streams => ({
  step1Status: "",
  chatDraft: "",
  ondemand: {},
  ondemandStatus: "",
  selection: null,
  busy: {},
  error: {},
});

export const useStore = create<State>((set, get) => {
  // WS 메시지 → 상태 반영 (모든 채널 멀티플렉싱, spec §4.3)
  ws.on((m) => {
    const cur = get().paper;
    if (!cur || m.paperId !== cur.id) return;
    set((s) => {
      const st = { ...s.streams, busy: { ...s.streams.busy }, error: { ...s.streams.error } };
      switch (m.type) {
        case "status":
          if (m.channel === "step1") st.step1Status = m.text;
          if (m.channel === "ondemand") st.ondemandStatus = m.text;
          st.busy[m.channel] = true;
          break;
        case "delta":
          if (m.channel === "chat") st.chatDraft += m.text;
          if (m.channel === "ondemand")
            st.ondemandStatus = (st.ondemandStatus || "") + ""; // 상태는 유지
          if (m.channel === "selection" && st.selection)
            st.selection = { ...st.selection, text: st.selection.text + m.text };
          break;
        case "step1_done": {
          st.busy.step1 = false;
          st.step1Status = "";
          const p = s.paper ? { ...s.paper, analysis: m.analysis, analysis_status: "done" as const } : s.paper;
          return { paper: p, streams: st };
        }
        case "ondemand_done":
          st.busy.ondemand = false;
          st.ondemand = { ...st.ondemand, [m.kind]: m.content_md };
          return {
            streams: st,
            analyses: upsertAnalysis(s.analyses, m.paperId, m.kind, m.content_md),
          };
        case "chat_done":
          st.busy.chat = false;
          st.chatDraft = "";
          return { streams: st, chat: [...s.chat, m.message] };
        case "selection_done":
          st.selection = { text: m.text, busy: false };
          st.busy.selection = false;
          break;
        case "error":
          st.busy[m.channel] = false;
          st.error[m.channel] = m.message;
          if (m.channel === "step1") st.step1Status = "";
          break;
      }
      return { streams: st };
    });
  });

  return {
    route: { name: "library" },
    papers: [],
    paper: null,
    highlights: [],
    analyses: [],
    chat: [],
    streams: emptyStreams(),

    goLibrary: () => {
      const p = get().paper;
      if (p) ws.send({ type: "cancel", paperId: p.id });
      set({ route: { name: "library" }, paper: null, streams: emptyStreams() });
      get().refreshPapers();
    },

    refreshPapers: async () => set({ papers: await api.listPapers() }),

    openPaper: async (id) => {
      ws.connect();
      const bundle = await api.getPaper(id);
      set({
        route: { name: "reader", paperId: id },
        paper: bundle.paper,
        highlights: bundle.highlights,
        analyses: bundle.analyses,
        chat: bundle.chat,
        streams: {
          ...emptyStreams(),
          ondemand: Object.fromEntries(bundle.analyses.map((a) => [a.kind, a.content_md])),
        },
      });
      ws.send({ type: "subscribe", paperId: id });
      // 자동 STEP 1 (pending/없음일 때만, spec §0-5)
      if (!bundle.paper.analysis && bundle.paper.analysis_status !== "running") {
        ws.send({ type: "analyze_step1", paperId: id });
      }
    },

    sendChat: (text) => {
      const p = get().paper;
      if (!p || !text.trim()) return;
      set((s) => ({
        chat: [...s.chat, localUserMsg(p.id, text)],
        streams: { ...s.streams, chatDraft: "", busy: { ...s.streams.busy, chat: true } },
      }));
      ws.send({ type: "chat", paperId: p.id, text });
    },

    runOndemand: (kind, force) => {
      const p = get().paper;
      if (!p) return;
      set((s) => ({ streams: { ...s.streams, busy: { ...s.streams.busy, ondemand: true }, ondemandStatus: "분석 중…" } }));
      ws.send({ type: "analyze_ondemand", paperId: p.id, kind, force });
    },

    runSelection: (action, page, text) => {
      const p = get().paper;
      if (!p) return;
      set((s) => ({ streams: { ...s.streams, selection: { text: "", busy: true }, busy: { ...s.streams.busy, selection: true } } }));
      ws.send({ type: "selection_action", paperId: p.id, action, page, text });
    },

    addHighlight: (h) => set((s) => ({ highlights: [...s.highlights, h] })),
    removeHighlight: (hid) => set((s) => ({ highlights: s.highlights.filter((x) => x.id !== hid) })),
  };
});

function localUserMsg(paperId: string, content: string): ChatMessage {
  return { id: `local-${Date.now()}`, paper_id: paperId, role: "user", content, created_at: new Date().toISOString() };
}

function upsertAnalysis(list: AnalysisDoc[], paperId: string, kind: AnalysisKind, md: string): AnalysisDoc[] {
  const doc: AnalysisDoc = { id: `local-${kind}`, paper_id: paperId, kind, content_md: md, created_at: new Date().toISOString() };
  const idx = list.findIndex((a) => a.kind === kind);
  if (idx === -1) return [...list, doc];
  const copy = [...list];
  copy[idx] = doc;
  return copy;
}

export type { StepOneAnalysis };
