import { DurableObject } from "cloudflare:workers";
import { verifyDedicatedRealtimeToken } from "./auth";
import { parseDedicatedClientFrame, type DedicatedRealtimePose, type DedicatedServerFrame } from "../game/family/dedicatedProtocol";

interface Env {
  ROOM: DurableObjectNamespace<RealtimeRoom>;
  AUTH_SECRET: string;
  ALLOWED_ORIGIN_SUFFIX?: string;
}

interface SocketState {
  playerId: string;
  nickname: string;
  sessionId: string;
  seq: number;
  pose?: DedicatedRealtimePose;
}

function originAllowed(request: Request, suffix: string | undefined) {
  const origin = request.headers.get("origin");
  if (!origin || !suffix) return true;
  try { return new URL(origin).hostname.endsWith(suffix); }
  catch { return false; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "jiwoos-farm-realtime", version: 1 });
    }
    if (url.pathname !== "/connect") return new Response("Not found", { status: 404 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    if (!originAllowed(request, env.ALLOWED_ORIGIN_SUFFIX)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    if (!env.AUTH_SECRET) return new Response("Realtime auth unavailable", { status: 503 });

    const token = url.searchParams.get("token") ?? "";
    const claims = await verifyDedicatedRealtimeToken(env.AUTH_SECRET, token);
    if (!claims) return new Response("Invalid or expired realtime token", { status: 401 });

    const id = env.ROOM.idFromName(claims.roomId);
    return env.ROOM.get(id).fetch(new Request("https://room.internal/connect", {
      headers: {
        upgrade: "websocket",
        "x-player-id": claims.playerId,
        "x-nickname": encodeURIComponent(claims.nickname),
        "x-session-id": claims.sessionId,
      },
    }));
  },
};

export class RealtimeRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const playerId = request.headers.get("x-player-id") ?? "";
    const nickname = decodeURIComponent(request.headers.get("x-nickname") ?? "");
    const sessionId = request.headers.get("x-session-id") ?? "";
    if (!playerId || !nickname || !sessionId) return new Response("Invalid connection", { status: 400 });

    for (const existing of this.ctx.getWebSockets(playerId)) {
      const state = this.state(existing);
      if (state?.sessionId === sessionId) continue;
      try { existing.close(4001, "new family session connected"); } catch { /* already gone */ }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const state: SocketState = { playerId, nickname, sessionId, seq: -1 };
    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment(state);

    const peers = this.currentStates()
      .filter((peer) => peer.playerId !== playerId)
      .map((peer) => ({
        playerId: peer.playerId,
        nickname: peer.nickname,
        pose: peer.pose,
        seq: peer.seq,
      }));

    this.send(server, { t: "hello", playerId, peers });
    this.broadcast({ t: "join", playerId, nickname }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const state = this.state(socket);
    if (!state) return;
    const frame = parseDedicatedClientFrame(message);
    if (!frame) return;

    if (frame.t === "ping") {
      this.send(socket, { t: "pong", clientTime: frame.clientTime, serverTime: Date.now() });
      return;
    }
    if (frame.seq <= state.seq) return;

    const next: SocketState = { ...state, seq: frame.seq, pose: frame.pose };
    socket.serializeAttachment(next);
    this.broadcast({
      t: "pose",
      playerId: next.playerId,
      nickname: next.nickname,
      seq: next.seq,
      serverTime: Date.now(),
      pose: frame.pose,
    }, socket);
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const state = this.state(socket);
    try { socket.close(code, reason); } catch { /* runtime may already have closed */ }
    if (state) this.broadcast({ t: "leave", playerId: state.playerId }, socket);
  }

  async webSocketError(socket: WebSocket) {
    const state = this.state(socket);
    try { socket.close(1011, "realtime error"); } catch { /* already closed */ }
    if (state) this.broadcast({ t: "leave", playerId: state.playerId }, socket);
  }

  private state(socket: WebSocket): SocketState | null {
    try {
      const state = socket.deserializeAttachment() as SocketState | null;
      return state?.playerId ? state : null;
    } catch { return null; }
  }

  private currentStates(): SocketState[] {
    const latest = new Map<string, SocketState>();
    for (const socket of this.ctx.getWebSockets()) {
      const state = this.state(socket);
      if (!state) continue;
      const current = latest.get(state.playerId);
      if (!current || state.seq >= current.seq) latest.set(state.playerId, state);
    }
    return [...latest.values()];
  }

  private send(socket: WebSocket, frame: DedicatedServerFrame) {
    try { socket.send(JSON.stringify(frame)); } catch { /* transient socket */ }
  }

  private broadcast(frame: DedicatedServerFrame, except?: WebSocket) {
    const raw = JSON.stringify(frame);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(raw); } catch { /* transient socket */ }
    }
  }
}
