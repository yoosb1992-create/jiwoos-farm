import { FamilyRooms } from "@/server/family/rooms";
import { familyBody, familyRequest } from "@/server/family/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => familyRequest(request, async (db, userId) => {
  const rooms = new FamilyRooms(db), roomId = new URL(request.url).searchParams.get("roomId");
  return roomId ? rooms.detail(userId, roomId) : { rooms: await rooms.list(userId) };
});
export const POST = (request: Request) => familyRequest(request, async (db, userId) => {
  const body = await familyBody(request), rooms = new FamilyRooms(db);
  return body.action === "join" ? rooms.join(userId, body.code, body.nickname) : rooms.create(userId, body.name, body.nickname);
});
