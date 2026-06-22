// 모델 선택 드롭다운 (토큰 절약용). 설정은 서버에 영속되고 새 턴부터 적용.
import { useEffect, useState } from "react";
import { api } from "../api/rest";

// 별칭 사용(버전 변동에 강함). 빈 값 = CLI 기본.
const OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "기본 (CLI 설정)" },
  { value: "sonnet", label: "Sonnet (빠름·절약)" },
  { value: "opus", label: "Opus (고품질)" },
  { value: "haiku", label: "Haiku (최저비용)" },
];

export default function ModelSelector() {
  const [model, setModel] = useState<string>("");
  const [effective, setEffective] = useState<string | null>(null);
  const [envLocked, setEnvLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setModel(s.model ?? "");
      setEffective(s.effectiveModel);
      setEnvLocked(!!s.envOverride);
    }).catch(() => {});
  }, []);

  async function change(v: string) {
    setSaving(true);
    setModel(v);
    try {
      const s = await api.setModel(v);
      setEffective(s.effectiveModel);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500" title={effective ? `실제 모델: ${effective}` : "Claude Code CLI 기본 모델"}>
      <span>모델</span>
      <select
        className="border rounded px-2 py-1 text-xs bg-white disabled:opacity-50"
        value={model}
        disabled={saving || envLocked}
        onChange={(e) => change(e.target.value)}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {envLocked && <span className="text-amber-600">env 고정</span>}
    </div>
  );
}
