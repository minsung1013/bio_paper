// 라이브러리 뷰(홈) — 목록 + 드래그앤드롭 추가 + 검색 (spec §6.1).
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useStore } from "../store/useStore";
import type { Paper } from "../types";
import AddPaperDropzone from "../components/AddPaperDropzone";
import ModelSelector from "../components/ModelSelector";

const col = createColumnHelper<Paper>();
const STATUS_LABEL: Record<string, string> = { pending: "대기", running: "분석 중", done: "완료", error: "오류" };

export default function LibraryView() {
  const papers = useStore((s) => s.papers);
  const openPaper = useStore((s) => s.openPaper);
  const [filter, setFilter] = useState("");

  const columns = useMemo(
    () => [
      col.accessor("title", {
        header: "제목",
        cell: (c) => c.getValue() || c.row.original.original_name || "(제목 미정)",
      }),
      col.accessor((r) => r.authors.join(", "), { id: "authors", header: "저자" }),
      col.accessor((r) => [r.journal, r.year].filter(Boolean).join(" · "), { id: "jy", header: "저널·연도" }),
      col.accessor("added_at", { header: "추가일", cell: (c) => c.getValue().slice(0, 10) }),
      col.accessor("analysis_status", {
        header: "상태",
        cell: (c) => {
          const v = c.getValue();
          const cls =
            v === "done" ? "bg-green-100 text-green-700"
            : v === "running" ? "bg-amber-100 text-amber-700"
            : v === "error" ? "bg-red-100 text-red-700"
            : "bg-slate-100 text-slate-600";
          return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{STATUS_LABEL[v]}</span>;
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: papers,
    columns,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <header className="px-6 py-4 border-b bg-white flex items-center gap-4">
        <h1 className="text-xl font-bold">📚 Paper Reader</h1>
        <div className="ml-auto flex items-center gap-4">
          <ModelSelector />
          <input
            className="px-3 py-1.5 border rounded-lg text-sm w-72"
            placeholder="제목·저자·연도 검색"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </header>

      <div className="p-6 space-y-4 overflow-auto">
        <AddPaperDropzone />

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-2 font-medium">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t hover:bg-blue-50 cursor-pointer"
                  onClick={() => openPaper(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {papers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    아직 논문이 없습니다. 위에 PDF를 끌어다 놓으세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
