import { strict as assert } from "node:assert";
import { FamilyState } from "../../server/family/state";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyPresenceService } from "../../server/family/presence";
import { familyTestDB } from "./family-db";
import { FAMILY_PRESENCE_TTL_MS, extrapolateFamilyPosition, familyPresenceVelocity, interpolateFamilyPosition, mergeFamilyPresenceSnapshots, overlayFamilyPresenceActions, visibleFamilyPlayers } from "../family/presence";
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
  const isolatedRealtime = {
    players: [snapshot.players.find((p) => p.playerId === a.room.playerId)!],
    serverNow: snapshot.serverNow + 100,
  };
  const mergedPresence = mergeFamilyPresenceSnapshots(snapshot, isolatedRealtime);
  assert.equal(mergedPresence.players.length, 2, "an isolate-local realtime frame cannot erase a fresh D1 family player");
  const expiredPresence = mergeFamilyPresenceSnapshots(mergedPresence, {
    players: [],
    serverNow: snapshot.players.find((p) => p.playerId === b.room.playerId)!.lastSeen + FAMILY_PRESENCE_TTL_MS + 1,
  });
  assert.equal(expiredPresence.players.some((p) => p.playerId === b.room.playerId), false, "a missing player still expires after the presence TTL");
  const forestPose = { ...pose, mapId: "fairy_forest", x: 496, y: 656 };
  await presence.heartbeat("A", a.room.id, forestPose, sessionA);
  const forestSnapshot = await presence.heartbeat("B", a.room.id, { ...forestPose, x: 504 }, sessionB);
  assert.equal(visibleFamilyPlayers(forestSnapshot, a.room.playerId, "fairy_forest").length, 1, "same forest shows family players");
  assert.equal(visibleFamilyPlayers(forestSnapshot, a.room.playerId, "farm").length, 0, "other maps stay hidden");
  await presence.heartbeat("A", a.room.id, pose, sessionA);
  await presence.heartbeat("B", a.room.id, pose, sessionB);
  const state = new FamilyState(db, () => now);
  await state.act("A", a.room.id, 0, { kind: "tool", tool: "hoe", x: 9, y: 8, pose: { ...pose, x: 336, y: 272, facing: "left", moving: false } });
  const acted = await presence.heartbeat("A", a.room.id, { ...pose, action: { id: "spoof" } }, sessionA);
  const action = acted.players.find(p => p.playerId === a.room.playerId)!.action!;
  assert.equal(action.tool, "hoe"); assert.notEqual(action.id, "spoof");
  now += 2501;
  assert.equal((await presence.read("B", a.room.id)).players.find(p => p.playerId === a.room.playerId)!.action, undefined);
  await assert.rejects(presence.read("outsider", a.room.id));
  await assert.rejects(presence.heartbeat("outsider", a.room.id, pose, sessionA));
  await assert.rejects(presence.heartbeat("A", a.room.id, { ...pose, x: -1 }, sessionA));
  await presence.leave("B", a.room.id, crypto.randomUUID());
  assert.equal((await presence.read("A", a.room.id)).players.length, 2, "stale tab leave must not remove new session");
  await presence.leave("B", a.room.id, sessionB); assert.equal((await presence.read("A", a.room.id)).players.length, 1);
  now += FAMILY_PRESENCE_TTL_MS + 1; assert.equal((await presence.read("A", a.room.id)).players.length, 0);
  const movementPlayer = { ...snapshot.players.find(p => p.playerId === b.room.playerId)!, x: 777, y: 555, moving: true, velocityX: 145, velocityY: 0, running: false, lastSeen: snapshot.serverNow + 100 };
  const actionPlayer = { ...snapshot.players.find(p => p.playerId === b.room.playerId)!, x: 111, y: 222, action: { ...action, expiresAt: snapshot.serverNow + 2500 } };
  const overlaid = overlayFamilyPresenceActions({ players: [movementPlayer], serverNow: snapshot.serverNow + 100 }, { players: [actionPlayer], serverNow: snapshot.serverNow });
  assert.deepEqual([overlaid.players[0].x, overlaid.players[0].y], [777, 555], "D1 action metadata never replaces WebSocket movement coordinates");
  assert.equal(overlaid.players[0].action?.id, action.id, "D1 can still supply short-lived remote tool visuals");
  const priorMotion = { ...movementPlayer, x: 760, y: 555, velocityX: undefined, velocityY: undefined, lastSeen: movementPlayer.lastSeen - 33 };
  const velocity = familyPresenceVelocity(priorMotion, movementPlayer);
  assert.deepEqual(velocity, { x: 145, y: 0 }, "remote movement uses the sender's live velocity state when available");
  const extrapolated = extrapolateFamilyPosition(movementPlayer, velocity, movementPlayer.lastSeen + 90);
  assert.ok(extrapolated.x > movementPlayer.x, "live movement state keeps the remote avatar moving between snapshots");
  const stopped = { ...movementPlayer, moving: false, velocityX: 0, velocityY: 0, x: extrapolated.x };
  assert.deepEqual(familyPresenceVelocity(movementPlayer, stopped), { x: 0, y: 0 }, "stop state halts dead reckoning immediately");
  const midway = interpolateFamilyPosition({ x: 0, y: 0 }, { x: 60, y: 60 }, 16); assert.ok(midway.x > 20 && midway.x < 30, "remote interpolation smooths packet cadence without snapping every frame");
  assert.deepEqual(interpolateFamilyPosition({ x: 0, y: 0 }, { x: 120, y: 0 }, 16), { x: 120, y: 0 }, "large corrections snap instead of visibly trailing");
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
  const remote = { ...snapshot.players.find(p => p.playerId === b.room.playerId)!, action: { ...action, expiresAt: snapshot.serverNow + 2500 } };
  renderer.receive({ ...snapshot, players: [remote] }); renderer.update("farm", 16); renderer.update("farm", 16);
  assert.equal(animations.filter(a => a === "tool_left").length, 1, "same action must not restart each frame");
  renderer.update("town", 16); assert.equal(destroyed, 2);
  renderer.destroy();
  console.log("Family presence: authenticated identities, same-map rendering, interpolation, leave and TTL passed");
} finally { close(); }
