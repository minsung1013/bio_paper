// 좌측 PDF 뷰어 (spec §6.2). pdfjs-dist 로 canvas 렌더 + 텍스트레이어(드래그선택) + 하이라이트 오버레이.
import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Highlight, NormalizedRect } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface SelectionPayload {
  page: number;
  text: string;
  rects: NormalizedRect[]; // PDF 정규화 좌표(0~1)
  clientX: number;
  clientY: number;
}

interface Props {
  url: string;
  initialPage: number;
  highlights: Highlight[];
  onPageChange: (page: number) => void;
  onSelect: (s: SelectionPayload | null) => void;
}

export default function PdfViewer({ url, initialPage, highlights, onPageChange, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.3);
  const [size, setSize] = useState({ w: 0, h: 0 }); // 현재 렌더 픽셀 크기

  // 문서 로드
  useEffect(() => {
    let cancelled = false;
    const task = pdfjsLib.getDocument(url);
    task.promise.then((doc) => {
      if (cancelled) return;
      docRef.current = doc;
      setNumPages(doc.numPages);
      setPage(Math.min(Math.max(1, initialPage), doc.numPages));
    });
    return () => {
      cancelled = true;
      task.destroy();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url, initialPage]);

  // 페이지 렌더(canvas + text layer)
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || page < 1) return;
    let cancelled = false;

    (async () => {
      const pg = await doc.getPage(page);
      if (cancelled) return;
      const viewport = pg.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setSize({ w: viewport.width, h: viewport.height });

      await pg.render({ canvasContext: ctx, viewport }).promise;
      if (cancelled) return;

      // 텍스트 레이어 (드래그 선택용)
      const tl = textLayerRef.current!;
      tl.innerHTML = "";
      tl.style.width = `${viewport.width}px`;
      tl.style.height = `${viewport.height}px`;
      const textLayer = new (pdfjsLib as any).TextLayer({
        textContentSource: pg.streamTextContent(),
        container: tl,
        viewport,
      });
      await textLayer.render();
    })();

    return () => {
      cancelled = true;
    };
  }, [page, scale, numPages]);

  // 선택 캡처 → 정규화 rects (spec §7)
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      onSelect(null);
      return;
    }
    const wrap = pageWrapRef.current!;
    const base = wrap.getBoundingClientRect();
    const range = sel.getRangeAt(0);
    const rectList = Array.from(range.getClientRects());
    if (rectList.length === 0) return;
    const rects: NormalizedRect[] = rectList.map((r) => ({
      x: (r.left - base.left) / base.width,
      y: (r.top - base.top) / base.height,
      w: r.width / base.width,
      h: r.height / base.height,
    }));
    const last = rectList[rectList.length - 1];
    onSelect({
      page,
      text: sel.toString(),
      rects,
      clientX: last.right,
      clientY: last.bottom,
    });
  }, [page, onSelect]);

  function go(p: number) {
    const np = Math.min(Math.max(1, p), numPages || 1);
    setPage(np);
    onPageChange(np);
    onSelect(null);
  }

  const pageHi = highlights.filter((h) => h.page === page);

  return (
    <div className="h-full flex flex-col bg-slate-200">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b text-sm">
        <button className="px-2 py-1 rounded hover:bg-slate-100" onClick={() => go(page - 1)}>◀</button>
        <span>
          {page} / {numPages || "…"}
        </span>
        <button className="px-2 py-1 rounded hover:bg-slate-100" onClick={() => go(page + 1)}>▶</button>
        <span className="mx-2 text-slate-300">|</span>
        <button className="px-2 py-1 rounded hover:bg-slate-100" onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}>−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button className="px-2 py-1 rounded hover:bg-slate-100" onClick={() => setScale((s) => Math.min(3, s + 0.15))}>+</button>
      </div>

      <div className="flex-1 overflow-auto flex justify-center p-4">
        <div
          ref={pageWrapRef}
          className="relative shadow-lg"
          style={{ width: size.w, height: size.h }}
          onMouseUp={handleMouseUp}
        >
          <canvas ref={canvasRef} className="block" />
          <div ref={textLayerRef} className="textLayer" />
          {/* 하이라이트 오버레이 (정규화 좌표 → 현재 픽셀, 줌 무관 복원) */}
          {pageHi.map((h) =>
            h.rects.map((r, i) => (
              <div
                key={`${h.id}-${i}`}
                className="absolute pointer-events-none"
                style={{
                  left: r.x * size.w,
                  top: r.y * size.h,
                  width: r.w * size.w,
                  height: r.h * size.h,
                  background: colorOf(h.color),
                  mixBlendMode: "multiply",
                }}
                title={h.note ?? ""}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function colorOf(c: string): string {
  const map: Record<string, string> = {
    yellow: "rgba(250,204,21,0.45)",
    green: "rgba(74,222,128,0.45)",
    blue: "rgba(96,165,250,0.45)",
    pink: "rgba(244,114,182,0.45)",
  };
  return map[c] ?? map.yellow;
}
