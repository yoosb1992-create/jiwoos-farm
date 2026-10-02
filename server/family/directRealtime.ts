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

  if (!env.FAMILY_ROOM) return response("가족농장 실시간 서버가 배포되지 않았습니다.", 503);

  const roomId = url.searchParams.get("roomId") ?? "";
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const ticket = url.searchParams.get("ticket") ?? "";
  if (!FAMILY_REALTIME_SESSION_RE.test(sessionId) || !ticket || ticket.length > 128) {
    return response("실시간 접속 티켓이 올바르지 않습니다.", 401);
  }

  const id = env.FAMILY_ROOM.idFromName(roomId);
  const stub = env.FAMILY_ROOM.get(id);
  const headers = new Headers({
    upgrade: "websocket",
    "x-family-session-id": sessionId,
    "x-family-realtime-ticket": ticket,
  });
  return stub.fetch(new Request("https://family-room.internal/connect", { headers }));
}
