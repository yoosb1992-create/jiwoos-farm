import { env } from "cloudflare:workers";
import { familyBody, familyRequest } from "@/server/family/http";
import { FamilyError, FamilyRooms } from "@/server/family/rooms";
import { FAMILY_REALTIME_PLAYER_RE, parseFamilyRtcSignalValue } from "@/server/family/realtimeProtocol";

export const dynamic = "force-dynamic";

const roomStub = (roomId: string) => {
  if (!env.FAMILY_ROOM) throw new FamilyError(503, "가족농장 실시간 서버가 배포되지 않았습니다.");
  return env.FAMILY_ROOM.get(env.FAMILY_ROOM.idFromName(roomId));
};

export const GET = (request: Request) => familyRequest(request, async (db, userId) => {
  const roomId = new URL(request.url).searchParams.get("roomId") ?? "";
  const member = await new FamilyRooms(db).requireMember(userId, roomId);
  const response = await roomStub(roomId).fetch(new Request("https://family-room.internal/rtc/poll", {
    headers: { "x-family-player-id": member.playerId },
  }));
  const payload = await response.json() as { signals?: unknown[]; message?: string };
  if (!response.ok) throw new FamilyError(response.status || 503, payload.message ?? "WebRTC 연결 정보를 받을 수 없습니다.");
  return { signals: Array.isArray(payload.signals) ? payload.signals : [] };
});

export const POST = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request);
  const roomId = String(body.roomId ?? "");
  const targetPlayerId = String(body.targetPlayerId ?? "");
  const signal = parseFamilyRtcSignalValue(body.signal);
  const member = await new FamilyRooms(db).requireMember(userId, roomId);
  if (!FAMILY_REALTIME_PLAYER_RE.test(targetPlayerId) || !signal) {
    throw new FamilyError(400, "WebRTC 연결 정보가 올바르지 않습니다.");
  }
  const target = await db.prepare("SELECT player_id AS playerId FROM family_members WHERE room_id = ? AND player_id = ?")
    .bind(roomId, targetPlayerId).first<{ playerId: string }>();
  if (!target) throw new FamilyError(404, "연결할 가족 참가자를 찾을 수 없습니다.");

  const response = await roomStub(roomId).fetch(new Request("https://family-room.internal/rtc/signal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-family-player-id": member.playerId,
      "x-family-nickname": encodeURIComponent(member.nickname),
    },
    body: JSON.stringify({ targetPlayerId, signal }),
  }));
  const payload = await response.json() as { queued?: boolean; message?: string };
  if (!response.ok) throw new FamilyError(response.status || 503, payload.message ?? "WebRTC 연결 정보를 보낼 수 없습니다.");
  return { queued: payload.queued === true };
});
