import { FamilyRooms } from "./rooms";
import { FAMILY_REALTIME_SESSION_RE } from "./realtimeProtocol";

export const DIRECT_FAMILY_REALTIME_PATH = "/family/realtime";

const response = (message: string, status: number) =>
  Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

/**
 * Raw Worker WebSocket entrance used only for transient Family movement.
 * It deliberately bypasses the vinext/Next route pipeline so movement frames
 * go browser -> Worker -> room Durable Object without an application route hop.
 */
export async function handleDirectFamilyRealtime(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return response("WebSocket 연결이 필요합니다.", 426);
  }

  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return response("다른 사이트의 연결은 허용하지 않습니다.", 403);
  }

  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return response("ChatGPT 로그인이 필요합니다.", 401);
  if (!env.DB) return response("가족 농장 DB가 준비되지 않았습니다.", 503);
  if (!env.FAMILY_ROOM) return response("가족농장 실시간 서버가 배포되지 않았습니다.", 503);

  const roomId = url.searchParams.get("roomId") ?? "";
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!FAMILY_REALTIME_SESSION_RE.test(sessionId)) {
    return response("접속 세션이 올바르지 않습니다.", 400);
  }

  let member;
  try {
    member = await new FamilyRooms(env.DB.withSession("first-primary")).requireMember(userId, roomId);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error &&
      Number.isInteger((error as { status?: unknown }).status)
      ? Number((error as { status: number }).status)
      : 403;
    return response(error instanceof Error ? error.message : "이 가족 농장에 접속할 수 없습니다.", status);
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
}
