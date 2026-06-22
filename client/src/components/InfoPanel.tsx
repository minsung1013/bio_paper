// 정보 탭 — STEP1 카드들 + 온디맨드 STEP2/3/4 버튼·섹션 (spec §6.2, §5).
import { useState } from "react";
import { useStore } from "../store/useStore";
import { ws } from "../api/ws";
import type { AnalysisKind, PaperType } from "../types";
import Markdown from "./Markdown";

const ONDEMAND: { kind: AnalysisKind; label: string }[] = [
  { kind: "critique", label: "비판적 분석 (STEP 2)" },
  { kind: "trends", label: "최신 동향 비교 (STEP 3, 웹검색)" },
  { kind: "implications", label: "시사점·BD 함의 (STEP 4)" },
];

export default function InfoPanel() {
  const paper = useStore((s) => s.paper)!;
  const streams = useStore((s) => s.streams);
  const a = paper.analysis;

  if (!a) {
    return (
      <div className="p-4 text-sm text-slate-500">
        {streams.error.step1 ? (
          <div className="text-red-600">
            STEP 1 실패: {streams.error.step1}
            <button
              className="ml-2 px-2 py-1 bg-slate-800 text-white rounded text-xs"
              onClick={() => retryStep1(paper.id)}
            >
              재분석
            </button>
          </div>
        ) : (
          <Skeleton status={streams.step1Status || "STEP 1 분석 준비 중…"} />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 overflow-auto">
      <Card title="📌 TL;DR">
        <p className="font-medium">{a.tldr}</p>
        <TypeBadge t={a.paper_type} />
      </Card>

      <Card title="기본 정보">
        <KV k="제목" v={a.basic.title} />
        <KV k="저널/연도" v={[a.basic.journal, a.basic.year].filter(Boolean).join(" · ")} />
        <KV k="IF" v={a.basic.impact_factor} />
        <KV k="저자" v={a.basic.authors.join(", ")} />
        <KV k="소속" v={a.basic.affiliations.join(", ")} />
        <KV k="협력유형" v={a.basic.collab_type} />
      </Card>

      <Card title="🎯 연구 목적">
        <KV k="핵심 문제" v={a.objective.core_problem} />
        <KV k="차별점" v={a.objective.differentiation} />
      </Card>

      {a.paper_type !== "review" && (
        <Card title="🔬 방법론">
          <KV k="아키텍처" v={a.methods.architecture} />
          <KV k="학습 전략" v={a.methods.learning_strategy} />
          <KV k="평가 지표" v={a.methods.metrics.join(", ")} />
          {a.methods.datasets.length > 0 && (
            <div className="mt-1">
              <div className="text-xs text-slate-500 mb-1">데이터셋</div>
              {a.methods.datasets.map((d, i) => (
                <div key={i} className="text-sm pl-2 border-l-2 border-slate-200 mb-1">
                  <b>{d.name}</b> — {d.size}, {d.split}
                  {d.public != null && ` · ${d.public ? "공개" : "비공개"}`}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="📊 주요 결과">
        {a.results.quantitative.map((q, i) => (
          <p key={i} className="text-sm pl-3 relative">
            <span className="absolute left-0">•</span>
            {q}
          </p>
        ))}
        <KV k="베이스라인 대비" v={a.results.vs_baseline} />
        <KV k="검증 수준" v={a.results.validation_level} />
      </Card>

      <Card title="💬 결론·한계">
        <Bullets title="기여" items={a.conclusion.contributions} />
        <Bullets title="저자 인정 한계" items={a.conclusion.authors_limitations} />
      </Card>

      {/* 온디맨드 STEP 2/3/4 */}
      <div className="space-y-2 pt-2">
        {ONDEMAND.map(({ kind, label }) => (
          <OnDemandSection key={kind} kind={kind} label={label} />
        ))}
      </div>
    </div>
  );
}

function retryStep1(paperId: string) {
  // store 를 우회하지 않고 WS 로 직접 재요청
  ws.send({ type: "analyze_step1", paperId });
}

function OnDemandSection({ kind, label }: { kind: AnalysisKind; label: string }) {
  const streams = useStore((s) => s.streams);
  const runOndemand = useStore((s) => s.runOndemand);
  const [open, setOpen] = useState(true);
  const md = streams.ondemand[kind];
  const busy = streams.busy.ondemand;

  return (
    <div className="border rounded-lg">
      <div className="flex items-center px-3 py-2 bg-slate-50">
        <button className="font-medium text-sm flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} {label}
        </button>
        {md ? (
          <button className="text-xs px-2 py-1 text-blue-600" onClick={() => runOndemand(kind, true)}>
            다시 분석
          </button>
        ) : (
          <button
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={busy}
            onClick={() => runOndemand(kind)}
          >
            분석
          </button>
        )}
      </div>
      {open && (md || streams.error.ondemand) && (
        <div className="px-3 py-2 text-sm">
          {streams.error.ondemand && !md ? (
            <span className="text-red-600">{streams.error.ondemand}</span>
          ) : (
            <Markdown text={md ?? ""} />
          )}
        </div>
      )}
    </div>
  );
}

// ── 소품 ──
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-3">
      <div className="text-xs font-semibold text-slate-400 mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string | number | null | undefined }) {
  const empty = v === null || v === undefined || v === "";
  return (
    <div className="text-sm flex gap-2">
      <span className="text-slate-400 shrink-0 w-24">{k}</span>
      <span className={empty ? "text-slate-300" : ""}>{empty ? "해당 없음" : v}</span>
    </div>
  );
}
function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{title}</div>
      {items.length === 0 ? (
        <span className="text-slate-300 text-sm">해당 없음</span>
      ) : (
        items.map((it, i) => (
          <p key={i} className="text-sm pl-3 relative">
            <span className="absolute left-0">•</span>
            {it}
          </p>
        ))
      )}
    </div>
  );
}
function TypeBadge({ t }: { t: PaperType }) {
  const label = { ml_method: "ML 방법론", experimental: "실험", review: "리뷰" }[t];
  return <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{label}</span>;
}
function Skeleton({ status }: { status: string }) {
  return (
    <div className="space-y-3">
      <p className="text-blue-600 text-sm animate-pulse">{status}</p>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}
