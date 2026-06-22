// client·server 공용 타입. (spec §3 데이터모델, §5 STEP1 스키마, §통신규약)
// client 는 이 파일을 src/types 로 동기화/재노출해서 쓴다.

export type PaperType = "ml_method" | "experimental" | "review";
export type AnalysisStatus = "pending" | "running" | "done" | "error";
export type AnalysisKind = "critique" | "trends" | "implications"; // STEP 2/3/4

// ── STEP 1 구조화 결과 (spec §5) ──────────────────────────────
export interface StepOneAnalysis {
  tldr: string;
  paper_type: PaperType;
  basic: {
    title: string;
    journal: string | null;
    year: number | null;
    impact_factor: string | null;
    authors: string[];
    affiliations: string[];
    collab_type: "academic" | "pharma" | "startup" | "mixed" | "unknown";
  };
  objective: {
    core_problem: string;
    differentiation: string;
  };
  methods: {
    architecture: string;
    learning_strategy: string;
    datasets: Array<{
      name: string;
      size: string;
      split: string;
      public: boolean | null;
    }>;
    metrics: string[];
  };
  results: {
    quantitative: string[];
    vs_baseline: string;
    validation_level: "none" | "in_vitro" | "in_vivo" | "clinical";
  };
  conclusion: {
    contributions: string[];
    authors_limitations: string[];
  };
}

// ── DB 레코드 ────────────────────────────────────────────────
export interface Paper {
  id: string;
  content_hash: string;
  title: string | null;
  authors: string[];
  journal: string | null;
  year: number | null;
  original_name: string | null;
  page_count: number | null;
  paper_type: PaperType | null;
  analysis: StepOneAnalysis | null;
  analysis_status: AnalysisStatus;
  last_page: number;
  added_at: string;
  last_opened_at: string | null;
}

export interface Highlight {
  id: string;
  paper_id: string;
  page: number;
  rects: NormalizedRect[]; // PDF 좌표(정규화 0~1), 줌 무관 복원
  selected_text: string;
  color: string;
  note: string | null;
  created_at: string;
}

// PDF 좌표계로 정규화한 박스(페이지 폭/높이 대비 0~1). spec 사소보완 항목.
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnalysisDoc {
  id: string;
  paper_id: string;
  kind: AnalysisKind;
  content_md: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  paper_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ── WebSocket 프로토콜 (메시지 타입 멀티플렉싱, spec §통신규약) ──
// client → server
export type WsClientMessage =
  | { type: "subscribe"; paperId: string }
  | { type: "analyze_step1"; paperId: string }
  | { type: "analyze_ondemand"; paperId: string; kind: AnalysisKind; force?: boolean }
  | { type: "chat"; paperId: string; text: string }
  | { type: "selection_action"; paperId: string; action: SelectionAction; page: number; text: string }
  | { type: "cancel"; paperId: string };

export type SelectionAction = "translate" | "explain_simple" | "explain_deep" | "define_term";

// server → client (스트리밍)
export type WsServerMessage =
  | { type: "status"; paperId: string; channel: StreamChannel; text: string }
  | { type: "delta"; paperId: string; channel: StreamChannel; text: string }
  | { type: "step1_done"; paperId: string; analysis: StepOneAnalysis }
  | { type: "ondemand_done"; paperId: string; kind: AnalysisKind; content_md: string }
  | { type: "chat_done"; paperId: string; message: ChatMessage }
  | { type: "selection_done"; paperId: string; action: SelectionAction; text: string }
  | { type: "error"; paperId: string; channel: StreamChannel; message: string; code?: string };

// 어떤 인터페이스의 스트림인지 (UI 라우팅용)
export type StreamChannel = "step1" | "chat" | "ondemand" | "selection";
