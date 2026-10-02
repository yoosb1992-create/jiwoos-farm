import { strict as assert } from "node:assert";
import { ToolActionSystem, type ToolAnimationPort } from "../actions/ToolActionSystem";
import { resolveToolTarget } from "../actions/ToolTargetResolver";
import { DEFAULT_CROP_ID } from "../data/crops";
import { Inventory, type FarmTileData } from "../domain";
import { applyFamilyFarmSnapshot } from "../family/applySnapshot";
import { applyFarmToolEffect, hasPlantedCrop } from "../farm/toolBehavior";
import { emptyFarmTreeState, FARM_TREE_RESOURCE, isFarmTreeObject, strikeFarmTree } from "../farm/trees";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { isGameCanvasPointerEvent } from "../input/worldPointer";
import { interactionTargetPointFromPosition, playerInteractionAnchorFromPosition } from "../player/interaction";
import { initialPlayerStats } from "../player/stats";
import { initialWateringCan } from "../tools/wateringCan";
import { weatherFor } from "../weather/system";
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
    for (const drop of result.drops ?? []) inventory.add(drop.itemId, drop.quantity);
  }), true);
  if (hit < FARM_TREE_RESOURCE.hits) assert.equal(treeState.hits[tree.id], hit, `axe visual also applies hit ${hit}/3`);
  finish();
}
assert.ok(treeState.stumps.includes(tree.id), "third axe action turns the pine into a stump");
assert.equal(inventory.count("wood"), 1, "the final axe action awards one wood");
assert.equal(inventory.count("pine_needles"), 1, "the final axe action awards pine needles once");
assert.equal(inventory.count("pine_cone"), 1, "the final axe action awards a pine cone once");

const capturePlayer = { x: 304, y: 224 };
const captured = resolveToolTarget({
  tool: "hoe", facing: "down", mapId: "farm", inputSource: "keyboard", player: capturePlayer,
  playerAnchor: playerInteractionAnchorFromPosition(capturePlayer), targetWorld: { x: 304, y: 272 },
  map: MAP_DEFINITIONS.farm, farmTile: tile,
});
const movedPlayer = { x: 999, y: 999 };
assert.deepEqual(captured.player, { x: 304, y: 224 });
assert.deepEqual(captured.targetTile, { x: 9, y: 8 });
assert.equal(captured.targetKind, "farm_tile");
assert.notDeepEqual(captured.player, movedPlayer, "animation-time player movement cannot change the captured action target");
let visualContext: typeof captured | undefined;
const contextBridge = new ToolActionSystem({ playAction: (request) => { visualContext = request.context; request.onComplete(); } }, () => 50_000);
assert.equal(contextBridge.execute("hoe", "down", () => undefined, undefined, captured), true);
assert.equal(visualContext, captured, "animation and VFX receive the exact immutable gameplay context");
assert.ok(visualCount >= 8, "all gameplay mutations were paired with a visual action");

const canvasTarget = new EventTarget();
const mobileActionButton = new EventTarget();
assert.equal(isGameCanvasPointerEvent(canvasTarget, canvasTarget), true, "direct world clicks still use pointer targeting");
assert.equal(isGameCanvasPointerEvent(mobileActionButton, canvasTarget), false,
  "window-level touch from the mobile action button cannot consume the real command with a visual-only action");

const routePlayer = { x: (tile.x + .5) * 32, y: (tile.y - .5) * 32 - playerInteractionAnchorFromPosition({ x: 0, y: 0 }).y };
const routeFront = interactionTargetPointFromPosition(routePlayer, "down");
for (const inputSource of ["keyboard", "mobile", "pointer"] as const) {
  const routeTile: FarmTileData = { x: tile.x, y: tile.y, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null };
  const resolved = resolveToolTarget({
    tool: "hoe", facing: "down", mapId: "farm", inputSource, player: routePlayer,
    playerAnchor: playerInteractionAnchorFromPosition(routePlayer), targetWorld: routeFront,
    map: MAP_DEFINITIONS.farm, farmTile: routeTile,
  });
  assert.equal(resolved.targetKind, "farm_tile", `${inputSource} input uses the shared target resolver`);
  assert.deepEqual(resolved.targetTile, { x: tile.x, y: tile.y });
  let inputVisuals = 0, inputRenders = 0, inputSnapshot: FarmTileData | undefined;
  const inputActions = new ToolActionSystem({ playAction: ({ context, onComplete }) => {
    assert.equal(context, resolved); inputVisuals += 1; onComplete();
  } }, () => 60_000);
  assert.equal(inputActions.execute(resolved.tool, resolved.facing, () => {
    const result = applyFarmToolEffect("hoe", routeTile, effectContext());
    if (result.changed) { inputRenders += 1; inputSnapshot = { ...routeTile }; }
  }, undefined, resolved), true);
  assert.equal(routeTile.tilled, true);
  assert.deepEqual([inputVisuals, inputRenders, inputSnapshot?.tilled], [1, 1, true],
    `${inputSource} follows resolver → effect → visual → renderer/snapshot`);
}

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 300_000);
  const service = new FamilyState(db, () => 300_000);
  const session = await rooms.create("pipeline-family", "도구 통합", "지우");
  const roomId = session.room.id;
  await service.read("pipeline-family", roomId);
  const dryDay = Array.from({ length: 40 }, (_, index) => index + 1).find((day) => weatherFor(roomId, day).id !== "rain")!;
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json, '$.day', ?, '$.daySerial', ?) WHERE room_id=?")
    .bind(dryDay, dryDay, roomId).run();
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
  await act("water");
  assert.equal(familySnapshot.world.farm[0].tilled, true);
  assert.equal(familySnapshot.world.farm[0].cropStage, 0);
  assert.equal(familySnapshot.world.farm[0].wateredToday, true);
  assert.equal(familySnapshot.inventory.items.sproutberry_seed, 7);
  assert.equal(familySnapshot.wateringCan!.currentWater, familySnapshot.wateringCan!.capacity - 1);

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
