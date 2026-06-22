// Claude Code 설치·인증 탐지 (spec §4.1, §9). 미설치 시 온보딩 안내.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

export interface ClaudeStatus {
  installed: boolean;
  version: string | null;
  // OS별 설치 안내(spec §4.1)
  install_hint: { platform: NodeJS.Platform; command: string; note?: string };
}

export async function detectClaude(): Promise<ClaudeStatus> {
  const platform = process.platform;
  const install_hint =
    platform === "win32"
      ? {
          platform,
          command: "irm https://claude.ai/install.ps1 | iex",
          note: "PowerShell에서 실행. WSL 불필요. Git Bash에서는 실행 금지(raw mode 미지원).",
        }
      : {
          platform,
          command: "curl -fsSL https://claude.ai/install.sh | bash",
          note: "또는 Homebrew. 인증은 Claude 구독(Pro/Max) OAuth 로 처리됨 — API 키 불필요.",
        };

  try {
    const { stdout } = await pexec("claude", ["--version"], { timeout: 10_000 });
    const version = stdout.trim() || null;
    return { installed: true, version, install_hint };
  } catch {
    return { installed: false, version: null, install_hint };
  }
}
