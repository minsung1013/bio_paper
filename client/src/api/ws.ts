// WebSocket 클라이언트 (spec §통신규약, §9 자동 재연결).
import type { WsClientMessage, WsServerMessage } from "../types";

type Handler = (m: WsServerMessage) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: WsClientMessage[] = [];
  private reconnectTimer: number | null = null;
  private subscribed = new Set<string>();

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
      return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);

    this.ws.onopen = () => {
      // 재연결 시 구독 복구 (spec §9)
      for (const pid of this.subscribed) this.rawSend({ type: "subscribe", paperId: pid });
      const q = this.queue;
      this.queue = [];
      for (const m of q) this.rawSend(m);
    };
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data) as WsServerMessage;
        for (const h of this.handlers) h(m);
      } catch {
        /* ignore */
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.reconnectTimer == null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1500);
      }
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private rawSend(m: WsClientMessage): void {
    this.ws?.send(JSON.stringify(m));
  }

  send(m: WsClientMessage): void {
    if (m.type === "subscribe") this.subscribed.add(m.paperId);
    if (this.ws?.readyState === WebSocket.OPEN) this.rawSend(m);
    else {
      this.queue.push(m);
      this.connect();
    }
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
}

export const ws = new WsClient();
