// 서버 부트스트랩 (spec §1, §2). Fastify + multipart + websocket.
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, ensureDirs } from "./config.js";
import "./db/schema.js"; // DDL 초기화
import { paperRoutes } from "./routes/papers.js";
import { highlightRoutes } from "./routes/highlights.js";
import { registerWs } from "./ws/hub.js";

async function main(): Promise<void> {
  ensureDirs();
  const app = Fastify({ logger: { level: "info" }, bodyLimit: 100 * 1024 * 1024 });

  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  await app.register(websocket);

  // 개발 중 클라(Vite 5173) → 서버(5174) CORS 허용
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") reply.send();
  });

  await app.register(paperRoutes);
  await app.register(highlightRoutes);
  await app.register(registerWs);

  app.get("/api/health", async () => ({ ok: true, config }));

  // 프로덕션: 빌드된 클라이언트(client/dist) 정적 호스팅 + SPA 폴백.
  // 개발 시에는 Vite(5173) 가 /api·/ws 를 이쪽으로 프록시하므로 dist 가 없어도 무방.
  const here = dirname(fileURLToPath(import.meta.url));
  // here = repo/server/dist/server/src → 4단계 위가 repo 루트
  const clientDist = join(here, "..", "..", "..", "..", "client", "dist");
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api") || req.raw.url?.startsWith("/ws")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html"); // SPA 폴백
    });
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Paper Reader server on http://${config.host}:${config.port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
