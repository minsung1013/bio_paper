// 하이라이트 CRUD (spec §6.2 하이라이트 탭, §7-6). LLM 호출 없음.
import type { FastifyInstance } from "fastify";
import * as Q from "../db/queries.js";
import type { NormalizedRect } from "../../../shared/types.js";

export async function highlightRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/papers/:id/highlights", async (req) =>
    Q.listHighlights(req.params.id),
  );

  app.post<{
    Params: { id: string };
    Body: { page: number; rects: NormalizedRect[]; selected_text: string; color?: string; note?: string };
  }>("/api/papers/:id/highlights", async (req, reply) => {
    const b = req.body;
    if (!b?.selected_text || !Array.isArray(b.rects)) return reply.code(400).send({ error: "bad body" });
    const hi = Q.insertHighlight({
      paperId: req.params.id,
      page: Number(b.page) || 1,
      rects: b.rects,
      selectedText: b.selected_text,
      color: b.color,
      note: b.note ?? null,
    });
    return hi;
  });

  app.patch<{ Params: { hid: string }; Body: { note?: string; color?: string } }>(
    "/api/highlights/:hid",
    async (req) => {
      Q.updateHighlight(req.params.hid, req.body ?? {});
      return { ok: true };
    },
  );

  app.delete<{ Params: { hid: string } }>("/api/highlights/:hid", async (req) => {
    Q.deleteHighlight(req.params.hid);
    return { ok: true };
  });
}
