import { publishedWorldMaps } from "@/server/world/preset";
import { FamilyState } from "@/server/family/state";
import { familyBody, familyRequest } from "@/server/family/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => familyRequest(request, async (db, userId) => new FamilyState(db, undefined, await publishedWorldMaps(db)).read(userId, new URL(request.url).searchParams.get("roomId") ?? ""));
export const POST = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request);
  return new FamilyState(db, undefined, await publishedWorldMaps(db)).act(userId, String(body.roomId ?? ""), body.expectedRevision, body.action);
});
