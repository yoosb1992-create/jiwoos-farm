import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RanchPanel } from "../../app/components/RanchPanel";
import { ANIMAL_DEFINITIONS } from "../animals/definitions";
import { advanceRanchDay, buyAnimal, collectAnimalProduce, feedCoop, initialRanchState, normalizeRanchState, petAnimal } from "../animals/system";
import { BUILDING_DEFINITIONS } from "../buildings/definitions";
import { constructBuilding, initialBuildings } from "../buildings/system";
import { Inventory, normalizeSaveData } from "../domain";
import { sellMarketGoods } from "../economy/sales";
import { initialFarmProgress } from "../farm/expansions";
import { initialPlaceables, placementError } from "../placeables/system";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { initialPlayerStats } from "../player/stats";
import { initialFishingProgress } from "../fishing/system";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

const map = MAP_DEFINITIONS.farm, buildings = initialBuildings(), placeables = initialPlaceables();
const bag = new Inventory({ items: { wood_plank: 8, stone_block: 4, animal_feed: 8, wood_processor: 1 } });
const pose = { mapId: "farm", x: 13 * 32, y: 18 * 32 };
assert.equal(BUILDING_DEFINITIONS.chicken_coop.animalCapacity, 4);
assert.deepEqual(BUILDING_DEFINITIONS.chicken_coop.allowedAnimalSpecies, ["chicken"]);
const deniedBuildings = initialBuildings(), deniedBag = new Inventory({ items: { wood_plank: 2, stone_block: 1 } });
assert.match(constructBuilding(deniedBuildings, placeables, [], deniedBag, 149, map, "chicken_coop", 14, 17, [pose], "denied", 1).error!, /비용/);
assert.deepEqual({ buildings: deniedBuildings, inventory: deniedBag.serialize() }, { buildings: initialBuildings(), inventory: { items: { wood_plank: 2, stone_block: 1 } } });
const built = constructBuilding(buildings, placeables, [], bag, 1000, map, "chicken_coop", 14, 17, [pose], "coop", 1);
assert.deepEqual(built, { error: null, money: 850 });
assert.deepEqual([bag.count("wood_plank"), bag.count("stone_block"), buildings.instances[0].definitionId], [6, 3, "chicken_coop"]);
assert.match(placementError(placeables, "wood_processor", map, 15, 18, [pose], buildings)!, /건물/);

const ranch = initialRanchState(); let money = built.money;
for (let i = 1; i <= 4; i++) {
  const result = buyAnimal(ranch, buildings, money, "chicken", "coop", `chicken-${i}`, 1);
  assert.equal(result.error, null); assert.ok(result.animal?.id); money = result.money;
}
assert.equal(money, 370); assert.equal(new Set(ranch.animals.map(a => a.id)).size, 4);
const beforeFull = structuredClone({ ranch, money });
assert.match(buyAnimal(ranch, buildings, money, "chicken", "coop", "chicken-5", 1).error!, /빈자리/);
assert.deepEqual({ ranch, money }, beforeFull);
assert.match(buyAnimal(initialRanchState(), buildings, 119, "chicken", "coop", "poor", 1).error!, /자금/);
const hungryBag = new Inventory({ items: { animal_feed: 3 } }), beforeHungryFeed = structuredClone({ ranch, inventory: hungryBag.serialize() });
assert.match(feedCoop(ranch, buildings, hungryBag, "coop", 1)!, /4개/);
assert.deepEqual({ ranch, inventory: hungryBag.serialize() }, beforeHungryFeed, "insufficient feed is atomic");
assert.equal(feedCoop(ranch, buildings, bag, "coop", 1), null);
assert.equal(bag.count("animal_feed"), 4); assert.ok(ranch.animals.every(a => a.lastFedDaySerial === 1));
const fed = structuredClone({ ranch, inventory: bag.serialize() });
assert.ok(feedCoop(ranch, buildings, bag, "coop", 1)); assert.deepEqual({ ranch, inventory: bag.serialize() }, fed);
const first = ranch.animals[0];
assert.equal(petAnimal(ranch, first.id, 1), null); assert.equal(first.friendship, 10);
assert.match(petAnimal(ranch, first.id, 1)!, /이미/); assert.equal(first.friendship, 10);
assert.equal(advanceRanchDay(ranch, 1, 2), true); assert.ok(ranch.animals.every(a => a.produceReady === "egg"));
assert.equal(advanceRanchDay(ranch, 1, 2), false, "same day cannot produce twice");
assert.equal(petAnimal(ranch, first.id, 2), null); assert.equal(first.friendship, 20);
assert.equal(collectAnimalProduce(ranch, bag, first.id), null); assert.equal(bag.count("egg"), 1); assert.equal(first.produceReady, null);
const collected = structuredClone({ ranch, inventory: bag.serialize() });
assert.ok(collectAnimalProduce(ranch, bag, first.id)); assert.deepEqual({ ranch, inventory: bag.serialize() }, collected);
const noFeed = buyAnimal(initialRanchState(), buildings, 200, "chicken", "coop", "hungry", 1).animal!;
const hungryRanch = { animals: [noFeed], lastDailyProcessedDaySerial: 0 };
advanceRanchDay(hungryRanch, 1, 2); assert.equal(noFeed.produceReady, null);
assert.equal(sellMarketGoods(bag).earned, ANIMAL_DEFINITIONS.chicken.produceSellPrice);

