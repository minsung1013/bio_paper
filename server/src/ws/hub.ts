// WebSocket 허브 (spec §통신규약, §4.3, §7). 메시지 타입으로 멀티플렉싱.
// 분석/챗/선택액션을 세션 매니저(직렬화)에 위임하고 결과를 스트리밍.
import type { FastifyInstance } from "fastify";
import type { WsClientMessage, WsServerMessage } from "../../../shared/types.js";
import { runStep1, runOnDemand, runChat, runSelection } from "../claude/analyze.js";
import { cancel } from "../claude/sessionManager.js";

type Socket = { send: (data: string) => void; readyState: number };

// paperId → 구독 소켓들 (같은 논문 여러 탭/창 브로드캐스트)
const subs = new Map<string, Set<Socket>>();

function broadcast(paperId: string, msg: WsServerMessage): void {
  const set = subs.get(paperId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const s of set) {
    if (s.readyState === 1) s.send(data);
  }
}

export async function registerWs(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, (conn) => {
    // @fastify/websocket v11: conn 이 곧 소켓.
    const socket = (conn as any).socket ?? conn;
    const mine = new Set<string>();

    socket.on("message", async (raw: Buffer) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const emit = (m: WsServerMessage) => broadcast(m.paperId, m);

      try {
        switch (msg.type) {
          case "subscribe": {
            mine.add(msg.paperId);
            let set = subs.get(msg.paperId);
            if (!set) subs.set(msg.paperId, (set = new Set()));
            set.add(socket);
            break;
          }
          case "analyze_step1":
            await runStep1(msg.paperId, emit);
            break;
          case "analyze_ondemand":
            await runOnDemand(msg.paperId, msg.kind, !!msg.force, emit);
            break;
          case "chat":
            await runChat(msg.paperId, msg.text, emit);
            break;
          case "selection_action":
            await runSelection(msg.paperId, msg.action, msg.page, msg.text, emit);
            break;
          case "cancel":
            await cancel(msg.paperId);
            break;
        }
      } catch (e: any) {
        emit({
          type: "error",
          paperId: (msg as any).paperId ?? "",
          channel: "chat",
          message: e?.message ?? String(e),
        });
      }
    });

    socket.on("close", () => {
      for (const pid of mine) subs.get(pid)?.delete(socket);
    });
  });
}
