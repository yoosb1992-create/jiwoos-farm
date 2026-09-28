import { GAME_CONFIG } from "../config";
import type { ItemId } from "../data/items";
import type { ToolKey } from "../events";
import type { MapDefinition, MapObjectDefinition } from "../maps/types";
import { forestSeed, safeForestPosition } from "./generation";

export type ForestResourceId = "tree" | "rock" | "herb";
export const FOREST_RESOURCES: Record<ForestResourceId, { id: ForestResourceId; name: string; tool: ToolKey; hits: number; drop: ItemId; quantity: number }> = {
  tree: { id: "tree", name: "나무", tool: "axe", hits: 3, drop: "wood", quantity: 3 },
  rock: { id: "rock", name: "작은 돌", tool: "hand", hits: 1, drop: "stone", quantity: 1 },
  herb: { id: "herb", name: "들풀", tool: "hand", hits: 1, drop: "wild_herb", quantity: 1 },
};

export interface ForestState { daySerial: number; depleted: string[]; hits: Record<string, number> }
export const emptyForestState = (daySerial: number): ForestState => ({ daySerial, depleted: [], hits: {} });
const validId = (id: string) => /^(tree|rock|herb)-\d+-\d+$/.test(id);

/** Unknown/old node IDs and previous-day progress never carry into a fresh layout. */
export function normalizeForestState(value: unknown, daySerial: number, knownIds?: Set<string>): ForestState {
  if (!value || typeof value !== "object" || (value as ForestState).daySerial !== daySerial) return emptyForestState(daySerial);
  const raw = value as ForestState;
  const allowed = (id: string) => validId(id) && (!knownIds || knownIds.has(id));
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

export const resourceKind = (object: MapObjectDefinition): ForestResourceId | null =>
  object.id.startsWith("tree-") && object.assetId === "tree" ? "tree" :
  object.id.startsWith("rock-") && object.assetId === "forest_rock" ? "rock" :
  object.id.startsWith("herb-") && object.assetId === "forest_herb" ? "herb" : null;

export function findForestResource(map: MapDefinition, target: { x: number; y: number }, player: { x: number; y: number }) {
  return map.objects.filter(o => resourceKind(o))
    .map(o => ({ object: o, distance: Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - target.x, o.position.tileY * GAME_CONFIG.tileSize - target.y),
      reach: Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - player.x, o.position.tileY * GAME_CONFIG.tileSize - player.y) }))
    .filter(o => o.distance <= 26 && o.reach <= 58).sort((a, b) => a.distance - b.distance)[0]?.object;
}

export function strikeForestNode(state: ForestState, object: MapObjectDefinition, tool: ToolKey) {
  const kind = resourceKind(object);
  if (!kind || state.depleted.includes(object.id)) return { state, message: "이미 채집한 자원이에요." };
  const definition = FOREST_RESOURCES[kind];
  if (tool !== definition.tool) return { state, message: `${definition.name}: ${definition.tool === "axe" ? "도끼" : "손"}을(를) 사용해 주세요.` };
  const count = (state.hits[object.id] ?? 0) + 1;
  if (count < definition.hits) return { state: { ...state, hits: { ...state.hits, [object.id]: count } }, message: `${definition.name} ${count}/${definition.hits}회`, remaining: definition.hits - count };
  const hits = { ...state.hits }; delete hits[object.id];
  return { state: { ...state, hits, depleted: [...state.depleted, object.id] }, message: `${definition.name}에서 ${definition.quantity}개를 얻었어요.`, drop: definition.drop, quantity: definition.quantity, remaining: 0 };
}
