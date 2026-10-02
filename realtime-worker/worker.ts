import { DurableObject } from "cloudflare:workers";
import { parseClientFrame, type RealtimePose, type ServerFrame } from "./protocol";

interface Env {
  ROOM: DurableObjectNamespace<RealtimeRoom>;
  ALLOWED_ORIGIN_SUFFIX?: string;
}

interface SocketState {
  playerId: string;
  nickname: string;
  sessionId: string;
  seq: number;
  pose?: RealtimePose;
}

const read = (request: Request, key: string) => new URL(request.url).searchParams.get(key)?.trim() ?? "";

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{1,96}$/.test(value);
}

function originAllowed(request: Request, suffix: string | undefined) {
  const origin = request.headers.get("origin");
  if (!origin || !suffix) return true;
  try {
    return new URL(origin).hostname.endsWith(suffix);
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "jiwoos-farm-realtime" });
    }
    if (url.pathname !== "/connect") return new Response("Not found", { status: 404 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    if (!originAllowed(request, env.ALLOWED_ORIGIN_SUFFIX)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    const roomId = read(request, "room");
    const playerId = read(request, "player");
    const nickname = read(request, "nick").slice(0, 20);
    const sessionId = read(request, "session");

    if (!validId(roomId) || !validId(playerId) || !validId(sessionId) || !nickname) {
      return new Response("Invalid realtime identity", { status: 400 });
    }

    const id = env.ROOM.idFromName(roomId);
    return env.ROOM.get(id).fetch(new Request("https://room.internal/connect", {
      headers: {
        upgrade: "websocket",
        "x-player-id": playerId,
        "x-nickname": encodeURIComponent(nickname),
        "x-session-id": sessionId,
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

    const frame = parseClientFrame(message);
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
    try { socket.close(code, reason); } catch {}
    if (state) this.broadcast({ t: "leave", playerId: state.playerId }, socket);
  }

  async webSocketError(socket: WebSocket) {
    const state = this.state(socket);
    try { socket.close(1011, "realtime error"); } catch {}
    if (state) this.broadcast({ t: "leave", playerId: state.playerId }, socket);
  }

  private state(socket: WebSocket): SocketState | null {
    try {
      const state = socket.deserializeAttachment() as SocketState | null;
      return state?.playerId ? state : null;
    } catch {
      return null;
    }
  }

  private currentStates(): SocketState[] {
    return this.ctx.getWebSockets().flatMap((socket) => {
      const state = this.state(socket);
      return state ? [state] : [];
    });
  }

  private send(socket: WebSocket, frame: ServerFrame) {
    try { socket.send(JSON.stringify(frame)); } catch {}
  }

  private broadcast(frame: ServerFrame, except?: WebSocket) {
    const raw = JSON.stringify(frame);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(raw); } catch {}
    }
  }
}
