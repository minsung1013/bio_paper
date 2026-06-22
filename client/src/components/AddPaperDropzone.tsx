// PDF 드래그앤드롭/선택 추가 (spec §6.1). 중복이면 기존 오픈, 신규면 리더 진입.
import { useRef, useState } from "react";
import { api } from "../api/rest";
import { useStore } from "../store/useStore";

export default function AddPaperDropzone() {
  const openPaper = useStore((s) => s.openPaper);
  const refreshPapers = useStore((s) => s.refreshPapers);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      let lastId: string | null = null;
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith(".pdf")) continue;
        const { paper } = await api.addPaper(f);
        lastId = paper.id;
      }
      await refreshPapers();
      if (lastId) await openPaper(lastId); // 추가 후 리더 진입 + 자동 분석
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
        over ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-slate-500">
        {busy ? "추가 중…" : "PDF를 끌어다 놓거나 클릭해서 선택 — 해시로 중복을 판정하고 자동 분석을 시작합니다"}
      </p>
    </div>
  );
}
