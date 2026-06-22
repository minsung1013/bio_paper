// 라이브러리 CRUD + PDF 추가/서빙 (spec §1, §6.1).
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import * as Q from "../db/queries.js";
import { sha256, storePdf, estimatePageCount } from "../library/storage.js";
import { detectClaude } from "../claude/detect.js";

export async function paperRoutes(app: FastifyInstance): Promise<void> {
  // Claude 설치·인증 상태 (온보딩, spec §4.1)
  app.get("/api/claude-status", async () => detectClaude());

  // 목록
  app.get("/api/papers", async () => Q.listPapers());

  // 단건 + 부가데이터
  app.get<{ Params: { id: string } }>("/api/papers/:id", async (req, reply) => {
    const p = Q.getPaper(req.params.id);
    if (!p) return reply.code(404).send({ error: "not found" });
    Q.touchOpened(p.id);
    return {
      paper: p,
      highlights: Q.listHighlights(p.id),
      analyses: Q.getAnalyses(p.id),
      chat: Q.listChat(p.id),
    };
  });

  // PDF 바이너리 서빙 (좌측 뷰어용)
  app.get<{ Params: { id: string } }>("/api/papers/:id/pdf", async (req, reply) => {
    const fp = Q.getPaperFilePath(req.params.id);
    if (!fp) return reply.code(404).send({ error: "not found" });
    reply.header("Content-Type", "application/pdf");
    return reply.send(createReadStream(fp));
  });

  // PDF 추가(드래그앤드롭) — multipart. 해시 → 중복판정 → 사본 → papers 레코드.
  app.post("/api/papers", async (req, reply) => {
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no file" });
    const buf = await file.toBuffer();
    const hash = sha256(buf);

    const existing = Q.findPaperByHash(hash);
    if (existing) {
      // 중복이면 기존 항목 오픈 (spec §6.1)
      return reply.send({ paper: Q.getPaper(existing.id), duplicate: true });
    }
    const filePath = storePdf(buf, hash);
    const paper = Q.insertPaper({
      contentHash: hash,
      filePath,
      originalName: file.filename ?? "untitled.pdf",
      pageCount: estimatePageCount(buf),
    });
    return reply.send({ paper, duplicate: false });
  });

  // 읽던 위치 저장 (spec §6.2)
  app.put<{ Params: { id: string }; Body: { last_page: number } }>(
    "/api/papers/:id/last-page",
    async (req, reply) => {
      const page = Number(req.body?.last_page);
      if (!Number.isFinite(page) || page < 1) return reply.code(400).send({ error: "bad page" });
      Q.setLastPage(req.params.id, page);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/papers/:id", async (req) => {
    Q.deletePaper(req.params.id);
    return { ok: true };
  });
}
