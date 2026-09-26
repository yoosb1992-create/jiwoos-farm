import { strict as assert } from "node:assert";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyPresenceService } from "../../server/family/presence";
import { familyTestDB } from "./family-db";
import { FAMILY_PRESENCE_TTL_MS, interpolateFamilyPosition, visibleFamilyPlayers } from "../family/presence";
import { RemotePlayers } from "../family/RemotePlayers";
import type { FamilyPose } from "../family/types";
const { db, close } = familyTestDB();
try {
  let now = 100000;
  const rooms = new FamilyRooms(db, () => now), presence = new FamilyPresenceService(db, () => now);
  const a = await rooms.create("A", "함께", "지우"), b = await rooms.join("B", a.room.inviteCode, "아빠");
  const pose: FamilyPose = { mapId: "farm", x: 200, y: 300, facing: "left", moving: true, selectedTool: "hoe" };
  const sessionA = crypto.randomUUID(), sessionB = crypto.randomUUID();
  await presence.heartbeat("A", a.room.id, pose, sessionA);
  const snapshot = await presence.heartbeat("B", a.room.id, { ...pose, x: 220, playerId: "spoof" }, sessionB);
  assert.equal(snapshot.players.length, 2); assert.ok(!JSON.stringify(snapshot).includes("spoof"));
  assert.equal(visibleFamilyPlayers(snapshot, a.room.playerId, "farm")[0].playerId, b.room.playerId);
  assert.equal(visibleFamilyPlayers(snapshot, b.room.playerId, "farm")[0].playerId, a.room.playerId);
  assert.equal(visibleFamilyPlayers(snapshot, a.room.playerId, "town").length, 0);
  await assert.rejects(presence.read("outsider", a.room.id));
  await assert.rejects(presence.heartbeat("outsider", a.room.id, pose, sessionA));
  await assert.rejects(presence.heartbeat("A", a.room.id, { ...pose, x: -1 }, sessionA));
  await presence.leave("B", a.room.id, crypto.randomUUID());
  assert.equal((await presence.read("A", a.room.id)).players.length, 2, "stale tab leave must not remove new session");
  await presence.leave("B", a.room.id, sessionB); assert.equal((await presence.read("A", a.room.id)).players.length, 1);
  now += FAMILY_PRESENCE_TTL_MS + 1; assert.equal((await presence.read("A", a.room.id)).players.length, 0);
  const midway = interpolateFamilyPosition({ x: 0, y: 0 }, { x: 100, y: 100 }, 100); assert.ok(midway.x > 0 && midway.x < 100);
  // Exercise the actual renderer via its narrow Scene.add surface; physics access would fail.
  let sprites = 0, destroyed = 0; const labels: string[] = [], animations: string[] = [];
  // Chainable sprite and label doubles.
  const makeNode = () => {
    const target: any = { x: 0, y: 0 };
    const proxy: any = new Proxy(target, { get: (t, key) => key in t ? t[key] : (...args: any[]) => {
      if (key === "setPosition") { t.x = args[0]; t.y = args[1]; }
      if (key === "setText") labels.push(args[0]); if (key === "play") animations.push(args[0]); if (key === "destroy") destroyed++;
      return proxy;
    } }); return proxy;
  };
  const renderer = new RemotePlayers({ add: { sprite: () => { sprites++; return makeNode(); }, text: makeNode } } as never, a.room.playerId);
  renderer.receive(snapshot); renderer.update("farm", 16);
  assert.equal(sprites, 1); assert.ok(labels.some((s) => s.includes("아빠") && s.includes("←"))); assert.ok(animations.includes("walk_left"));
  renderer.update("town", 16); assert.equal(destroyed, 2);
  renderer.destroy();
  console.log("Family presence: authenticated identities, same-map rendering, interpolation, leave and TTL passed");
} finally { close(); }
