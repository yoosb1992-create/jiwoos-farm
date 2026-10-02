import { env } from "cloudflare:workers";
import { familyBody, familyRequest } from "@/server/family/http";
import { FamilyError, FamilyRooms } from "@/server/family/rooms";
import { FAMILY_REALTIME_SESSION_RE } from "@/server/family/realtimeProtocol";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request);
  const roomId = String(body.roomId ?? "");
  const sessionId = String(body.sessionId ?? "");
  if (!FAMILY_REALTIME_SESSION_RE.test(sessionId)) throw new FamilyError(400, "접속 세션이 올바르지 않습니다.");
  if (!env.FAMILY_ROOM) throw new FamilyError(503, "가족농장 실시간 서버가 배포되지 않았습니다.");

  const member = await new FamilyRooms(db).requireMember(userId, roomId);
  const id = env.FAMILY_ROOM.idFromName(roomId);
  const stub = env.FAMILY_ROOM.get(id);
  const headers = new Headers({
    "x-family-room-id": roomId,
    "x-family-session-id": sessionId,
    "x-family-player-id": member.playerId,
    "x-family-nickname": encodeURIComponent(member.nickname),
  });
  const issued = await stub.fetch(new Request("https://family-room.internal/ticket", { method: "POST", headers }));
  const payload = await issued.json() as { ticket?: string; expiresAt?: number; message?: string };
  if (!issued.ok || typeof payload.ticket !== "string") {
    throw new FamilyError(issued.status || 503, payload.message ?? "실시간 접속 티켓을 만들 수 없습니다.");
  }
  return { ticket: payload.ticket, expiresAt: payload.expiresAt };
});
