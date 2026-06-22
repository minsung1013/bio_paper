import { useEffect, useState } from "react";
import { useStore } from "./store/useStore";
import { api, type ClaudeStatus } from "./api/rest";
import { ws } from "./api/ws";
import LibraryView from "./views/LibraryView";
import ReaderView from "./views/ReaderView";

export default function App() {
  const route = useStore((s) => s.route);
  const refreshPapers = useStore((s) => s.refreshPapers);
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);

  useEffect(() => {
    ws.connect();
    api.claudeStatus().then(setClaude).catch(() => setClaude(null));
    refreshPapers();
  }, [refreshPapers]);

  // 온보딩 차단형 (spec §4.1, §9)
  if (claude && !claude.installed) {
    return <Onboarding status={claude} />;
  }

  return route.name === "library" ? <LibraryView /> : <ReaderView />;
}

function Onboarding({ status }: { status: ClaudeStatus }) {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50 p-8">
      <div className="max-w-xl bg-white rounded-xl shadow p-8 space-y-4">
        <h1 className="text-2xl font-bold">Claude Code 설치가 필요합니다</h1>
        <p className="text-slate-600">
          이 앱은 로컬에 설치된 Claude Code(Claude Agent SDK)로 논문을 분석합니다. API 키는 필요 없고
          Claude 구독(Pro/Max) 인증을 사용합니다.
        </p>
        <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-sm">
          {status.install_hint.command}
        </div>
        {status.install_hint.note && <p className="text-sm text-slate-500">{status.install_hint.note}</p>}
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          onClick={() => location.reload()}
        >
          설치 후 다시 확인
        </button>
      </div>
    </div>
  );
}