const saved = normalizeSaveData({ version: 4, day: 2, daySerial: 2, timeMinutes: 360, money, selectedTool: "hand",
  player: { ...pose, facing: "down" }, inventory: bag.serialize(), farm: [], buildings, ranchState: ranch,
  farmProgress: initialFarmProgress(), placeables, stats: initialPlayerStats(), fishingProgress: initialFishingProgress(), savedAt: 1 })!;
assert.deepEqual(saved.ranchState, ranch); assert.equal(saved.ranchState?.animals[0].homeBuildingId, "coop");
assert.deepEqual(normalizeSaveData(JSON.parse(JSON.stringify(saved)))?.ranchState, ranch);
for (const version of [1, 2, 3, 4]) {
  const legacy = normalizeSaveData({ ...saved, version, ranchState: undefined })!;
  assert.deepEqual(legacy.ranchState, initialRanchState());
  assert.deepEqual(legacy.fishingProgress, saved.fishingProgress); assert.deepEqual(legacy.buildings, saved.buildings);
}
assert.deepEqual(normalizeRanchState({ animals: [{ ...first, homeBuildingId: "deleted" }] }, buildings), initialRanchState(), "orphan animals are rejected");
const markup = renderToStaticMarkup(createElement(RanchPanel, { homeBuildingId: "coop", ranch, daySerial: 2, money, items: bag.serialize().items,
  busy: false, notice: "준비", onBuy: () => {}, onFeed: () => {}, onPet: () => {}, onCollect: () => {}, onClose: () => {} }));
