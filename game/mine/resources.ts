import { GAME_CONFIG } from "../config";
import type { ItemId } from "../data/items";
import type { MapDefinition, MapObjectDefinition } from "../maps/types";
import { toolPower } from "../tools/progression";
import type { ToolProgression } from "../tools/types";
import { generateMineFloor, MINE_PLAYABLE_FLOORS } from "./generation";
import type { MineDailyState, MineFloorState, MineProgress, MineResourceKind } from "./types";

export const MINE_RESOURCES: Record<MineResourceKind | "stair", { name: string; hits: number; drop: ItemId; quantity: number }> = {
  stone: { name: "바위", hits: 2, drop: "stone", quantity: 2 },
  copper: { name: "구리 광맥", hits: 3, drop: "copper_ore", quantity: 2 },
  stair: { name: "사다리 바위", hits: 2, drop: "stone", quantity: 1 },
};
export const initialMineProgress = (): MineProgress => ({ deepestUnlockedFloor: 1 });
export const emptyMineDaily = (daySerial: number): MineDailyState => ({ daySerial, floors: {} });
export function normalizeMineProgress(value: unknown): MineProgress {
  const deepest = (value as MineProgress | null)?.deepestUnlockedFloor;
  return { deepestUnlockedFloor: typeof deepest === "number" && Number.isSafeInteger(deepest) && deepest >= 1 ? Math.min(deepest, MINE_PLAYABLE_FLOORS) : 1 };
}
export function mineResourceKind(node: MapObjectDefinition): MineResourceKind | "stair" | null {
  if (node.id === "stair-stone-12-5" && node.assetId === "mine_stone") return "stair";
  if (/^stone-\d+-\d+$/.test(node.id) && node.assetId === "mine_stone") return "stone";
  if (/^copper-\d+-\d+$/.test(node.id) && node.assetId === "mine_copper") return "copper";
  return null;
}
export function normalizeMineDaily(value: unknown, daySerial: number, scope: string): MineDailyState {
  if (!value || typeof value !== "object" || (value as MineDailyState).daySerial !== daySerial) return emptyMineDaily(daySerial);
  const raw = (value as MineDailyState).floors;
  const floors: MineDailyState["floors"] = {};
  if (!raw || typeof raw !== "object") return { daySerial, floors };
  for (let floor = 1; floor <= MINE_PLAYABLE_FLOORS; floor++) {
    const source = raw[String(floor)];
    if (!source || typeof source !== "object") continue;
    const known = new Map(generateMineFloor(scope, daySerial, floor).objects.filter(o => mineResourceKind(o)).map(o => [o.id, MINE_RESOURCES[mineResourceKind(o)!].hits]));
    const depleted = Array.isArray(source.depleted) ? [...new Set(source.depleted.filter((id): id is string => typeof id === "string" && known.has(id)))].slice(0, 32) : [];
    const hits: Record<string, number> = {};
    if (source.hits && typeof source.hits === "object") for (const [id, count] of Object.entries(source.hits))
      if (known.has(id) && !depleted.includes(id) && Number.isInteger(count) && count > 0 && count < known.get(id)!) hits[id] = count;
    if (depleted.length || Object.keys(hits).length) floors[floor] = { depleted, hits };
  }
  return { daySerial, floors };
}
export function findMineResource(map: MapDefinition, target: { x: number; y: number }, player: { x: number; y: number }) {
  return map.objects.filter(o => mineResourceKind(o))
    .map(o => ({ node: o, distance: Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - target.x, o.position.tileY * GAME_CONFIG.tileSize - target.y),
      reach: Math.hypot(o.position.tileX * GAME_CONFIG.tileSize - player.x, o.position.tileY * GAME_CONFIG.tileSize - player.y) }))
    .filter(o => o.distance <= 26 && o.reach <= 58).sort((a, b) => a.distance - b.distance)[0]?.node;
}
/** Caller validates tool, stamina, location and day before committing this immutable result. */
export function strikeMineNode(daily: MineDailyState, progress: MineProgress, floor: number, node: MapObjectDefinition, tools: ToolProgression) {
  const kind = mineResourceKind(node), state: MineFloorState = daily.floors[floor] ?? { hits: {}, depleted: [] };
  if (!kind || state.depleted.includes(node.id)) return null;
  const power = toolPower(tools, "pickaxe");
  if (!power) return null;
  const count = (state.hits[node.id] ?? 0) + power;
  if (count < MINE_RESOURCES[kind].hits) return { daily: { ...daily, floors: { ...daily.floors, [floor]: { ...state, hits: { ...state.hits, [node.id]: count } } } }, progress, count, kind };
  const hits = { ...state.hits }; delete hits[node.id];
  return { daily: { ...daily, floors: { ...daily.floors, [floor]: { hits, depleted: [...state.depleted, node.id] } } },
    progress: kind === "stair" ? { deepestUnlockedFloor: Math.min(MINE_PLAYABLE_FLOORS, Math.max(progress.deepestUnlockedFloor, floor + 1)) } : progress,
    count: MINE_RESOURCES[kind].hits, kind, drop: MINE_RESOURCES[kind].drop, quantity: MINE_RESOURCES[kind].quantity };
}
