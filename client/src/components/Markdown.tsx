// 의존성 없는 초경량 마크다운 렌더(헤더/볼드/리스트/코드 정도). 스트리밍 출력 표시용.
export default function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="prose-sm leading-relaxed text-slate-800 space-y-1">
      {lines.map((ln, i) => {
        if (/^#{1,6}\s/.test(ln)) {
          const level = ln.match(/^#+/)![0].length;
          const content = ln.replace(/^#+\s/, "");
          const cls = level <= 2 ? "text-base font-bold mt-3" : "text-sm font-semibold mt-2";
          return (
            <p key={i} className={cls}>
              {inline(content)}
            </p>
          );
        }
        if (/^[-*]\s/.test(ln)) {
          return (
            <p key={i} className="pl-4 relative">
              <span className="absolute left-0">•</span>
              {inline(ln.replace(/^[-*]\s/, ""))}
            </p>
          );
        }
        if (ln.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{inline(ln)}</p>;
      })}
    </div>
  );
}

function inline(s: string) {
  // **bold** 만 간단 처리
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}
