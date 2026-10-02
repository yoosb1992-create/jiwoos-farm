import { DurableObject } from "cloudflare:workers";
import type { FamilyPresenceSnapshot } from "../../game/family/types";
import {
  FAMILY_REALTIME_MAX_FRAME_BYTES,
  FAMILY_REALTIME_PLAYER_RE,
  FAMILY_REALTIME_SIGNAL_MAX_FRAME_BYTES,
  type FamilyRealtimeConnectionState,
  familyRealtimeSnapshot,
  parseFamilyRealtimeFrame,
  parseFamilyRealtimeSignalFrame,
  parseFamilyRtcSignalValue,
  type FamilyRtcSignal,
} from "./realtimeProtocol";

const header = (request: Request, name: string) => request.headers.get(name) ?? "";
const REALTIME_TICKET_TTL_MS = 30_000;
const RTC_SIGNAL_TTL_MS = 30_000;
const RTC_SIGNAL_QUEUE_LIMIT = 64;

interface FamilyRealtimeTicket {
  token: string;
  expiresAt: number;
  state: FamilyRealtimeConnectionState;
}
interface StoredRtcSignal {
  fromPlayerId: string;
  fromNickname: string;
  signal: FamilyRtcSignal;
  expiresAt: number;
}

const ticketKey = (sessionId: string) => `realtime-ticket:${sessionId}`;
const rtcSignalKey = (playerId: string) => `rtc-signals:${playerId}`;

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
    const url = new URL(request.url);
    if (url.pathname === "/rtc/signal" && request.method === "POST") {
      const fromPlayerId = header(request, "x-family-player-id");
      const fromNickname = decodeURIComponent(header(request, "x-family-nickname"));
      let body: unknown;
      try { body = await request.json(); } catch { body = null; }
      const targetPlayerId = body && typeof body === "object" ? (body as { targetPlayerId?: unknown }).targetPlayerId : undefined;
      const signal = body && typeof body === "object" ? parseFamilyRtcSignalValue((body as { signal?: unknown }).signal) : null;
      if (!FAMILY_REALTIME_PLAYER_RE.test(fromPlayerId) || typeof fromNickname !== "string" || !fromNickname ||
          typeof targetPlayerId !== "string" || !FAMILY_REALTIME_PLAYER_RE.test(targetPlayerId) || !signal) {
        return Response.json({ message: "WebRTC 연결 정보가 올바르지 않습니다." }, { status: 400 });
      }
      const key = rtcSignalKey(targetPlayerId);
      const now = Date.now();
      const queue = (await this.ctx.storage.get<StoredRtcSignal[]>(key) ?? [])
        .filter((entry) => entry.expiresAt >= now)
        .slice(-(RTC_SIGNAL_QUEUE_LIMIT - 1));
      queue.push({ fromPlayerId, fromNickname, signal, expiresAt: now + RTC_SIGNAL_TTL_MS });
      await this.ctx.storage.put(key, queue);
      return Response.json({ queued: true }, { headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/rtc/poll" && request.method === "GET") {
      const playerId = header(request, "x-family-player-id");
      if (!FAMILY_REALTIME_PLAYER_RE.test(playerId)) {
        return Response.json({ message: "WebRTC 참가자 정보가 올바르지 않습니다." }, { status: 400 });
      }
      const key = rtcSignalKey(playerId);
      const now = Date.now();
      const queue = (await this.ctx.storage.get<StoredRtcSignal[]>(key) ?? []).filter((entry) => entry.expiresAt >= now);
      await this.ctx.storage.delete(key);
      return Response.json({
        signals: queue.map(({ expiresAt: _expiresAt, ...entry }) => ({ type: "signal", ...entry })),
      }, { headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/ticket" && request.method === "POST") {
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
      const token = crypto.randomUUID();
      const ticket: FamilyRealtimeTicket = { token, expiresAt: Date.now() + REALTIME_TICKET_TTL_MS, state };
      await this.ctx.storage.put(ticketKey(state.sessionId), ticket);
      return Response.json({ ticket: token, expiresAt: ticket.expiresAt }, { headers: { "cache-control": "no-store" } });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ message: "WebSocket 연결이 필요합니다." }, { status: 426 });
    }

    const sessionId = header(request, "x-family-session-id");
    const token = header(request, "x-family-realtime-ticket");
    let state: FamilyRealtimeConnectionState | null = null;
    if (sessionId && token) {
      const key = ticketKey(sessionId);
      const ticket = await this.ctx.storage.get<FamilyRealtimeTicket>(key);
      await this.ctx.storage.delete(key);
      if (ticket && ticket.token === token && ticket.expiresAt >= Date.now() && ticket.state.sessionId === sessionId) {
        state = { ...ticket.state, lastSeen: Date.now() };
      }
    } else {
      const legacy: FamilyRealtimeConnectionState = {
        roomId: header(request, "x-family-room-id"),
        sessionId,
        playerId: header(request, "x-family-player-id"),
        nickname: decodeURIComponent(header(request, "x-family-nickname")),
        lastSeen: Date.now(),
      };
      if (validConnection(legacy)) state = legacy;
    }
    if (!state || !validConnection(state)) {
      return Response.json({ message: "실시간 접속 티켓이 만료되었거나 올바르지 않습니다." }, { status: 401 });
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
    if (message.length > FAMILY_REALTIME_SIGNAL_MAX_FRAME_BYTES) {
      socket.close(1009, "realtime frame too large");
      return;
    }

    const signal = parseFamilyRealtimeSignalFrame(message, current.roomId, current.sessionId);
    if (signal) {
      if (signal.targetPlayerId === current.playerId) return;
      const relay = JSON.stringify({
        type: "signal",
        fromPlayerId: current.playerId,
        fromNickname: current.nickname,
        signal: signal.signal,
      });
      for (const target of this.ctx.getWebSockets(signal.targetPlayerId)) {
        if (target === socket) continue;
        try { target.send(relay); } catch { /* stale peer socket */ }
      }
      return;
    }

    if (message.length > FAMILY_REALTIME_MAX_FRAME_BYTES) return;
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
