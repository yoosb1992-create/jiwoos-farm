import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { parseFamilyPose } from "@/game/family/personal";
import type { FamilyPose, FamilyPresence, FamilyPresenceSnapshot } from "@/game/family/types";
import { FamilyRooms } from "@/server/family/rooms";

export const dynamic = "force-dynamic";

interface AcceptedSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
}

interface PresenceConnection {
  socket: AcceptedSocket;
  playerId: string;
  nickname: string;
  pose?: FamilyPose;
  lastSeen: number;
}

type WebSocketPairConstructor = new () => { 0: WebSocket; 1: AcceptedSocket };

const rooms = new Map<string, Set<PresenceConnection>>();
const SESSION_RE = /^[a-f0-9-]{36}$/;
const MAX_FRAME_BYTES = 2048;

const response = (message: string, status: number) =>
  Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

const snapshotFor = (connections: Set<PresenceConnection>, now = Date.now()): FamilyPresenceSnapshot => {
  const latest = new Map<string, FamilyPresence>();
  for (const connection of connections) {
    if (!connection.pose) continue;
    const current = latest.get(connection.playerId);
    if (!current || connection.lastSeen >= current.lastSeen) {
      latest.set(connection.playerId, {
        ...connection.pose,
        playerId: connection.playerId,
        nickname: connection.nickname,
        lastSeen: connection.lastSeen,
      });
    }
  }
  return { players: [...latest.values()], serverNow: now };
};

const broadcast = (roomId: string) => {
  const connections = rooms.get(roomId);
  if (!connections?.size) return;
  const frame = JSON.stringify(snapshotFor(connections));
  for (const connection of [...connections]) {
    try {
      connection.socket.send(frame);
    } catch {
      connections.delete(connection);
    }
  }
  if (!connections.size) rooms.delete(roomId);
};

/**
 * Low-latency room broker for Family presence.
 *
 * This intentionally carries transient pose frames only. D1 stays authoritative
 * for membership and persistent game state, and FamilyClient keeps a D1
 * heartbeat as a fallback. The in-process room table is a fast path for the
 * current Sites worker; a future Durable Object binding can replace this broker
 * without changing the browser transport contract.
 */
export async function GET(request: Request) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return response("WebSocket 연결이 필요합니다.", 426);
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return response("다른 사이트의 연결은 허용하지 않습니다.", 403);

  const user = await getChatGPTUser();
  if (!user) return response("ChatGPT 로그인이 필요합니다.", 401);
  if (!env.DB) return response("가족 농장 DB가 준비되지 않았습니다.", 503);

  const roomId = url.searchParams.get("roomId") ?? "";
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!SESSION_RE.test(sessionId)) return response("접속 세션이 올바르지 않습니다.", 400);

  let member;
  try {
    member = await new FamilyRooms(env.DB.withSession("first-primary")).requireMember(user.userId, roomId);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && Number.isInteger((error as { status?: unknown }).status)
      ? Number((error as { status: number }).status)
      : 403;
    return response(error instanceof Error ? error.message : "이 가족 농장에 접속할 수 없습니다.", status);
  }

  const Pair = (globalThis as typeof globalThis & { WebSocketPair?: WebSocketPairConstructor }).WebSocketPair;
  if (!Pair) return response("실시간 연결을 사용할 수 없습니다. 기본 동기화로 계속합니다.", 503);

  const pair = new Pair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const connection: PresenceConnection = {
    socket: server,
    playerId: member.playerId,
    nickname: member.nickname,
    lastSeen: Date.now(),
  };
  const room = rooms.get(roomId) ?? new Set<PresenceConnection>();
  room.add(connection);
  rooms.set(roomId, room);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    room.delete(connection);
    if (!room.size) rooms.delete(roomId);
    else broadcast(roomId);
  };

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string" || event.data.length > MAX_FRAME_BYTES) {
      server.close(1009, "presence frame too large");
      cleanup();
      return;
    }
    try {
      const frame = JSON.parse(event.data) as {
        type?: unknown;
        roomId?: unknown;
        sessionId?: unknown;
        pose?: unknown;
      };
      if (frame.type !== "presence" || frame.roomId !== roomId || frame.sessionId !== sessionId) return;
      const pose = parseFamilyPose(frame.pose);
      if (!pose) return;
      connection.pose = pose;
      connection.lastSeen = Date.now();
      broadcast(roomId);
    } catch {
      // Malformed movement frames are ignored. Persistent actions never travel
      // through this channel.
    }
  });
  server.addEventListener("close", cleanup);
  server.addEventListener("error", cleanup);

  return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
}
