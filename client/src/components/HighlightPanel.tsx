// 하이라이트 탭 (spec §6.2). 페이지순 목록, 클릭 점프, 메모 편집/삭제.
import { useState } from "react";
import { useStore } from "../store/useStore";
import { api } from "../api/rest";

export default function HighlightPanel({ onJump }: { onJump: (page: number) => void }) {
  const highlights = useStore((s) => s.highlights);
  const removeHighlight = useStore((s) => s.removeHighlight);
  const [editing, setEditing] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  if (highlights.length === 0) {
    return <div className="p-4 text-sm text-slate-400">아직 하이라이트가 없습니다. PDF에서 텍스트를 선택해 저장하세요.</div>;
  }

  return (
    <div className="p-3 space-y-2 overflow-auto">
      {highlights.map((h) => (
        <div key={h.id} className="border rounded-lg p-3 bg-white">
          <div className="flex items-start gap-2">
            <button
              className="text-xs px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 shrink-0"
              onClick={() => onJump(h.page)}
            >
              p.{h.page}
            </button>
            <p className="text-sm flex-1">{h.selected_text}</p>
            <button className="text-slate-400 hover:text-red-500 text-xs" onClick={async () => {
              await api.deleteHighlight(h.id);
              removeHighlight(h.id);
            }}>
              삭제
            </button>
          </div>

          {editing === h.id ? (
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="메모"
              />
              <button
                className="text-xs px-2 bg-blue-600 text-white rounded"
                onClick={async () => {
                  await api.updateHighlight(h.id, { note: noteDraft });
                  h.note = noteDraft;
                  setEditing(null);
                }}
              >
                저장
              </button>
            </div>
          ) : (
            <button
              className="mt-1 text-xs text-slate-500 hover:text-slate-800"
              onClick={() => {
                setEditing(h.id);
                setNoteDraft(h.note ?? "");
              }}
            >
              {h.note ? `📝 ${h.note}` : "+ 메모 추가"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
