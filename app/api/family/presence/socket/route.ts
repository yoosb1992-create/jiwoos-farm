import { env } from "cloudflare:workers";
import { getAppUser } from "@/app/auth";
import { FamilyRooms } from "@/server/family/rooms";
import { FAMILY_REALTIME_SESSION_RE } from "@/server/family/realtimeProtocol";

export const dynamic = "force-dynamic";

const response = (message: string, status: number) =>
  Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

const durableRoomResponse = async (
  roomId: string,
  sessionId: string,
  member: { playerId: string; nickname: string },
) => {
  if (!env.FAMILY_ROOM) {
    return response("가족농장 실시간 서버가 배포되지 않았습니다.", 503);
  }
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
 * D1 verifies membership, then every connection for the same Family room is
 * handed to the same FAMILY_ROOM Durable Object. There is intentionally no
 * isolate-local WebSocket fallback: production movement must have one shared
 * room authority or report realtime as unavailable.
 */
export async function GET(request: Request) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return response("WebSocket 연결이 필요합니다.", 426);
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return response("다른 사이트의 연결은 허용하지 않습니다.", 403);

  const user = await getAppUser();
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

  return durableRoomResponse(roomId, sessionId, member);
}
