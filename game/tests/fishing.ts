import { strict as assert } from "node:assert";
import { GAME_CONFIG } from "../config";
import { Inventory, normalizeSaveData } from "../domain";
import { sellMarketGoods } from "../economy/sales";
import { FISH_DEFINITIONS } from "../fishing/definitions";
import { beginFishing, eligibleFish, fishingSpotError, fishingStage, initialFishingProgress, normalizeFishingProgress, reelFishing, rollFish } from "../fishing/system";
import { parseFamilyPose } from "../family/personal";
import { initialPlayerStats } from "../player/stats";
import { worldMinute } from "../world/calendar";
import { weatherFor } from "../weather/system";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyPresenceService } from "../../server/family/presence";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

const pose = { mapId: "farm", x: 25.5 * 32, y: 14.5 * 32, facing: "down", selectedTool: "fishing_rod", moving: false } as const;
assert.ok(parseFamilyPose(pose));
assert.equal(fishingSpotError("farm_pond", pose), null);
for (const invalid of [
  { ...pose, mapId: "road" }, { ...pose, x: 9 * 32 }, { ...pose, y: 10 * 32 },
  { ...pose, facing: "up" }, { ...pose, selectedTool: "axe" },
]) assert.ok(fishingSpotError("farm_pond", invalid as typeof pose));
assert.ok(fishingSpotError("unknown", pose));
assert.ok(eligibleFish("farm_pond", 1, "clear", 600).some(f => f.id === "carp"));
assert.ok(!eligibleFish("farm_pond", 29, "clear", 600).some(f => f.id === "carp"));
assert.ok(eligibleFish("farm_pond", 29, "rain", 1100).some(f => f.id === "catfish"));
assert.ok(!eligibleFish("farm_pond", 29, "cloudy", 1100).some(f => f.id === "catfish"));
assert.ok(!eligibleFish("farm_pond", 29, "rain", 700).some(f => f.id === "catfish"));
assert.equal(eligibleFish("farm_pond", 29, "rain", 1440).length, 0);
const candidates = eligibleFish("farm_pond", 1, "clear", 600);
assert.deepEqual(rollFish("scope", "player", 1, "farm_pond", 1, candidates), rollFish("scope", "player", 1, "farm_pond", 1, candidates));
assert.equal(rollFish("scope", "player", 1, "farm_pond", 1, []), null);

const inventory = new Inventory({ items: { sproutberry: 2 } }), stats = initialPlayerStats(), progress = initialFishingProgress();
assert.deepEqual(stats.skills.fishing, { level: 1, experience: 0 });
const low = { ...initialPlayerStats(), stamina: 0 };
assert.ok(beginFishing(progress, null, pose, "farm_pond", "single", "single", 1, "clear", 600, low).error);
assert.deepEqual(progress, initialFishingProgress());
let castResult = beginFishing(progress, null, pose, "farm_pond", "single", "single", 1, "clear", 600, stats);
assert.ok(castResult.cast && castResult.progress);
let cast = castResult.cast!, personal = castResult.progress!;
assert.equal(stats.stamina, 100, "casting alone does not charge stamina");
assert.equal(fishingStage(cast, worldMinute(1, 600)), "waiting");
assert.equal(fishingStage(cast, cast.biteAt), "bite");
assert.equal(fishingStage(cast, cast.expiresAt + 1), "missed");
assert.ok(beginFishing(personal, cast, pose, "farm_pond", "single", "single", 1, "clear", 600, stats).error);
assert.ok(reelFishing(cast, cast.id, personal, inventory, stats, 1, 600).error);
assert.ok(reelFishing(cast, "wrong", personal, inventory, stats, 1, 604).error);
assert.deepEqual([inventory.count(cast.fishId === "minnow" ? "fish_minnow" : FISH_DEFINITIONS[cast.fishId].itemId), stats.stamina, stats.skills.fishing.experience], [0, 100, 0]);
const caught = reelFishing(cast, cast.id, personal, inventory, stats, 1, 604);
assert.equal(caught.fish?.id, cast.fishId);
assert.deepEqual([inventory.count(caught.fish!.itemId), stats.stamina, stats.skills.fishing.experience], [1, 95, 6]);
assert.deepEqual(personal.caughtFishIds, [caught.fish!.id]);
assert.ok(reelFishing(null, cast.id, personal, inventory, stats, 1, 604).error);
for (let i = 0; i < 4; i++) {
  castResult = beginFishing(personal, null, pose, "farm_pond", "single", "single", 1, "clear", 610 + i * 10, stats);
  cast = castResult.cast!; personal = castResult.progress!;
  reelFishing(cast, cast.id, personal, inventory, stats, 1, 614 + i * 10);
}
assert.equal(stats.skills.fishing.level, 2);
assert.equal(personal.caughtFishIds.length, new Set(personal.caughtFishIds).size);
castResult = beginFishing(personal, null, pose, "farm_pond", "single", "single", 1, "clear", 700, stats);
const missed = reelFishing(castResult.cast!, castResult.cast!.id, castResult.progress!, inventory, stats, 1, 717);
assert.equal(missed.failed, true);
const beforeFailed = structuredClone({ inventory: inventory.serialize(), stats, progress: castResult.progress });
assert.ok(reelFishing(castResult.cast!, castResult.cast!.id, castResult.progress!, inventory, low, 1, 704).error);
assert.deepEqual({ inventory: inventory.serialize(), stats, progress: castResult.progress }, beforeFailed);
const price = Object.values(FISH_DEFINITIONS).reduce((sum, fish) => sum + inventory.count(fish.itemId) * fish.sellPrice, 70);
assert.equal(sellMarketGoods(inventory).earned, price);
assert.equal(sellMarketGoods(inventory).amount, 0);

