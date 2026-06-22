// 설정 조회/변경 (모델 선택 등).
import type { FastifyInstance } from "fastify";
import { getSettings, setSettings, getModel } from "../settings.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async () => ({
    ...getSettings(),
    effectiveModel: getModel() ?? null, // null = Claude Code CLI 기본
    envOverride: !!(process.env.PAPER_READER_MODEL ?? "").trim(),
  }));

  app.put<{ Body: { model?: string } }>("/api/settings", async (req) => {
    const next = setSettings({ model: req.body?.model });
    return { ...next, effectiveModel: getModel() ?? null };
  });
}
