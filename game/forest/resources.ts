import { GAME_CONFIG } from "../config";
import type { ItemId } from "../data/items";
import type { ToolKey } from "../events";
import type { MapDefinition, MapObjectDefinition } from "../maps/types";
import { forestSeed, generateFairyForest, safeForestPosition } from "./generation";
import { INITIAL_TOOL_PROGRESSION } from "../tools/definitions";
import { toolPower } from "../tools/progression";
import type { ToolProgression } from "../tools/types";

export type ForestResourceId = "tree" | "rock" | "ore" | "herb" | "moon_mushroom" | "fairy_bloom";
export const FOREST_RESOURCES: Record<ForestResourceId, { id: ForestResourceId; name: string; tool: ToolKey; hits: number; drop: ItemId; quantity: number }> = {
  tree: { id: "tree", name: "나무", tool: "axe", hits: 3, drop: "wood", quantity: 3 },
  rock: { id: "rock", name: "작은 돌", tool: "hand", hits: 1, drop: "stone", quantity: 1 },
  ore: { id: "ore", name: "채광 바위", tool: "pickaxe", hits: 2, drop: "stone", quantity: 3 },
  herb: { id: "herb", name: "들풀", tool: "hand", hits: 1, drop: "wild_herb", quantity: 1 },
  moon_mushroom: { id: "moon_mushroom", name: "달빛버섯", tool: "hand", hits: 1, drop: "moon_mushroom", quantity: 1 },
  fairy_bloom: { id: "fairy_bloom", name: "요정꽃", tool: "hand", hits: 1, drop: "fairy_bloom", quantity: 1 },
};

export interface ForestState { daySerial: number; depleted: string[]; hits: Record<string, number> }
export const emptyForestState = (daySerial: number): ForestState => ({ daySerial, depleted: [], hits: {} });
export const validForestNodeId = (id: string) => /^(tree|rock|ore|herb|moon_mushroom|fairy_bloom)-\d+-\d+$/.test(id) && id.length <= 48;

/** Unknown/old node IDs and previous-day progress never carry into a fresh layout. */
export function normalizeForestState(value: unknown, daySerial: number, knownIds?: Set<string>): ForestState {
  if (!value || typeof value !== "object" || (value as ForestState).daySerial !== daySerial) return emptyForestState(daySerial);
  const raw = value as ForestState;
  const allowed = (id: string) => validForestNodeId(id) && (!knownIds || knownIds.has(id));
  const depleted = Array.isArray(raw.depleted) ? [...new Set(raw.depleted.filter((id): id is string => typeof id === "string" && allowed(id)))].slice(0, 1024) : [];
  const hits: Record<string, number> = {};
  if (raw.hits && typeof raw.hits === "object" && !Array.isArray(raw.hits)) for (const [id, count] of Object.entries(raw.hits)) {
    const kind = id.split("-")[0] as ForestResourceId;
    if (allowed(id) && !depleted.includes(id) && Number.isInteger(count) && count > 0 && count < FOREST_RESOURCES[kind].hits) hits[id] = count;
  }
  return { daySerial, depleted, hits };
}

/** Herb placement has its own PRNG: adding herbs does not move existing trees or rocks. */
export function herbObjects(map: MapDefinition, scope: string, daySerial: number): MapObjectDefinition[] {
  let state = forestSeed(`${scope}:wild-herbs:v1`, daySerial) || 1;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  const positions: Array<{ x: number; y: number }> = [];
  for (let y = 2; y < map.height - 2; y++) for (let x = 2; x < map.width - 2; x++) {
    const px = (x + .5) * GAME_CONFIG.tileSize, py = (y + .5) * GAME_CONFIG.tileSize;
    if (safeForestPosition(map, px, py) && !(x >= 13 && x <= 18 && y >= 19)) positions.push({ x, y });
  }
  // Partial Fisher-Yates shuffle chooses a reproducible subset without clustering by row.
  const result: MapObjectDefinition[] = [];
  for (let i = 0; i < Math.min(18, positions.length); i++) {
    const j = i + next() % (positions.length - i);
    [positions[i], positions[j]] = [positions[j], positions[i]];
    const { x, y } = positions[i];
    result.push({ id: `herb-${x}-${y}`, assetId: "forest_herb", position: { tileX: x + .5, tileY: y + .5 }, depth: 3 });
  }
  return result;
}

/** Separate streams and free cells preserve all preexisting tree, rock and herb IDs and positions. */
export function rareForageObjects(map: MapDefinition, scope: string, daySerial: number): MapObjectDefinition[] {
  const occupied = new Set(map.objects.map(o => `${o.position.tileX},${o.position.tileY}`));
  const positions: Array<{ x: number; y: number }> = [];
  for (let y = 2; y < map.height - 2; y++) for (let x = 2; x < map.width - 2; x++) {
    const px = (x + .5) * GAME_CONFIG.tileSize, py = (y + .5) * GAME_CONFIG.tileSize;
    if (safeForestPosition(map, px, py) && !occupied.has(`${x + .5},${y + .5}`) && !(x >= 13 && x <= 18 && y >= 19)) positions.push({ x, y });
  }
  const result: MapObjectDefinition[] = [];
  for (const [kind, min, spread, assetId] of [
    ["moon_mushroom", 2, 4, "forest_moon_mushroom"], ["fairy_bloom", 1, 3, "forest_fairy_bloom"],
  ] as const) {
    let state = forestSeed(`${scope}:rare:${kind}:v1`, daySerial) || 1;
    const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
    const count = min + next() % spread;
    const available = positions.filter(p => !occupied.has(`${p.x + .5},${p.y + .5}`));
    for (let i = 0; i < Math.min(count, available.length); i++) {
      const j = i + next() % (available.length - i);
      [available[i], available[j]] = [available[j], available[i]];
      const { x, y } = available[i]; occupied.add(`${x + .5},${y + .5}`);
      result.push({ id: `${kind}-${x}-${y}`, assetId, position: { tileX: x + .5, tileY: y + .5 }, depth: 3 });
    }
  }
  return result;
}