const saved = normalizeSaveData({ version: 4, day: 1, daySerial: 1, timeMinutes: 600, selectedTool: "fishing_rod",
  player: pose, inventory: { items: { fish_minnow: 3, copper_ore: 2 } }, farm: [], money: 10,
  stats, fishingProgress: personal, mineProgress: { deepestUnlockedFloor: 3 }, buildings: { instances: [] }, farmProgress: { unlocked: [] },
  placeables: { instances: [] }, storage: { containers: {} }, toolProgression: { axe: 2, pickaxe: 1 } })!;
assert.equal(saved.selectedTool, "fishing_rod");
assert.deepEqual(saved.fishingProgress, personal);
assert.equal(saved.inventory.items.fish_minnow, 3);
assert.equal(saved.mineProgress?.deepestUnlockedFloor, 3);
assert.deepEqual(normalizeSaveData(JSON.parse(JSON.stringify(saved)))?.fishingProgress, personal);
for (const version of [1, 2, 3, 4]) {
  const legacy = normalizeSaveData({ ...saved, version, fishingProgress: undefined, stats: { ...stats, skills: { farming: stats.skills.farming } } })!;
  assert.deepEqual(legacy.fishingProgress, initialFishingProgress());
  assert.deepEqual(legacy.stats?.skills.fishing, { level: 1, experience: 0 });
  assert.equal(legacy.mineProgress?.deepestUnlockedFloor, 3);
}
assert.deepEqual(normalizeFishingProgress({ caughtFishIds: ["minnow", "minnow", "unknown"], castSequence: -1 }), { castSequence: 0, caughtFishIds: ["minnow"] });

