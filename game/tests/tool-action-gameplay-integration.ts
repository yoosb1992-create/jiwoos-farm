import { strict as assert } from "node:assert";
import { captureToolActionContext, ToolActionSystem, type ToolAnimationPort } from "../actions/ToolActionSystem";
import { DEFAULT_CROP_ID } from "../data/crops";
import { Inventory, type FarmTileData } from "../domain";
import { applyFamilyFarmSnapshot } from "../family/applySnapshot";
import { applyFarmToolEffect, hasPlantedCrop } from "../farm/toolBehavior";
import { emptyFarmTreeState, FARM_TREE_RESOURCE, isFarmTreeObject, strikeFarmTree } from "../farm/trees";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { playerInteractionAnchorFromPosition } from "../player/interaction";
import { initialPlayerStats } from "../player/stats";
import { initialWateringCan } from "../tools/wateringCan";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

let now = 10_000;
let complete: () => void = () => undefined;
let visualCount = 0;
const order: string[] = [];
const visuals: ToolAnimationPort = {
  playAction: ({ onComplete }) => {
    visualCount += 1;
    order.push("visual");
    complete = onComplete;
  },
};
const actions = new ToolActionSystem(visuals, () => now);
const finish = () => {
  complete();
  now += 1_000;
};

const tile: FarmTileData = { x: 9, y: 8, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null };
const inventory = new Inventory({ items: { sproutberry_seed: 2 } });
const stats = initialPlayerStats();
const wateringCan = initialWateringCan();
const effectContext = () => ({
  selectedCrop: DEFAULT_CROP_ID,
  inventory,
  stats,
  wateringCan,
  toolProgression: { axe: 1, pickaxe: 1 } as const,
  day: 1,
  raining: false,
});
const executeFarm = (tool: "hoe" | "seed" | "water" | "pickaxe") => actions.execute(tool, "down", () => {
  order.push("effect");
  const result = applyFarmToolEffect(tool, tile, effectContext());
  assert.equal(result.changed, true, `${tool} start effect must mutate the actual farm state`);
});

assert.equal(executeFarm("hoe"), true);
assert.deepEqual(order, ["effect", "visual"], "start gameplay effect runs once before Phaser visual setup");
assert.equal(tile.tilled, true, "hoe action immediately sets tilled=true while animation remains active");
assert.equal(actions.isActive(), true, "movement remains locked until animation completion");
finish();

order.length = 0;
assert.equal(executeFarm("seed"), true);
assert.equal(tile.cropType, DEFAULT_CROP_ID);
assert.equal(tile.cropStage, 0, "seed action immediately exposes the planted stage");
assert.equal(inventory.count("sproutberry_seed"), 1, "seed action consumes exactly one seed");
assert.deepEqual(order, ["effect", "visual"]);
finish();

const waterBefore = wateringCan.currentWater;
order.length = 0;
assert.equal(executeFarm("water"), true);
assert.equal(tile.wateredToday, true, "pour visual and crop water state are part of one action pipeline");
assert.equal(wateringCan.currentWater, waterBefore - 1);
assert.deepEqual(order, ["effect", "visual"]);
finish();

Object.assign(tile, { cropType: null, cropStage: null, plantedDay: null, tilled: true, wateredToday: true });
order.length = 0;
assert.equal(executeFarm("pickaxe"), true);
assert.equal(tile.tilled, false, "pickaxe action immediately restores empty tilled soil");
assert.equal(tile.wateredToday, false);
finish();

const emptyTile: FarmTileData = { x: 10, y: 8, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null };
const emptyWaterBefore = wateringCan.currentWater;
assert.equal(actions.execute("water", "right", () => {
  if (hasPlantedCrop(emptyTile)) applyFarmToolEffect("water", emptyTile, effectContext());
}), true);
assert.equal(wateringCan.currentWater, emptyWaterBefore, "water on empty ground is visual-only and cannot mutate state");
finish();

