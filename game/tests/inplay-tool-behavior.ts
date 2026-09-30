import { strict as assert } from "node:assert";
import { ToolActionSystem } from "../actions/ToolActionSystem";
import { EMPTY_WATER_ACTION_DEFINITION, WATER_REFILL_ACTION_DEFINITION } from "../actions/toolActionDefinitions";
import type { FarmTileData } from "../domain";
import { beginObjectDrag, moveMapObject, objectDragPosition } from "../editor/objectDrag";
import { EditorHistory } from "../editor/history";
import { hasPlantedCrop, undoTilledFarmTile } from "../farm/toolBehavior";
import { MAP_DEFINITIONS } from "../maps/definitions";
import type { MapObjectDefinition } from "../maps/types";
import { playerInteractionAnchorFromPosition } from "../player/interaction";
import { initialPlayerStats } from "../player/stats";
import { PLANTED_SEED_MARKER_OFFSET } from "../rendering/WorldRenderer";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

let now = 1_000;
let velocity = 145;
let finish: () => void = () => undefined;
const activeChanges: boolean[] = [];
const actions = new ToolActionSystem({
  playAction: ({ onComplete }) => { finish = onComplete; },
}, () => now, undefined, (active) => {
  activeChanges.push(active);
  if (active) velocity = 0;
});

assert.equal(actions.execute("hoe", "down", () => undefined), true);
assert.equal(actions.isActive(), true);
assert.equal(velocity, 0, "action start immediately stops player velocity");
now += 1_000;
assert.equal(actions.execute("axe", "left", () => undefined), false, "elapsed cooldown cannot overlap an active animation");
finish();
assert.equal(actions.isActive(), false);
assert.deepEqual(activeChanges, [true, false]);
assert.equal(actions.execute("axe", "left", () => undefined), true, "movement/tool input unlocks after animation complete");
finish();

let refillApplied = 0;
let refillFinish: () => void = () => undefined;
const refill = new ToolActionSystem({
  playAction: ({ style, definition, onComplete }) => {
    assert.equal(style, "refill");
    assert.equal(definition.vfx, "refill-water");
    refillFinish = onComplete;
  },
}, () => 5_000);
assert.equal(refill.execute("water", "up", () => { refillApplied += 1; }, WATER_REFILL_ACTION_DEFINITION), true);
assert.equal(refillApplied, 0, "refill does not mutate water before the scoop animation completes");
refillFinish();
assert.equal(refillApplied, 1);
assert.equal(refill.isActive(), false);

let emptyFinish: () => void = () => undefined;
const empty = new ToolActionSystem({
  playAction: ({ style, definition, onComplete }) => {
    assert.equal(style, "pour");
    assert.equal(definition.vfx, "empty-water");
    emptyFinish = onComplete;
  },
}, () => 6_000);
assert.equal(empty.execute("water", "right", () => undefined, EMPTY_WATER_ACTION_DEFINITION), true);
emptyFinish();

assert.deepEqual(PLANTED_SEED_MARKER_OFFSET, { x: 0, y: 2 }, "stage 0 mound is centered with only a 2px downward offset");

const emptyTilled = (): FarmTileData => ({ x: 9, y: 8, tilled: true, wateredToday: true, cropType: null, cropStage: null, plantedDay: null });
const stats = initialPlayerStats();
const tile = emptyTilled();
assert.equal(hasPlantedCrop(tile), false);
assert.equal(undoTilledFarmTile(tile, stats, { axe: 1, pickaxe: 1 }), null);
assert.deepEqual(tile, { x: 9, y: 8, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null });
assert.ok(stats.stamina < stats.maxStamina, "farm undo reuses pickaxe stamina/progression");

const planted = { ...emptyTilled(), cropType: "sproutberry" as const, cropStage: 0, plantedDay: 1 };
const plantedBefore = structuredClone(planted), plantedStats = initialPlayerStats();
assert.equal(hasPlantedCrop(planted), true);
assert.equal(undoTilledFarmTile(planted, plantedStats, { axe: 1, pickaxe: 1 }), "작물이 심겨 있어 땅을 되돌릴 수 없어요.");
assert.deepEqual(planted, plantedBefore, "pickaxe never removes a planted crop");
assert.equal(plantedStats.stamina, plantedStats.maxStamina);
assert.equal(undoTilledFarmTile(emptyTilled(), initialPlayerStats(), { axe: 1, pickaxe: 0 }), "제작대에서 곡괭이를 해금해 주세요.");
const tired = initialPlayerStats(); tired.stamina = 0;
assert.equal(undoTilledFarmTile(emptyTilled(), tired, { axe: 1, pickaxe: 1 }), "체력이 부족합니다. 잠을 자고 회복하세요.");