const { db, close } = familyTestDB();
try {
  let now = 100000;
  const rooms = new FamilyRooms(db, () => now), family = new FamilyState(db, () => now), presence = new FamilyPresenceService(db, () => now);
  const a = await rooms.create("fish-A", "낚시 가족", "A"), b = await rooms.join("fish-B", a.room.inviteCode, "B"), room = a.room.id;
  await family.read("fish-A", room);
  await presence.heartbeat("fish-A", room, pose, crypto.randomUUID());
  await presence.heartbeat("fish-B", room, pose, crypto.randomUUID());
  const read = (user: string) => family.read(user, room);
  const act = async (user: string, action: object) => family.act(user, room, (await read(user)).revision, action);
  const fail = async (user: string, action: object, code: number) => {
    const before = await read(user);
    await assert.rejects(family.act(user, room, before.revision, action), (e: unknown) => e instanceof FamilyError && e.status === code);
    const after = await read(user);
    assert.equal(after.revision, before.revision);
    assert.deepEqual([after.inventory, after.stats, after.fishingProgress, after.fishingCast], [before.inventory, before.stats, before.fishingProgress, before.fishingCast]);
  };
  const castRequest = { kind: "fish-cast", spotId: "farm_pond", pose };
  const aCast = await act("fish-A", castRequest);
  const bCast = await act("fish-B", castRequest);
  assert.ok(aCast.fishingCast && bCast.fishingCast);
  assert.equal((await read("fish-B")).stats?.stamina, 100);
  await fail("fish-A", { ...castRequest, fishId: "catfish", pose: { ...pose, x: 0 } }, 400);
  await fail("fish-A", { kind: "fish-reel", castId: aCast.fishingCast!.id, pose }, 409);
  now += 4 * GAME_CONFIG.day.realMsPerGameMinute;
  const reel = (castId: string) => ({ kind: "fish-reel", castId, pose });
  const aReel = await act("fish-A", reel(aCast.fishingCast!.id));
  assert.equal(aReel.inventory.items[FISH_DEFINITIONS[aCast.fishingCast!.fishId].itemId], 1);
  assert.equal(aReel.stats?.stamina, 95);
  assert.equal(aReel.stats?.skills.fishing.experience, 6);
  assert.deepEqual(aReel.fishingProgress?.caughtFishIds, [aCast.fishingCast!.fishId]);
  assert.equal((await read("fish-B")).stats?.stamina, 100);
  assert.deepEqual((await read("fish-B")).inventory.items, { sproutberry_seed: GAME_CONFIG.startingSeedCount, sproutberry: 0 });
  await fail("fish-A", reel(aCast.fishingCast!.id), 400);
  const bReel = await act("fish-B", reel(bCast.fishingCast!.id));
  assert.equal(bReel.inventory.items[FISH_DEFINITIONS[bCast.fishingCast!.fishId].itemId], 1);
  assert.equal((await read("fish-A")).stats?.stamina, 95);
  const sharedMoney = bReel.world.money;
  const bSold = await act("fish-B", { kind: "sell", pose });
  assert.equal(bSold.world.money, sharedMoney + FISH_DEFINITIONS[bCast.fishingCast!.fishId].sellPrice);
  assert.equal((await read("fish-A")).inventory.items[FISH_DEFINITIONS[aCast.fishingCast!.fishId].itemId], 1, "B's sale does not consume A's fish");
  const bSecond = await act("fish-B", castRequest);
  now += 4 * GAME_CONFIG.day.realMsPerGameMinute;
  const duplicateReel = await Promise.allSettled([
    family.act("fish-B", room, bSecond.revision, reel(bSecond.fishingCast!.id)),
    family.act("fish-B", room, bSecond.revision, reel(bSecond.fishingCast!.id)),
  ]);
  assert.equal(duplicateReel.filter(r => r.status === "fulfilled").length, 1, "duplicate reel can grant only one fish");
  await fail("fish-B", reel(bSecond.fishingCast!.id), 400);
  const sameSpot = await Promise.allSettled([
    family.act("fish-B", room, (await read("fish-B")).revision, castRequest),
    family.act("fish-A", room, (await read("fish-A")).revision, castRequest),
  ]);
  assert.equal(sameSpot.filter(r => r.status === "fulfilled").length, 1, "revision conflict asks the other fisher to retry");
  const conflictedUser = sameSpot[0].status === "rejected" ? "fish-B" : "fish-A";
  await act(conflictedUser, castRequest);
  assert.ok((await read("fish-A")).fishingCast && (await read("fish-B")).fishingCast, "both can fish at the same spot independently");
  const active = await read("fish-A");
  assert.equal(active.world.daySerial, (await read("fish-B")).world.daySerial);
  assert.ok(active.world.farm.length > 0);
  const bed = { ...pose, mapId: "farmhouse", x: 304, y: 224, selectedTool: "hand" } as const;
  await presence.heartbeat("fish-A", room, bed, crypto.randomUUID());
  await presence.heartbeat("fish-B", room, bed, crypto.randomUUID());
  await act("fish-A", { kind: "sleep", pose: bed });
  const tomorrow = await act("fish-B", { kind: "sleep", pose: bed });
  assert.equal(tomorrow.world.daySerial, 2);
  assert.equal(tomorrow.fishingCast, null);
  assert.equal((await read("fish-A")).fishingCast, null);
  assert.ok((await read("fish-A")).fishingProgress?.caughtFishIds.length);
  assert.equal((await read("fish-A")).stats?.stamina, 100);
  assert.equal((await read("fish-B")).stats?.stamina, 100);
  assert.equal(weatherFor(room, tomorrow.world.daySerial!), weatherFor(room, (await read("fish-A")).world.daySerial!));
  console.log("Fishing: spot, seasonal conditions, roll, stamina/XP, sale, migration, Family authority and CAS passed");
} finally { close(); }
