import { env } from "cloudflare:workers";
import { familyBody, familyRequest } from "@/server/family/http";
import { FamilyError, FamilyRooms } from "@/server/family/rooms";
import { issueDedicatedRealtimeToken } from "@/realtime-worker/auth";

export const dynamic = "force-dynamic";

const realtimeSocketUrl = (base: string, token: string) => {
  let url: URL;
  try { url = new URL(base); } catch { throw new FamilyError(503, "전용 실시간 서버 주소가 올바르지 않습니다."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FamilyError(503, "전용 실시간 서버 주소가 올바르지 않습니다.");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/connect";
  url.search = "";
  url.searchParams.set("token", token);
  return url.toString();
};

export const POST = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request);
  const roomId = String(body.roomId ?? "");
  const sessionId = String(body.sessionId ?? "");
  if (!/^[a-f0-9-]{36}$/.test(sessionId)) throw new FamilyError(400, "접속 세션이 올바르지 않습니다.");
  const baseUrl = env.FAMILY_REALTIME_URL;
  const secret = env.FAMILY_REALTIME_SECRET;
  if (!baseUrl || !secret) throw new FamilyError(503, "전용 멀티 서버가 아직 연결되지 않았습니다.");

  const member = await new FamilyRooms(db).requireMember(userId, roomId);
  const expiresAt = Date.now() + 60_000;
  const token = await issueDedicatedRealtimeToken(secret, {
    roomId,
    playerId: member.playerId,
    nickname: member.nickname,
    sessionId,
    exp: expiresAt,
  });
  return { socketUrl: realtimeSocketUrl(baseUrl, token), expiresAt };
});
