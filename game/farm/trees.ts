import { GAME_CONFIG } from "../config";
import type { ItemId } from "../data/items";
import type { ToolKey } from "../events";
import type { MapDefinition, MapObjectDefinition } from "../maps/types";
import { interactionTargetPointFromPosition, playerInteractionAnchorFromPosition } from "../player/interaction";
import { INITIAL_TOOL_PROGRESSION } from "../tools/definitions";
import { toolPower } from "../tools/progression";
import type { ToolProgression } from "../tools/types";
import type { Facing } from "../assets/definitions";

export type FarmTreeStage = "sprout" | "young" | "mature" | "giant" | "guardian";

export interface FarmTreeState {
  hits: Record<string, number>;
  depleted: string[];
  stumps: string[];
  stages: Record<string, FarmTreeStage>;
  ages: Record<string, number>;
}

export interface FarmTreeDrop {
  itemId: ItemId;
  quantity: number;
}

export interface FarmTreeStrikeResult {
  state: FarmTreeState;
  message: string;
  remaining?: number;
  drops?: FarmTreeDrop[];
  felled?: boolean;
  stumpRemoved?: boolean;
}

export const FARM_TREE_RESOURCE = {
  hits: 3,
} as const;

export const FARM_STUMP_RESOURCE = {
  hits: 3,
} as const;

export const PINE_TREE_DROPS: readonly FarmTreeDrop[] = [
  { itemId: "wood", quantity: 1 },
  { itemId: "pine_needles", quantity: 1 },
  { itemId: "pine_cone", quantity: 1 },
];

export const FARM_TREE_GROWTH = {
  sproutDays: 3,
  youngDays: 5,
  matureMinimumDays: 8,
  matureDailyGiantChance: 0.15,
  giantMinimumDays: 12,
  giantDailyGuardianChance: 0.05,
} as const;

/**
 * Runtime first-pass sizing. The current tree art is deliberately scaled up so
 * the farm keeps the "small character / large environment" composition while
 * dedicated pine sprites are produced later.
 */
export const FARM_TREE_STAGE_DISPLAY_SIZE: Record<FarmTreeStage, { width: number; height: number }> = {
  sprout: { width: 52, height: 64 },
  young: { width: 96, height: 120 },
  mature: { width: 176, height: 216 },
  giant: { width: 240, height: 300 },
  guardian: { width: 304, height: 384 },
};

export const emptyFarmTreeState = (): FarmTreeState => ({
  hits: {},
  depleted: [],
  stumps: [],
  stages: {},
  ages: {},
});

export const isFarmTreeObject = (object: MapObjectDefinition) =>
  object.id.startsWith("farm_tree_") &&
  (object.assetId === "tree" || object.assetId === "tree_variant_a" || object.assetId === "tree_variant_b");

export const farmTreeIds = (map: MapDefinition) => new Set(map.objects.filter(isFarmTreeObject).map((object) => object.id));

export const isFarmTreeStage = (value: unknown): value is FarmTreeStage =>
  value === "sprout" || value === "young" || value === "mature" || value === "giant" || value === "guardian";

export const farmTreeStage = (state: FarmTreeState, id: string): FarmTreeStage => state.stages[id] ?? "mature";

const pointToRectDistance = (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) => {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
};

/** Resource hits use the authored trunk collision, never the oversized crown. */
export const farmTreeTrunkRect = (object: MapObjectDefinition) => {
  const position = { x: object.position.tileX * GAME_CONFIG.tileSize, y: object.position.tileY * GAME_CONFIG.tileSize };
  const collision = object.collision ?? { x: -11, y: -9, width: 22, height: 18 };
  return { x: position.x + collision.x, y: position.y + collision.y, width: collision.width, height: collision.height };
};

/** SaveData v4 and old Family worlds may omit the growth/stump fields. Unknown
 * object ids are discarded so editor changes cannot turn arbitrary objects into
 * resources. Legacy active trees intentionally begin as mature trees. */
export function normalizeFarmTreeState(value: unknown, knownIds: Set<string>): FarmTreeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyFarmTreeState();
  const raw = value as Partial<FarmTreeState>;
  const depleted = Array.isArray(raw.depleted)
    ? [...new Set(raw.depleted.filter((id): id is string => typeof id === "string" && knownIds.has(id)))].slice(0, knownIds.size)
    : [];
  const depletedSet = new Set(depleted);
  const stumps = Array.isArray(raw.stumps)
    ? [...new Set(raw.stumps.filter((id): id is string => typeof id === "string" && knownIds.has(id) && !depletedSet.has(id)))].slice(0, knownIds.size)
    : [];
  const stumpSet = new Set(stumps);

  const hits: Record<string, number> = {};
  if (raw.hits && typeof raw.hits === "object" && !Array.isArray(raw.hits)) {
    for (const [id, count] of Object.entries(raw.hits)) {
      if (knownIds.has(id) && !depletedSet.has(id) && typeof count === "number" && Number.isInteger(count) && count > 0 && count < 3) hits[id] = count;
    }
  }

  const stages: Record<string, FarmTreeStage> = {};
  if (raw.stages && typeof raw.stages === "object" && !Array.isArray(raw.stages)) {
    for (const [id, stage] of Object.entries(raw.stages)) {
      if (knownIds.has(id) && !depletedSet.has(id) && !stumpSet.has(id) && isFarmTreeStage(stage)) stages[id] = stage;
    }
  }

  const ages: Record<string, number> = {};
  if (raw.ages && typeof raw.ages === "object" && !Array.isArray(raw.ages)) {
    for (const [id, age] of Object.entries(raw.ages)) {
      if (knownIds.has(id) && !depletedSet.has(id) && !stumpSet.has(id) && typeof age === "number" && Number.isFinite(age) && age >= 0) {
        ages[id] = Math.min(36_500, Math.floor(age));
      }
    }
  }

  return { hits, depleted, stumps, stages, ages };
}