for (const label of ["닭장", "닭 4 / 4", "친밀도", "달걀", "먹이 공급"]) assert.ok(markup.includes(label));

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 100000), state = new FamilyState(db, () => 100000);
  const a = await rooms.create("animal-A", "목장 가족", "A"), b = await rooms.join("animal-B", a.room.inviteCode, "B"), room = a.room.id;
  await state.read("animal-A", room);
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json,'$.money',1000), inventories_json=? WHERE room_id=?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood_plank: 4, stone_block: 2, animal_feed: 4 } }, [b.room.playerId]: { items: { animal_feed: 4 } } }), room).run();
  const near = { mapId: "farm", x: 13.5 * 32, y: 18.5 * 32, facing: "right", moving: false, selectedTool: "hand" } as const;
  const read = (user: string) => state.read(user, room);
  const act = async (user: string, action: object) => state.act(user, room, (await read(user)).revision, action);
  const build = await act("animal-A", { kind: "build", definitionId: "chicken_coop", tileX: 14, tileY: 17, pose: near });
  const coop = build.world.buildings!.instances[0]; assert.equal(coop.definitionId, "chicken_coop"); assert.equal(build.world.money, 850);
  const buy = (user: string) => act(user, { kind: "animal-buy", species: "chicken", homeBuildingId: coop.id, pose: near });
  for (let i = 0; i < 3; i++) await buy(i % 2 ? "animal-B" : "animal-A");
  const purchaseRevision = (await read("animal-A")).revision;
  const purchaseRace = await Promise.allSettled([state.act("animal-A", room, purchaseRevision, { kind: "animal-buy", species: "chicken", homeBuildingId: coop.id, pose: near }), state.act("animal-B", room, purchaseRevision, { kind: "animal-buy", species: "chicken", homeBuildingId: coop.id, pose: near })]);
  assert.equal(purchaseRace.filter(r => r.status === "fulfilled").length, 1);
  const full = await read("animal-A"); assert.equal(full.world.ranchState?.animals.length, 4); assert.equal(full.world.money, 370); assert.deepEqual(full.world.ranchState, (await read("animal-B")).world.ranchState);
  const beforeFar = await read("animal-A");
  await assert.rejects(state.act("animal-A", room, beforeFar.revision, { kind: "animal-feed", homeBuildingId: coop.id, pose: { ...near, x: 0, y: 0 } }), (e: unknown) => e instanceof FamilyError && e.status === 400);
  assert.deepEqual(await read("animal-A"), beforeFar);
  const fedFamily = await act("animal-B", { kind: "animal-feed", homeBuildingId: coop.id, pose: near });
  assert.equal(fedFamily.inventory.items.animal_feed, 0); assert.ok(fedFamily.world.ranchState?.animals.every(animal => animal.lastFedDaySerial === 1)); assert.equal((await read("animal-A")).inventory.items.animal_feed, 4);
  const target = fedFamily.world.ranchState!.animals[0], petRevision = fedFamily.revision;
  const petRace = await Promise.allSettled([state.act("animal-A", room, petRevision, { kind: "animal-pet", animalId: target.id, pose: near }), state.act("animal-B", room, petRevision, { kind: "animal-pet", animalId: target.id, pose: near })]);
  assert.equal(petRace.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await read("animal-A")).world.ranchState?.animals.find(animal => animal.id === target.id)?.friendship, 10);
  await assert.rejects(act("animal-B", { kind: "animal-pet", animalId: target.id, pose: near }), (e: unknown) => e instanceof FamilyError && e.status === 409);
  const bed = { ...near, mapId: "farmhouse", x: 304, y: 224 };
  const tomorrow = await act("animal-A", { kind: "sleep", pose: bed });
  assert.equal(tomorrow.world.daySerial, 2); assert.ok(tomorrow.world.ranchState?.animals.every(animal => animal.produceReady === "egg"));
  const ready = tomorrow.world.ranchState!.animals[0], collectRevision = tomorrow.revision;
  const collectRace = await Promise.allSettled([state.act("animal-A", room, collectRevision, { kind: "animal-collect", animalId: ready.id, pose: near }), state.act("animal-B", room, collectRevision, { kind: "animal-collect", animalId: ready.id, pose: near })]);
  assert.equal(collectRace.filter(r => r.status === "fulfilled").length, 1);
  const afterA = await read("animal-A"), afterB = await read("animal-B");
  assert.equal((afterA.inventory.items.egg ?? 0) + (afterB.inventory.items.egg ?? 0), 1); assert.equal(afterA.world.ranchState?.animals.find(animal => animal.id === ready.id)?.produceReady, null);
  const winner = (afterA.inventory.items.egg ?? 0) ? "animal-A" : "animal-B", loser = winner === "animal-A" ? "animal-B" : "animal-A";
  assert.equal((await read(loser)).inventory.items.egg ?? 0, 0);
  const sold = await act(winner, { kind: "sell", pose: near });
  assert.equal(sold.world.money, 370 + ANIMAL_DEFINITIONS.chicken.produceSellPrice); assert.equal(sold.inventory.items.egg, 0);
  assert.equal(sold.stats?.stamina, 100); assert.equal(sold.stats?.skills.fishing.experience, 0);
  console.log("Animals ranching: coop, purchase, feed, pet, daily produce, save, Family authority and CAS passed");
} finally { close(); }
