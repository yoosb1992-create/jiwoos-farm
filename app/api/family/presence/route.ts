import { FamilyPresenceService } from "@/server/family/presence";
import { familyBody, familyRequest } from "@/server/family/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => familyRequest(request, (db, userId) => new FamilyPresenceService(db).read(userId, new URL(request.url).searchParams.get("roomId") ?? ""));
export const POST = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request);
  return new FamilyPresenceService(db).heartbeat(userId, String(body.roomId ?? ""), body.pose, body.sessionId);
});
export const DELETE = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request);
  return new FamilyPresenceService(db).leave(userId, String(body.roomId ?? ""), body.sessionId);
});
