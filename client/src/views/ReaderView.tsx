// 리더 뷰 (spec §6.2). 좌 PDF / 우 탭(정보·챗·하이라이트) + 드래그토글 + 선택결과 팝오버.
import { useState } from "react";
import { useStore } from "../store/useStore";
import { api } from "../api/rest";
import PdfViewer, { type SelectionPayload } from "../components/PdfViewer";
import SelectionToggle from "../components/SelectionToggle";
import InfoPanel from "../components/InfoPanel";
import ChatPanel from "../components/ChatPanel";
import HighlightPanel from "../components/HighlightPanel";
import Markdown from "../components/Markdown";
import ModelSelector from "../components/ModelSelector";
import type { SelectionAction } from "../types";

type Tab = "info" | "chat" | "highlights";

export default function ReaderView() {
  const paper = useStore((s) => s.paper)!;
  const goLibrary = useStore((s) => s.goLibrary);
  const runSelection = useStore((s) => s.runSelection);
  const addHighlight = useStore((s) => s.addHighlight);
  const streams = useStore((s) => s.streams);

  const [tab, setTab] = useState<Tab>("info");
  const [sel, setSel] = useState<SelectionPayload | null>(null);
  const [jumpPage, setJumpPage] = useState(paper.last_page);
  const [chatPrefill, setChatPrefill] = useState<string | undefined>();
  const [showSelResult, setShowSelResult] = useState(false);

  function doLLM(action: SelectionAction) {
    if (!sel) return;
    runSelection(action, sel.page, sel.text);
    setShowSelResult(true);
    setSel(null);
  }

  async function doHighlight() {
    if (!sel) return;
    const hi = await api.addHighlight(paper.id, {
      page: sel.page,
      rects: sel.rects,
      selected_text: sel.text,
    });
    addHighlight(hi);
    setSel(null);
  }

  function doSendToChat() {
    if (!sel) return;
    setChatPrefill(`다음 발췌에 대해 질문합니다 (p.${sel.page}):\n"${sel.text}"\n\n`);
    setTab("chat");
    setSel(null);
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-2 border-b bg-white flex items-center gap-3">
        <button className="px-2 py-1 rounded hover:bg-slate-100 text-sm" onClick={goLibrary}>
          ← 라이브러리
        </button>
        <h2 className="font-semibold text-sm truncate flex-1">
          {paper.title || paper.original_name || "(제목 미정)"}
        </h2>
        <ModelSelector />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 좌: PDF */}
        <div className="w-1/2 border-r min-w-0">
          <PdfViewer
            url={api.pdfUrl(paper.id)}
            initialPage={jumpPage}
            highlights={useStore((s) => s.highlights)}
            onPageChange={(p) => api.setLastPage(paper.id, p)}
            onSelect={setSel}
          />
        </div>

        {/* 우: 탭 패널 */}
        <div className="w-1/2 flex flex-col min-w-0">
          <div className="flex border-b text-sm">
            {(["info", "chat", "highlights"] as Tab[]).map((t) => (
              <button
                key={t}
                className={`px-4 py-2 ${tab === t ? "border-b-2 border-blue-600 font-medium" : "text-slate-500"}`}
                onClick={() => setTab(t)}
              >
                {{ info: "정보", chat: "챗", highlights: "하이라이트" }[t]}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {tab === "info" && <InfoPanel />}
            {tab === "chat" && (
              <ChatPanel prefill={chatPrefill} onConsumePrefill={() => setChatPrefill(undefined)} />
            )}
            {tab === "highlights" && <HighlightPanel onJump={(p) => setJumpPage(p)} />}
          </div>
        </div>
      </div>

      {/* 드래그 토글 메뉴 */}
      {sel && (
        <SelectionToggle
          sel={sel}
          onAction={doLLM}
          onSendToChat={doSendToChat}
          onHighlight={doHighlight}
          onClose={() => setSel(null)}
        />
      )}

      {/* 선택 액션 결과 팝오버 (번역/설명/용어) */}
      {showSelResult && streams.selection && (
        <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[60vh] overflow-auto bg-white rounded-xl shadow-2xl border p-4">
          <div className="flex items-center mb-2">
            <span className="text-xs font-semibold text-slate-400">선택 분석</span>
            <button className="ml-auto text-slate-400 hover:text-slate-700" onClick={() => setShowSelResult(false)}>
              ✕
            </button>
          </div>
          {streams.selection.busy && !streams.selection.text ? (
            <span className="animate-pulse text-sm text-slate-500">처리 중…</span>
          ) : (
            <Markdown text={streams.selection.text} />
          )}
        </div>
      )}
    </div>
  );
}