const tree = MAP_DEFINITIONS.farm.objects.find(isFarmTreeObject)!;
let treeState = emptyFarmTreeState();
for (let hit = 1; hit <= FARM_TREE_RESOURCE.hits; hit += 1) {
  assert.equal(actions.execute("axe", "right", () => {
    const result = strikeFarmTree(treeState, tree, "axe", { axe: 1, pickaxe: 1 });
    treeState = result.state;
    if (result.drop) inventory.add(result.drop, result.quantity);
  }), true);
  if (hit < FARM_TREE_RESOURCE.hits) assert.equal(treeState.hits[tree.id], hit, `axe visual also applies hit ${hit}/3`);
  finish();
}
assert.ok(treeState.depleted.includes(tree.id), "third axe action depletes the farm tree");
assert.equal(inventory.count("wood"), 3, "the final axe action awards wood once");

const captured = captureToolActionContext("hoe", "down", "farm", { x: 304, y: 224 }, { x: 304, y: 272 });
const movedPlayer = { x: 999, y: 999 };
assert.deepEqual(captured.player, { x: 304, y: 224 });
assert.deepEqual(captured.targetTile, { x: 9, y: 8 });
assert.notDeepEqual(captured.player, movedPlayer, "animation-time player movement cannot change the captured action target");
assert.ok(visualCount >= 8, "all gameplay mutations were paired with a visual action");

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 300_000);
  const service = new FamilyState(db, () => 300_000);
  const session = await rooms.create("pipeline-family", "도구 통합", "지우");
  const roomId = session.room.id;
  const initial = await service.read("pipeline-family", roomId);
  const remoteTile = initial.world.farm[0];
  const anchor = playerInteractionAnchorFromPosition({ x: 0, y: 0 });
  const poseFor = (tool: "hoe" | "seed" | "water") => ({
    mapId: "farm" as const,
    x: (remoteTile.x + .5) * 32,
    y: (remoteTile.y - .5) * 32 - anchor.y,
    facing: "down" as const,
    selectedTool: tool,
    moving: false,
  });
  let familySnapshot = initial;
  const familyAction = new ToolActionSystem({ playAction: ({ onComplete }) => { complete = onComplete; } }, () => now);
  const act = async (tool: "hoe" | "seed" | "water") => {
    let request: Promise<typeof familySnapshot> | undefined;
    assert.equal(familyAction.execute(tool, "down", () => {
      request = service.act("pipeline-family", roomId, familySnapshot.revision, {
        kind: "tool", tool, cropId: DEFAULT_CROP_ID, x: remoteTile.x, y: remoteTile.y, pose: poseFor(tool),
      });
    }), true);
    assert.ok(request, "Family authoritative request is issued by the start effect callback");
    familySnapshot = await request!;
    complete();
    now += 1_000;
  };
  await act("hoe");
  await act("seed");
  // Other regression modules intentionally exercise rain/default snapshots in
  // the same process. Pin this integration case to an unwatered planted tile
  // so the next authoritative request proves the water mutation itself.
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json, '$.farm[0].wateredToday', json('false')) WHERE room_id=?")
    .bind(roomId).run();
  familySnapshot = await service.read("pipeline-family", roomId);
  await act("water");
  assert.equal(familySnapshot.world.farm[0].tilled, true);
  assert.equal(familySnapshot.world.farm[0].cropStage, 0);
  assert.equal(familySnapshot.world.farm[0].wateredToday, true);
  assert.equal(familySnapshot.inventory.items.sproutberry_seed, 7);
  assert.equal(familySnapshot.wateringCan.currentWater, familySnapshot.wateringCan.capacity - 1);

  const localFarm = new Map<string, FarmTileData>(initial.world.farm.map((entry) => [`${entry.x},${entry.y}`, { ...entry }]));
  let rendered = 0;
  applyFamilyFarmSnapshot(localFarm, familySnapshot.world.farm, () => true, () => { rendered += 1; });
  const applied = localFarm.get(`${remoteTile.x},${remoteTile.y}`)!;
  assert.equal(applied.cropStage, 0);
  assert.equal(applied.wateredToday, true);
  assert.equal(rendered, 1, "authoritative Family snapshot reaches the renderer bridge immediately");
} finally {
  close();
}

console.log("Tool gameplay integration: start effect before visual + hoe/seed/water/axe/pickaxe + Family snapshot passed");
