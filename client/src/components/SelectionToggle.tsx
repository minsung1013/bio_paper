// 드래그 토글 메뉴 (spec §7). 선택 영역 근처 플로팅. 1~4 LLM, 5 채팅전송, 6 하이라이트.
import type { SelectionAction } from "../types";
import type { SelectionPayload } from "./PdfViewer";

interface Props {
  sel: SelectionPayload;
  onAction: (a: SelectionAction) => void;
  onSendToChat: () => void;
  onHighlight: () => void;
  onClose: () => void;
}

const LLM_ACTIONS: { key: SelectionAction; label: string }[] = [
  { key: "translate", label: "번역" },
  { key: "explain_simple", label: "쉽게 설명" },
  { key: "explain_deep", label: "깊게 설명" },
  { key: "define_term", label: "용어 정의" },
];

export default function SelectionToggle({ sel, onAction, onSendToChat, onHighlight, onClose }: Props) {
  return (
    <div
      className="fixed z-50 bg-slate-900 text-white rounded-lg shadow-xl flex items-center text-sm overflow-hidden"
      style={{ left: Math.min(sel.clientX, window.innerWidth - 360), top: sel.clientY + 6 }}
      onMouseDown={(e) => e.preventDefault()} // 선택 해제 방지
    >
      {LLM_ACTIONS.map((a) => (
        <button key={a.key} className="px-3 py-2 hover:bg-slate-700" onClick={() => onAction(a.key)}>
          {a.label}
        </button>
      ))}
      <button className="px-3 py-2 hover:bg-slate-700 border-l border-slate-700" onClick={onSendToChat}>
        채팅으로
      </button>
      <button className="px-3 py-2 hover:bg-yellow-600 border-l border-slate-700" onClick={onHighlight}>
        하이라이트
      </button>
      <button className="px-2 py-2 hover:bg-slate-700 text-slate-400" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
