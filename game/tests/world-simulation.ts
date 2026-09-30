import { strict as assert } from "node:assert";
import { advanceFarmDay, normalizeSaveData, type FarmTileData } from "../domain";
import { calendarDate } from "../world/calendar";
import { WEATHER_DEFINITIONS } from "../weather/definitions";
import { waterFarmForRain, weatherFor } from "../weather/system";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { FamilyPresenceService } from "../../server/family/presence";
import { familyTestDB } from "./family-db";
import { emptyForestState } from "../forest/resources";
import { generateFairyForest } from "../forest/generation";
import { NpcController } from "../npc/NpcController";
import { NPC_DEFINITIONS } from "../npc/definitions";
import { MapRegistry } from "../maps/MapRegistry";

assert.deepEqual(calendarDate(1), { year: 1, season: "spring", day: 1, daySerial: 1 });
assert.deepEqual(calendarDate(29), { year: 1, season: "summer", day: 1, daySerial: 29 });
assert.deepEqual(calendarDate(113), { year: 2, season: "spring", day: 1, daySerial: 113 });
for (let serial = 1; serial <= 365; serial++) {
  const date = calendarDate(serial);
  assert.equal((date.year - 1) * 112 + ["spring", "summer", "autumn", "winter"].indexOf(date.season) * 28 + date.day, serial);
  assert.ok(Object.hasOwn(WEATHER_DEFINITIONS, weatherFor("single", serial).id));
  assert.deepEqual(weatherFor("single", serial), weatherFor("single", serial));
}
assert.throws(() => calendarDate(0));

const tile: FarmTileData = { x: 9, y: 8, tilled: true, wateredToday: false, cropType: "sproutberry", cropStage: 0, plantedDay: 1 };
const emptyTilled: FarmTileData = { ...tile, x: 10, cropType: null, cropStage: null };
waterFarmForRain([tile, emptyTilled], WEATHER_DEFINITIONS.rain);
assert.equal(tile.wateredToday, true);
assert.equal(emptyTilled.wateredToday, true, "rain visibly wets empty tilled soil too");
advanceFarmDay([tile]);
assert.equal(tile.cropStage, 1);
assert.equal(tile.wateredToday, false);
waterFarmForRain([tile], WEATHER_DEFINITIONS.clear);
assert.equal(tile.wateredToday, false);
tile.wateredToday = true; // The existing watering can still grows a crop.
advanceFarmDay([tile]);
assert.equal(tile.cropStage, 2);

const baseSave = { day: 28, timeMinutes: 480, money: 99, selectedTool: "water", player: { x: 300, y: 260, facing: "down", mapId: "farm" },
  inventory: { items: { sproutberry_seed: 4, wood_plank: 2 } }, farm: [tile], savedAt: 1 };
for (const version of [1, 2, 3, 4]) {
  const legacy = version < 3 ? { ...baseSave, inventory: { seeds: 4, harvest: 2 } } : baseSave;
  const saved = normalizeSaveData({ ...legacy, version });
  assert.equal(saved?.version, 4);
  assert.equal(saved?.daySerial, version === 1 ? 1 : 28);
  assert.equal(saved?.day, version === 1 ? 1 : 28);
  if (version >= 3) assert.equal(saved?.inventory.items.wood_plank, 2);
}
const persisted = normalizeSaveData({ ...baseSave, version: 4, daySerial: 113, day: 1 });
assert.equal(persisted?.day, 1);
assert.equal(calendarDate(persisted!.daySerial!).year, 2);
assert.equal(normalizeSaveData(JSON.parse(JSON.stringify(persisted)))?.daySerial, 113);

const controller = new NpcController(NPC_DEFINITIONS, new MapRegistry());
assert.deepEqual(controller.sampleWorld(29, 600), controller.sample(1, 600));
assert.notDeepEqual(generateFairyForest("single", 28).objects, generateFairyForest("single", 29).objects);

const { db, close } = familyTestDB();
try {
  const now = 100_000, rooms = new FamilyRooms(db, () => now), state = new FamilyState(db, () => now), presence = new FamilyPresenceService(db, () => now);
  const a = await rooms.create("weather-A", "날씨 농장", "A");
  await rooms.join("weather-B", a.room.inviteCode, "B");
  const roomId = a.room.id;
  const rainyDay = Array.from({ length: 150 }, (_, i) => i + 2).find(day => weatherFor(roomId, day).id === "rain" && weatherFor(roomId, day - 1).id !== "rain")!;
  assert.ok(rainyDay);
  await state.read("weather-A", roomId);
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json, '$.daySerial', ?, '$.day', ?, '$.forestState', json(?)) WHERE room_id=?")
    .bind(rainyDay - 1, calendarDate(rainyDay - 1).day, JSON.stringify(emptyForestState(rainyDay - 1)), roomId).run();
  const farmPose = { mapId: "farm", x: 304, y: 224, facing: "down", selectedTool: "hoe", moving: false };
  const sleepPose = { ...farmPose, mapId: "farmhouse", x: 304, y: 224 };
  await presence.heartbeat("weather-A", roomId, farmPose, crypto.randomUUID());
  await presence.heartbeat("weather-B", roomId, farmPose, crypto.randomUUID());
  const act = async (user: string, action: object) => state.act(user, roomId, (await state.read(user, roomId)).revision, action);
  await act("weather-A", { kind: "tool", tool: "hoe", x: 9, y: 8, pose: farmPose });
  await act("weather-A", { kind: "tool", tool: "seed", x: 9, y: 8, pose: { ...farmPose, selectedTool: "seed" } });
  await act("weather-A", { kind: "sleep", pose: sleepPose });
  const next = await act("weather-B", { kind: "sleep", pose: sleepPose });
  assert.equal(next.world.daySerial, rainyDay);
  assert.equal(next.world.day, calendarDate(rainyDay).day);
  assert.equal(next.world.farm[0].wateredToday, true, "rain waters crops after the previous day's growth");
  assert.equal(next.world.farm[0].cropStage, 0);
  const rainyHoe = await act("weather-A", { kind: "tool", tool: "hoe", x: 10, y: 8, pose: { ...farmPose, x: 336 } });
  assert.equal(rainyHoe.world.farm.find(t => t.x === 10 && t.y === 8)?.wateredToday, true);
  const rainyPlanting = await act("weather-A", { kind: "tool", tool: "seed", x: 10, y: 8, pose: { ...farmPose, x: 336, selectedTool: "seed" } });
  assert.equal(rainyPlanting.world.farm.find(t => t.x === 10 && t.y === 8)?.wateredToday, true, "seeds planted during rain are watered");
  const otherPlayer = await new FamilyState(db, () => now).read("weather-B", roomId);
  assert.deepEqual(otherPlayer.world, (await state.read("weather-A", roomId)).world);
  assert.equal(weatherFor(roomId, otherPlayer.world.daySerial!).id, weatherFor(roomId, next.world.daySerial!).id);
  await act("weather-A", { kind: "sleep", pose: sleepPose });
  const afterRain = await act("weather-B", { kind: "sleep", pose: sleepPose });
  assert.equal(afterRain.world.farm[0].cropStage, 1, "rain produces growth on the next sleep");
  assert.equal(afterRain.world.forestState?.daySerial, rainyDay + 1);
} finally { close(); }
console.log("World simulation: calendar, weather, rain/growth, legacy saves, NPC, forest and Family shared state passed");
