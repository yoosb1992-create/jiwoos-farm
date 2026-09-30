import { GAME_CONFIG } from "../config";
import type { ToolKey } from "../events";
import type { MapDefinition, MapObjectDefinition } from "../maps/types";
import { interactionTargetPointFromPosition, playerInteractionAnchorFromPosition } from "../player/interaction";
import { INITIAL_TOOL_PROGRESSION } from "../tools/definitions";
import { toolPower } from "../tools/progression";
import type { ToolProgression } from "../tools/types";
import type { Facing } from "../assets/definitions";

export interface FarmTreeState {
  hits: Record<string, number>;
  depleted: string[];
}

export const FARM_TREE_RESOURCE = {
  hits: 3,
  drop: "wood" as const,
  quantity: 3,
};

export const emptyFarmTreeState = (): FarmTreeState => ({ hits: {}, depleted: [] });

export const isFarmTreeObject = (object: MapObjectDefinition) =>
  object.id.startsWith("farm_tree_") &&
  (object.assetId === "tree" || object.assetId === "tree_variant_a" || object.assetId === "tree_variant_b");

export const farmTreeIds = (map: MapDefinition) => new Set(map.objects.filter(isFarmTreeObject).map((object) => object.id));

/** SaveData v4 and old Family worlds may omit this field. Unknown object ids are
 * discarded so editor changes cannot turn arbitrary map objects into resources. */
export function normalizeFarmTreeState(value: unknown, knownIds: Set<string>): FarmTreeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyFarmTreeState();
  const raw = value as Partial<FarmTreeState>;
  const depleted = Array.isArray(raw.depleted)
    ? [...new Set(raw.depleted.filter((id): id is string => typeof id === "string" && knownIds.has(id)))].slice(0, knownIds.size)
    : [];
  const hits: Record<string, number> = {};
  if (raw.hits && typeof raw.hits === "object" && !Array.isArray(raw.hits)) {
    for (const [id, count] of Object.entries(raw.hits)) {
      if (knownIds.has(id) && !depleted.includes(id) && typeof count === "number" && Number.isInteger(count) && count > 0 && count < FARM_TREE_RESOURCE.hits) hits[id] = count;
    }
  }
  return { hits, depleted };
}

export function findFarmTree(
  map: MapDefinition,
  target: { x: number; y: number },
  player: { x: number; y: number },
  state: FarmTreeState,
) {
  return map.objects.filter((object) => isFarmTreeObject(object) && !state.depleted.includes(object.id))
    .map((object) => {
      const x = object.position.tileX * GAME_CONFIG.tileSize, y = object.position.tileY * GAME_CONFIG.tileSize;
      return { object, targetDistance: Math.hypot(x - target.x, y - target.y), reach: Math.hypot(x - player.x, y - player.y) };
    })
    .filter((candidate) => candidate.targetDistance <= 30 && candidate.reach <= 64)
    .sort((a, b) => a.targetDistance - b.targetDistance)[0]?.object;
}

/** Server authority independently derives the lower-body target in the reported
 * facing direction. Proximity alone is insufficient, so trees behind the player
 * cannot be hit. */
export function farmTreeInFacingReach(
  map: MapDefinition,
  object: MapObjectDefinition,
  pose: { x: number; y: number; facing: Facing },
) {
  const target = interactionTargetPointFromPosition(pose, pose.facing);
  const anchor = playerInteractionAnchorFromPosition(pose);
  return findFarmTree(map, target, anchor, emptyFarmTreeState())?.id === object.id;
}

export function strikeFarmTree(
  state: FarmTreeState,
  object: MapObjectDefinition,
  tool: ToolKey,
  progression: ToolProgression = INITIAL_TOOL_PROGRESSION,
) {
  if (!isFarmTreeObject(object) || state.depleted.includes(object.id)) return { state, message: "이미 벤 나무예요." };
  if (tool !== "axe") return { state, message: "농장 나무는 도끼로 벨 수 있어요." };
  const count = (state.hits[object.id] ?? 0) + toolPower(progression, "axe");
  if (count < FARM_TREE_RESOURCE.hits) {
    return {
      state: { ...state, hits: { ...state.hits, [object.id]: count } },
      message: `나무 ${count}/${FARM_TREE_RESOURCE.hits}회`,
      remaining: FARM_TREE_RESOURCE.hits - count,
    };
  }
  const hits = { ...state.hits };
  delete hits[object.id];
  return {
    state: { hits, depleted: [...state.depleted, object.id] },
    message: `나무를 베어 목재 ${FARM_TREE_RESOURCE.quantity}개를 얻었어요.`,
    drop: FARM_TREE_RESOURCE.drop,
    quantity: FARM_TREE_RESOURCE.quantity,
    remaining: 0,
  };
}
