import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { FamilyPose } from "@/game/family/types";
import { FamilyRooms } from "@/server/family/rooms";
import {
  FAMILY_REALTIME_MAX_FRAME_BYTES,
  FAMILY_REALTIME_SESSION_RE,
  type FamilyRealtimeConnectionState,
  familyRealtimeSnapshot,
  parseFamilyRealtimeFrame,
} from "@/server/family/realtimeProtocol";

export const dynamic = "force-dynamic";

interface AcceptedSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
}

interface InProcessConnection extends FamilyRealtimeConnectionState {
  socket: AcceptedSocket;
}

type WebSocketPairConstructor = new () => { 0: WebSocket; 1: AcceptedSocket };

const rooms = new Map<string, Set<InProcessConnection>>();

const response = (message: string, status: number) =>
  Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

const inProcessSnapshot = (connections: Set<InProcessConnection>) =>
  familyRealtimeSnapshot([...connections].map(({ socket: _socket, ...state }) => state));

const inProcessBroadcast = (roomId: string) => {
  const connections = rooms.get(roomId);
  if (!connections?.size) return;
  const frame = JSON.stringify(inProcessSnapshot(connections));
  for (const connection of [...connections]) {
    try {
      connection.socket.send(frame);
    } catch {
      connections.delete(connection);
    }
  }
  if (!connections.size) rooms.delete(roomId);
};

const durableRoomResponse = async (
  roomId: string,
  sessionId: string,
  member: { playerId: string; nickname: string },
) => {
  if (!env.FAMILY_ROOM) return null;
  const id = env.FAMILY_ROOM.idFromName(roomId);
  const stub = env.FAMILY_ROOM.get(id);
  const headers = new Headers({
    upgrade: "websocket",
    "x-family-room-id": roomId,
    "x-family-session-id": sessionId,
    "x-family-player-id": member.playerId,
    "x-family-nickname": encodeURIComponent(member.nickname),
  });
  return stub.fetch(new Request("https://family-room.internal/connect", { headers }));
};

/**
 * Authenticated WebSocket entrance for Family presence.
 *
 * The preferred path is one Durable Object per Family room. D1 verifies room
 * membership before the socket is handed to the room authority. When the
 * hosting project has not provisioned FAMILY_ROOM yet, the in-process broker
 * remains as a compatibility fast path and D1 presence polling remains the
 * final safety fallback.
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
  if (!FAMILY_REALTIME_SESSION_RE.test(sessionId)) return response("접속 세션이 올바르지 않습니다.", 400);

  let member;
  try {
    member = await new FamilyRooms(env.DB.withSession("first-primary")).requireMember(user.userId, roomId);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && Number.isInteger((error as { status?: unknown }).status)
      ? Number((error as { status: number }).status)
      : 403;
    return response(error instanceof Error ? error.message : "이 가족 농장에 접속할 수 없습니다.", status);
  }

  const durable = await durableRoomResponse(roomId, sessionId, member);
  if (durable) return durable;

  const Pair = (globalThis as typeof globalThis & { WebSocketPair?: WebSocketPairConstructor }).WebSocketPair;
  if (!Pair) return response("실시간 연결을 사용할 수 없습니다. 기본 동기화로 계속합니다.", 503);

  const pair = new Pair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const connection: InProcessConnection = {
    socket: server,
    roomId,
    sessionId,
    playerId: member.playerId,
    nickname: member.nickname,
    lastSeen: Date.now(),
  };
  const room = rooms.get(roomId) ?? new Set<InProcessConnection>();
  room.add(connection);
  rooms.set(roomId, room);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    room.delete(connection);
    if (!room.size) rooms.delete(roomId);
    else inProcessBroadcast(roomId);
  };

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string" || event.data.length > FAMILY_REALTIME_MAX_FRAME_BYTES) {
      server.close(1009, "presence frame too large");
      cleanup();
      return;
    }
    const pose: FamilyPose | null = parseFamilyRealtimeFrame(event.data, roomId, sessionId);
    if (!pose) return;
    connection.pose = pose;
    connection.lastSeen = Date.now();
    inProcessBroadcast(roomId);
  });
  server.addEventListener("close", cleanup);
  server.addEventListener("error", cleanup);

  return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
}
