import { strict as assert } from "node:assert";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { familyTestDB } from "./family-db";
const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db);
  const a = await rooms.create("user-a", "우리 가족", "지우");
  assert.match(a.room.inviteCode, /^[A-HJ-NP-Z2-9]{8}$/);
  const b = await rooms.join("user-b", a.room.inviteCode.toLowerCase(), "아빠");
  assert.equal(a.room.id, b.room.id); assert.equal(b.members.length, 2);
  assert.notEqual(a.room.playerId, b.room.playerId);
  const again = await rooms.join("user-b", a.room.inviteCode, "아빠2");
  assert.equal(again.room.playerId, b.room.playerId); assert.equal(again.members.length, 2);
  assert.equal((await rooms.list("user-b"))[0].id, a.room.id);
  assert.equal((await rooms.list("outsider")).length, 0);
  await assert.rejects(rooms.detail("outsider", a.room.id), (e: unknown) => e instanceof FamilyError && e.status === 403);
  await assert.rejects(rooms.join("user-b", "BAD", "아빠"));
  await assert.rejects(rooms.create("user-a", "", "지우"));
  assert.ok(!JSON.stringify(b).includes("user-a"), "account IDs must not be exposed");
  console.log("Family rooms: create, invite, join, recent rooms, membership isolation passed");
} finally { close(); }
