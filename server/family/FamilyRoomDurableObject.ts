import { DurableObject } from "cloudflare:workers";
import type { FamilyPresenceSnapshot } from "../../game/family/types";
import {
  FAMILY_REALTIME_MAX_FRAME_BYTES,
  type FamilyRealtimeConnectionState,
  familyRealtimeSnapshot,
  parseFamilyRealtimeFrame,
} from "./realtimeProtocol";

const header = (request: Request, name: string) => request.headers.get(name) ?? "";

const validConnection = (state: Partial<FamilyRealtimeConnectionState>): state is FamilyRealtimeConnectionState =>
  typeof state.roomId === "string" && state.roomId.length > 0 &&
  typeof state.sessionId === "string" && state.sessionId.length > 0 &&
  typeof state.playerId === "string" && state.playerId.length > 0 &&
  typeof state.nickname === "string" && state.nickname.length > 0 &&
  Number.isFinite(state.lastSeen);

const attachment = (socket: WebSocket): FamilyRealtimeConnectionState | null => {
  try {
    const value = socket.deserializeAttachment() as Partial<FamilyRealtimeConnectionState> | null;
    return value && validConnection(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * Room-scoped realtime authority.
 *
 * One Durable Object instance is addressed by Family room ID. Hibernation
 * WebSockets keep connections alive while allowing the object to sleep.
 * Per-connection pose metadata is stored in WebSocket attachments so the room
 * can reconstruct its snapshot after hibernation without a separate database.
 *
 * Persistent gameplay state remains D1-authoritative; this object carries only
 * transient presence/movement frames.
 */
export class FamilyRoomDurableObject extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ message: "WebSocket 연결이 필요합니다." }, { status: 426 });
    }

    const state: FamilyRealtimeConnectionState = {
      roomId: header(request, "x-family-room-id"),
      sessionId: header(request, "x-family-session-id"),
      playerId: header(request, "x-family-player-id"),
      nickname: decodeURIComponent(header(request, "x-family-nickname")),
      lastSeen: Date.now(),
    };
    if (!validConnection(state)) {
      return Response.json({ message: "실시간 접속 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [state.playerId]);
    server.serializeAttachment(state);

    // Give the joining client the room's current view immediately. No pose is
    // published for the new client until its first validated frame arrives.
    this.sendSnapshot(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const current = attachment(socket);
    if (!current) {
      socket.close(1008, "missing family room attachment");
      return;
    }
    if (typeof message !== "string") {
      socket.close(1003, "text presence frames only");
      return;
    }
    if (message.length > FAMILY_REALTIME_MAX_FRAME_BYTES) {
      socket.close(1009, "presence frame too large");
      return;
    }

    const pose = parseFamilyRealtimeFrame(message, current.roomId, current.sessionId);
    if (!pose) return;

    const next: FamilyRealtimeConnectionState = {
      ...current,
      pose,
      lastSeen: Date.now(),
    };
    socket.serializeAttachment(next);
    this.broadcast();
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    try { socket.close(code, reason); } catch { /* runtime may already have replied */ }
    this.broadcast();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try { socket.close(1011, "family realtime error"); } catch { /* already closed */ }
    this.broadcast();
  }

  private currentSnapshot(): FamilyPresenceSnapshot {
    const states: FamilyRealtimeConnectionState[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      const state = attachment(socket);
      if (state) states.push(state);
    }
    return familyRealtimeSnapshot(states);
  }

  private sendSnapshot(socket: WebSocket) {
    try { socket.send(JSON.stringify(this.currentSnapshot())); } catch { /* client may have left */ }
  }

  private broadcast() {
    const frame = JSON.stringify(this.currentSnapshot());
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(frame); } catch { /* stale sockets are discarded by runtime */ }
    }
  }
}