/** Mining boulders use a new stream and free cells after rare forage; all older nodes remain fixed. */
export function oreObjects(map: MapDefinition, scope: string, daySerial: number): MapObjectDefinition[] {
  let state = forestSeed(`${scope}:mining-ore:v1`, daySerial) || 1;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  const occupied = new Set(map.objects.map(o => `${o.position.tileX},${o.position.tileY}`));
  const positions: Array<{ x: number; y: number }> = [];
  for (let y = 2; y < map.height - 2; y++) for (let x = 2; x < map.width - 2; x++) {
    if (occupied.has(`${x + .5},${y + .5}`) || (x >= 13 && x <= 18 && y >= 19)) continue;
    if (safeForestPosition(map, (x + .5) * GAME_CONFIG.tileSize, (y + .5) * GAME_CONFIG.tileSize)) positions.push({ x, y });
  }
  const count = 5 + next() % 4;
  const result: MapObjectDefinition[] = [];
  for (let i = 0; i < Math.min(count, positions.length); i++) {
    const j = i + next() % (positions.length - i);
    [positions[i], positions[j]] = [positions[j], positions[i]];
    const { x, y } = positions[i];
    // No collision: adding resource nodes cannot sever an otherwise reachable route.
    result.push({ id: `ore-${x}-${y}`, assetId: "forest_ore", position: { tileX: x + .5, tileY: y + .5 }, depth: 3 });
  }
  return result;
}

/** Both client registry and family server derive precisely the same canonical node set. */
export function generateResourceForest(scope: string, daySerial: number): MapDefinition {
  const map = generateFairyForest(scope, daySerial);
  map.objects.push(...herbObjects(map, scope, daySerial));
  map.objects.push(...rareForageObjects(map, scope, daySerial));
  map.objects.push(...oreObjects(map, scope, daySerial));
  return map;
}

export const resourceKind = (object: MapObjectDefinition): ForestResourceId | null =>
  object.id.startsWith("tree-") && object.assetId === "tree" ? "tree" :
  object.id.startsWith("rock-") && object.assetId === "forest_rock" ? "rock" :
  object.id.startsWith("ore-") && object.assetId === "forest_ore" ? "ore" :
  object.id.startsWith("herb-") && object.assetId === "forest_herb" ? "herb" :
  object.id.startsWith("moon_mushroom-") && object.assetId === "forest_moon_mushroom" ? "moon_mushroom" :
  object.id.startsWith("fairy_bloom-") && object.assetId === "forest_fairy_bloom" ? "fairy_bloom" : null;

export function findForestResource(map: MapDefinition, target: { x: number; y: number }, player: { x: number; y: number }) {
  return map.objects.filter(o => resourceKind(o))
    .map(o => ({ object: o, distance: Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - target.x, o.position.tileY * GAME_CONFIG.tileSize - target.y),
      reach: Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - player.x, o.position.tileY * GAME_CONFIG.tileSize - player.y) }))
    .filter(o => o.distance <= 26 && o.reach <= 58).sort((a, b) => a.distance - b.distance)[0]?.object;
}

export function strikeForestNode(state: ForestState, object: MapObjectDefinition, tool: ToolKey, progression: ToolProgression = INITIAL_TOOL_PROGRESSION) {
  const kind = resourceKind(object);
  if (!kind || state.depleted.includes(object.id)) return { state, message: "이미 채집한 자원이에요." };
  const definition = FOREST_RESOURCES[kind];
  if (tool !== definition.tool) return { state, message: `${definition.name}: ${definition.tool === "axe" ? "도끼" : definition.tool === "pickaxe" ? "곡괭이" : "손"}을(를) 사용해 주세요.` };
  const power = tool === "axe" || tool === "pickaxe" ? toolPower(progression, tool) : 1;
  if (!power) return { state, message: "먼저 제작대에서 곡괭이를 해금해 주세요." };
  const count = (state.hits[object.id] ?? 0) + power;
  if (count < definition.hits) return { state: { ...state, hits: { ...state.hits, [object.id]: count } }, message: `${definition.name} ${count}/${definition.hits}회`, remaining: definition.hits - count };
  const hits = { ...state.hits }; delete hits[object.id];
  return { state: { ...state, hits, depleted: [...state.depleted, object.id] }, message: `${definition.name}에서 ${definition.quantity}개를 얻었어요.`, drop: definition.drop, quantity: definition.quantity, remaining: 0 };
}
