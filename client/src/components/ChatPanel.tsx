// 챗 탭 (spec §6.2, §4.3C). 멀티턴 스트리밍 + 미러. 선택 인용 프리필 지원(§7-5).
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import Markdown from "./Markdown";

export default function ChatPanel({ prefill, onConsumePrefill }: { prefill?: string; onConsumePrefill?: () => void }) {
  const chat = useStore((s) => s.chat);
  const streams = useStore((s) => s.streams);
  const sendChat = useStore((s) => s.sendChat);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefill) {
      setText((t) => (t ? t : prefill));
      onConsumePrefill?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, streams.chatDraft]);

  function submit() {
    if (!text.trim()) return;
    sendChat(text);
    setText("");
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {chat.map((m) => (
          <Bubble key={m.id} role={m.role}>
            {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
          </Bubble>
        ))}
        {streams.busy.chat && (
          <Bubble role="assistant">
            {streams.chatDraft ? <Markdown text={streams.chatDraft} /> : <span className="animate-pulse">…</span>}
          </Bubble>
        )}
        {streams.error.chat && <div className="text-red-600 text-sm">{streams.error.chat}</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t p-2 flex gap-2">
        <textarea
          className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none"
          rows={2}
          placeholder="이 논문에 대해 질문하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="px-4 bg-blue-600 text-white rounded-lg text-sm" onClick={submit}>
          전송
        </button>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
