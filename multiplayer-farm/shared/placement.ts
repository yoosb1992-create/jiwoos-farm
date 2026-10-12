import { ITEMS, mapFor, TILE } from "./content.js";
import { collidesWithObstacle } from "./applyMovement.js";
import { blockedTile, inRect, placementAllowed, terrainAt, waterTerrain } from "./world2.js";
import { adjacentChestIds, mergeChestGroup } from "./chest-groups.js";
import { migrateChestStorage } from "./chest-storage.js";
import { entity, type Actor, type Entity, type World } from "./world.js";

export interface PlacementCell { x: number; y: number }
export interface PlacementPlan { error?: string; cells: PlacementCell[]; world?: World; ids: string[] }
export const adjacentCells = (a: Pick<Actor, "x" | "y">) => {
  const x = Math.floor(a.x / TILE), y = Math.floor(a.y / TILE);
  return [{ tileX: x, tileY: y - 1 }, { tileX: x + 1, tileY: y }, { tileX: x, tileY: y + 1 }, { tileX: x - 1, tileY: y }];
};
/** Pure proposal, also used for client hints. Only the server commits it.
 * A rejected connection never consumes an item or changes a source ledger. */
export function planPlacement(w: World, a: Actor, itemId: string, tileX: number, tileY: number,
  carried?: Entity[], players: Array<Pick<Actor, "area" | "x" | "y">> = [], now = Date.now()): PlacementPlan {
  const definition = ITEMS[itemId]?.placement, size = carried?.length ?? 1;
  const anchor = { x: (tileX + .5) * TILE, y: (tileY + .5) * TILE };
  const dx = tileX - Math.floor(a.x / TILE), dy = tileY - Math.floor(a.y / TILE);
  const offset = dx < 0 ? size - 1 : dy !== 0 ? Math.floor((size - 1) / 2) : 0;
  let base = { x: anchor.x - offset * TILE, y: anchor.y };
  const live = Object.values(w.entities);
  if (definition?.kind === "chest") {
    const snaps = live.filter(e => e.kind === "chest" && e.area === a.area)
      .flatMap(e => [{ x: e.x + TILE, y: e.y }, { x: e.x - size * TILE, y: e.y }])
      .filter(p => Math.hypot(p.x - base.x, p.y - base.y) <= TILE * .72)
      .sort((p, q) => Math.hypot(p.x - base.x, p.y - base.y) - Math.hypot(q.x - base.x, q.y - base.y));
    base = snaps[0] ?? base;
  }
  const cells = Array.from({ length: size }, (_, i) => ({ x: base.x + i * TILE, y: base.y }));
  const fail = (error: string): PlacementPlan => ({ error, cells, ids: [] });
  if (!definition || size < 1 || size > 3) return fail("설치할 수 없는 아이템이에요");
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY) || Math.abs(dx) + Math.abs(dy) !== 1)
    return fail("상하좌우 바로 한 칸에만 설치할 수 있어요");
  const map = mapFor(a.area, w.layout?.maps), portableChest = itemId === "storage_chest";
  // Keep authored interior restrictions for other items. Portable chests only
  // need clear physical ground and protected entrances, indoors or outdoors.
  if (!portableChest && ["farmhouse", "general_store", "workshop", "cafe"].includes(a.area)) return fail("건물 안에는 설치할 수 없어요");
  for (const p of cells) {
    const x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE);
    // Portable chests use physical ground, not the editor's building/no-placement
    // zones. Keep other furniture's authored policies and all movement collisions.
    if (portableChest && (blockedTile(map, x, y) || waterTerrain(terrainAt(map, x, y))))
      return fail("물이나 막힌 지형에는 놓을 수 없어요");
    if (portableChest && (map.warps.some(warp => inRect({
      startX: warp.area.startX - 1, endX: warp.area.endX + 1,
      startY: warp.area.startY - 1, endY: warp.area.endY + 1,
    }, x, y)) || map.spawns.some(s => Math.abs(Math.floor(s.tileX) - x) + Math.abs(Math.floor(s.tileY) - y) <= 1)))
      return fail("문과 출입구 주변은 비워 주세요");
    if (!portableChest && !placementAllowed(map, definition.kind === "decoration" ? "decoration" : "building", x, y))
      return fail("이곳은 설치할 수 없는 땅이에요");
    // Cultivable ground can still accept decoration. Existing soil/crops are
    // occupied entities and are rejected below, independently of building zones.
    if (collidesWithObstacle(p.x, p.y, a.area, w.layout?.maps, live) ||
        live.some(e => e.area === a.area && Math.abs(e.x - p.x) < 26 && Math.abs(e.y - p.y) < 26) ||
        [a, ...players].some(other => other.area === a.area && Math.abs(other.x - p.x) < 26 && Math.abs(other.y - p.y) < 26))
      return fail("이미 물건이나 사람이 있어요");
  }
  if (definition.kind === "decoration" && live.filter(e => e.kind === "decoration").length >= 64) return fail("장식은 최대 64개까지 설치할 수 있어요");
  // All ledgers/settings are copy-on-write: previews cannot mutate the live world.
  const proposed: World = { ...w, entities: { ...w.entities }, chest: { ...w.chest },
    chestStores: { ...w.chestStores }, chestBindings: { ...w.chestBindings },
    chestSettings: { ...w.chestSettings }, chestGroups: { ...w.chestGroups } };
  const ids: string[] = [];
  for (let i = 0; i < size; i++) {
    const p = cells[i]!, original = carried?.[i];
    const id = original?.id ?? `${definition.kind}-${++proposed.nextEntity}`;
    if (proposed.entities[id]) return fail("이미 설치된 물건이에요");
    const placed = original ? { ...original, area: a.area, ...p } : entity(id, a.area, definition.kind, p.x, p.y, ITEMS[itemId]!.assetId);
    if (!original) { placed.item = itemId; placed.owner = a.id; }
    proposed.entities[id] = placed; ids.push(id);
  }
  if (definition.kind === "chest") {
    migrateChestStorage(proposed);
    const neighbors = adjacentChestIds(proposed, ids[0]!);
    if (neighbors.some(id => !ids.includes(id) && proposed.entities[id]!.readyAt > now)) return fail("옆 보관함을 내려놓는 중이에요");
    if (neighbors.length > 3) return fail("보관함은 가로로 최대 3칸까지 연결할 수 있어요");
    if (neighbors.length > size || (!carried && neighbors.length > 1)) {
      const error = mergeChestGroup(proposed, neighbors, carried ? ids[0]! : neighbors.find(id => !ids.includes(id))!);
      if (error) return fail(error);
    }
  }
  return { cells, ids, world: proposed };
}