const deterministicGrowthRoll = (id: string, daySerial: number, target: string) => {
  let hash = 2166136261;
  const key = `${id}:${daySerial}:${target}`;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967296;
};

/** Advances all surviving farm trees exactly once when the world advances a day. */
export function advanceFarmTreeDay(state: FarmTreeState, knownIds: Set<string>, daySerial: number): FarmTreeState {
  const normalized = normalizeFarmTreeState(state, knownIds);
  const hits = { ...normalized.hits };
  const stages = { ...normalized.stages };
  const ages = { ...normalized.ages };
  const unavailable = new Set([...normalized.depleted, ...normalized.stumps]);

  for (const id of knownIds) {
    if (unavailable.has(id)) continue;
    const current = farmTreeStage(normalized, id);
    let next = current;
    let age = Math.min(36_500, (ages[id] ?? 0) + 1);

    if (current === "sprout" && age >= FARM_TREE_GROWTH.sproutDays) next = "young";
    else if (current === "young" && age >= FARM_TREE_GROWTH.youngDays) next = "mature";
    else if (current === "mature" && age >= FARM_TREE_GROWTH.matureMinimumDays &&
      deterministicGrowthRoll(id, daySerial, "giant") < FARM_TREE_GROWTH.matureDailyGiantChance) next = "giant";
    else if (current === "giant" && age >= FARM_TREE_GROWTH.giantMinimumDays &&
      deterministicGrowthRoll(id, daySerial, "guardian") < FARM_TREE_GROWTH.giantDailyGuardianChance) next = "guardian";

    if (next !== current) {
      age = 0;
      delete hits[id];
    }
    stages[id] = next;
    ages[id] = age;
  }

  return {
    hits,
    depleted: [...normalized.depleted],
    stumps: [...normalized.stumps],
    stages,
    ages,
  };
}

export function findFarmTree(
  map: MapDefinition,
  target: { x: number; y: number },
  player: { x: number; y: number },
  state: FarmTreeState = emptyFarmTreeState(),
) {
  return map.objects.filter((object) => isFarmTreeObject(object) && !state.depleted.includes(object.id))
    .map((object) => {
      const trunk = farmTreeTrunkRect(object);
      return { object, targetDistance: pointToRectDistance(target, trunk), reach: pointToRectDistance(player, trunk) };
    })
    .filter((candidate) => candidate.targetDistance <= 24 && candidate.reach <= 54)
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
): FarmTreeStrikeResult {
  if (!isFarmTreeObject(object) || state.depleted.includes(object.id)) return { state, message: "이미 제거한 나무 자리예요." };
  if (tool !== "axe") return { state, message: "농장 나무와 그루터기는 도끼로 작업할 수 있어요." };

  const stump = state.stumps.includes(object.id);
  const requiredHits = stump ? FARM_STUMP_RESOURCE.hits : FARM_TREE_RESOURCE.hits;
  const count = (state.hits[object.id] ?? 0) + toolPower(progression, "axe");
  if (count < requiredHits) {
    return {
      state: { ...state, hits: { ...state.hits, [object.id]: count } },
      message: `${stump ? "그루터기" : "소나무"} ${count}/${requiredHits}회`,
      remaining: requiredHits - count,
    };
  }

  const hits = { ...state.hits };
  delete hits[object.id];

  if (stump) {
    return {
      state: {
        ...state,
        hits,
        stumps: state.stumps.filter((id) => id !== object.id),
        depleted: [...new Set([...state.depleted, object.id])],
      },
      message: "그루터기를 제거했어요.",
      remaining: 0,
      stumpRemoved: true,
    };
  }

  const stages = { ...state.stages };
  const ages = { ...state.ages };
  delete stages[object.id];
  delete ages[object.id];
  return {
    state: {
      ...state,
      hits,
      stumps: [...new Set([...state.stumps, object.id])],
      stages,
      ages,
    },
    message: "소나무를 베어 목재 1개, 솔잎 1개, 솔방울 1개를 얻었어요.",
    drops: PINE_TREE_DROPS.map((drop) => ({ ...drop })),
    remaining: 0,
    felled: true,
  };
}