const interactive: MapObjectDefinition = {
  id: "bed", assetId: "bed", position: { tileX: 7, tileY: 7 },
  collision: { x: -48, y: -28, width: 96, height: 56 },
  interaction: { action: "sleep", area: { startX: 5, endX: 9, startY: 6, endY: 9 } },
};
const grab = beginObjectDrag(interactive, { x: 7.35, y: 6.8 });
const movedPosition = objectDragPosition(grab, { x: 9.35, y: 5.8 }, (value) => Math.round(value * 2) / 2);
assert.deepEqual(movedPosition, { tileX: 9, tileY: 6 }, "drag preserves pointer grab offset and half-tile snap");
const collisionBefore = structuredClone(interactive.collision);
moveMapObject(interactive, movedPosition);
assert.deepEqual(interactive.interaction?.area, { startX: 7, endX: 11, startY: 5, endY: 8 }, "absolute interaction area follows the same drag delta");
assert.deepEqual(interactive.collision, collisionBefore, "relative collision size and offset remain unchanged");
const history = new EditorHistory<MapObjectDefinition>((value) => structuredClone(value));
const afterDrag = structuredClone(interactive);
const beforeDrag = { ...structuredClone(interactive), position: { tileX: 7, tileY: 7 }, interaction: { action: "sleep" as const, area: { startX: 5, endX: 9, startY: 6, endY: 9 } } };
history.push(beforeDrag);
assert.deepEqual(history.undo(afterDrag)?.position, { tileX: 7, tileY: 7 }, "one drag is one undo entry");
assert.deepEqual(history.redo(beforeDrag)?.position, movedPosition, "drag redo restores the dropped position");
assert.deepEqual(JSON.parse(JSON.stringify(afterDrag)), afterDrag, "dragged object remains JSON export/import compatible");

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 200_000), service = new FamilyState(db, () => 200_000);
  const a = await rooms.create("pickaxe-A", "공유 밭", "지우");
  await rooms.join("pickaxe-B", a.room.inviteCode, "수빈");
  const roomId = a.room.id;
  await service.read("pickaxe-A", roomId);
  await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json, ?, json(?)) WHERE room_id=?")
    .bind(`$.\"${a.room.playerId}\"`, JSON.stringify({ items: { sproutberry_seed: 8 }, toolProgression: { axe: 1, pickaxe: 1 } }), roomId).run();
  const firstTile = (await service.read("pickaxe-A", roomId)).world.farm[0];
  const anchor = playerInteractionAnchorFromPosition({ x: 0, y: 0 });
  const poseFor = (target: FarmTileData, selectedTool: "hoe" | "seed" | "pickaxe") => ({
    mapId: "farm", x: (target.x + .5) * 32, y: (target.y - .5) * 32 - anchor.y,
    facing: "down" as const, selectedTool, moving: false,
  });
  const hoed = await service.act("pickaxe-A", roomId, 0, { kind: "tool", tool: "hoe", x: firstTile.x, y: firstTile.y, pose: poseFor(firstTile, "hoe") });
  assert.equal(hoed.world.farm[0].tilled, true);
  const undone = await service.act("pickaxe-A", roomId, hoed.revision, { kind: "tool", tool: "pickaxe", x: firstTile.x, y: firstTile.y, pose: poseFor(firstTile, "pickaxe") });
  assert.equal(undone.world.farm[0].tilled, false);
  assert.equal((await service.read("pickaxe-B", roomId)).world.farm[0].tilled, false, "Family member receives shared pickaxe undo");

  const second = undone.world.farm[1];
  const secondHoed = await service.act("pickaxe-A", roomId, undone.revision, { kind: "tool", tool: "hoe", x: second.x, y: second.y, pose: poseFor(second, "hoe") });
  await assert.rejects(
    service.act("pickaxe-A", roomId, secondHoed.revision, { kind: "tool", tool: "pickaxe", x: second.x, y: second.y, pose: { ...poseFor(second, "pickaxe"), facing: "up" } }),
    (error: unknown) => error instanceof FamilyError && error.status === 400,
    "Family authority rejects a pickaxe target that is not in the reported facing direction",
  );
  assert.equal((await service.read("pickaxe-A", roomId)).world.farm[1].tilled, true);
  await assert.rejects(
    service.act("pickaxe-B", roomId, secondHoed.revision, { kind: "tool", tool: "pickaxe", x: second.x, y: second.y, pose: poseFor(second, "pickaxe") }),
    (error: unknown) => error instanceof FamilyError && error.status === 409,
    "Family authority rejects a locked pickaxe",
  );
  const plantedShared = await service.act("pickaxe-A", roomId, secondHoed.revision, {
    kind: "tool", tool: "seed", cropId: "sproutberry", x: second.x, y: second.y, pose: poseFor(second, "seed"),
  });
  await assert.rejects(
    service.act("pickaxe-A", roomId, plantedShared.revision, { kind: "tool", tool: "pickaxe", x: second.x, y: second.y, pose: poseFor(second, "pickaxe") }),
    (error: unknown) => error instanceof FamilyError && error.status === 409,
    "Family authority protects a planted crop from pickaxe undo",
  );
  assert.equal((await service.read("pickaxe-B", roomId)).world.farm[1].cropStage, 0);
} finally {
  close();
}

assert.equal(MAP_DEFINITIONS.farm.width, 42);
assert.equal(MAP_DEFINITIONS.farm.height, 26);
console.log("In-Play Polish 1.2: action lock, refill/empty water, centered seeds, farm pickaxe, Family sync, and editor object drag passed");
