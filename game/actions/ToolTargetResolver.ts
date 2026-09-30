import type { Facing } from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import type { FarmTileData } from "../domain";
import type { ToolKey } from "../events";
import { findFarmTree, type FarmTreeState } from "../farm/trees";
import { findForestResource } from "../forest/resources";
import { getTileTypeInMap, pointInTileRect } from "../maps/definitions";
import type { MapDefinition } from "../maps/types";
import { findMineResource } from "../mine/resources";

export type ToolTargetKind =
  | "farm_tile"
  | "water_source"
  | "farm_tree"
  | "forest_resource"
  | "mine_resource"
  | "fishing_water"
  | "interactive"
  | "none";

export type ToolInputSource = "keyboard" | "mobile" | "pointer" | "family";

export type ToolUseContext = Readonly<{
  tool: ToolKey;
  facing: Facing;
  mapId: string;
  inputSource: ToolInputSource;
  player: Readonly<{ x: number; y: number }>;
  targetWorld: Readonly<{ x: number; y: number }>;
  targetTile: Readonly<{ x: number; y: number }>;
  targetKind: ToolTargetKind;
  targetObjectId?: string;
}>;

export type ToolTargetResolverInput = {
  tool: ToolKey;
  facing: Facing;
  mapId: string;
  inputSource: ToolInputSource;
  player: { x: number; y: number };
  playerAnchor: { x: number; y: number };
  targetWorld: { x: number; y: number };
  map: MapDefinition;
  farmTile?: FarmTileData;
  farmTreeState?: FarmTreeState;
  fishingWaterValid?: boolean;
};

const freezePoint = (point: { x: number; y: number }) => Object.freeze({ x: point.x, y: point.y });

/**
 * Resolve a tool target exactly once at input time. The returned snapshot is
 * immutable and is safe to share with gameplay, Family requests and visuals.
 */
export function resolveToolTarget(input: ToolTargetResolverInput): ToolUseContext {
  const targetTile = {
    x: Math.floor(input.targetWorld.x / GAME_CONFIG.tileSize),
    y: Math.floor(input.targetWorld.y / GAME_CONFIG.tileSize),
  };
  let targetKind: ToolTargetKind = "none";
  let targetObjectId: string | undefined;

  const inBounds = targetTile.x >= 0 && targetTile.y >= 0 && targetTile.x < input.map.width && targetTile.y < input.map.height;
  if (input.tool === "water" && inBounds && getTileTypeInMap(input.map, targetTile.x, targetTile.y) === "water") {
    targetKind = "water_source";
  } else if (input.mapId === "farm" && input.tool === "axe") {
    const tree = findFarmTree(input.map, input.targetWorld, input.playerAnchor, input.farmTreeState);
    if (tree) { targetKind = "farm_tree"; targetObjectId = tree.id; }
  } else if (input.mapId === "fairy_forest") {
    const node = findForestResource(input.map, input.targetWorld, input.playerAnchor);
    if (node) { targetKind = "forest_resource"; targetObjectId = node.id; }
  } else if (input.mapId.startsWith("mine_")) {
    const node = findMineResource(input.map, input.targetWorld, input.playerAnchor);
    if (node) { targetKind = "mine_resource"; targetObjectId = node.id; }
  } else if (input.tool === "fishing_rod" && input.fishingWaterValid && inBounds &&
      Math.hypot(input.targetWorld.x - input.playerAnchor.x, input.targetWorld.y - input.playerAnchor.y) <= 64 &&
      getTileTypeInMap(input.map, targetTile.x, targetTile.y) === "water") {
    targetKind = "fishing_water";
  } else if (input.mapId === "farm" && input.farmTile) {
    targetKind = "farm_tile";
  } else {
    const interactive = input.map.objects.find((object) => object.interaction && pointInTileRect(input.targetWorld.x, input.targetWorld.y, object.interaction.area));
    if (interactive) { targetKind = "interactive"; targetObjectId = interactive.id; }
  }

  return Object.freeze({
    tool: input.tool,
    facing: input.facing,
    mapId: input.mapId,
    inputSource: input.inputSource,
    player: freezePoint(input.player),
    targetWorld: freezePoint(input.targetWorld),
    targetTile: freezePoint(targetTile),
    targetKind,
    ...(targetObjectId ? { targetObjectId } : {}),
  });
}
