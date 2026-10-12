import { TILE, type MapData } from "./content.js";
import { collidesWithObstacle } from "./applyMovement.js";
import { findPath } from "./pathfinding.js";

/** Activate existing furniture without replacing its art, position or collision. */
export function activateHomeFurniture(maps: Record<string, MapData>): void {
  const home = maps.farmhouse;
  if (!home) return;
  for (const o of home.objects) {
    if (o.decorative || o.visible === false || o.kind) continue;
    if (o.assetId === "bed") o.kind = "bed";
    if (o.assetId === "storage_chest") o.kind = "chest";
    if (o.assetId === "crafting_table") o.kind = "craft";
  }
  if (home.objects.some(o => o.kind === "bed" && o.visible !== false)) return;
  // A custom/older home may lack a bed. Find a clear, reachable footprint and
  // leave all authored furniture, entry points and return warps untouched.
  const spawn = home.spawns.find(s => s.id === "entry") ?? home.spawns[0];
  if (!spawn) return;
  for (let y = 3; y < home.height - 3; y++) for (let x = 3; x < home.width - 3; x++) {
    const clear = [-1, 0, 1].every(dx => [-1, 0, 1, 2].every(dy =>
      !collidesWithObstacle((x + dx) * TILE, (y + dy) * TILE, home.id, maps) &&
      !home.warps.some(w => x + dx >= w.area.startX - 1 && x + dx <= w.area.endX + 1 &&
        y + dy >= w.area.startY - 1 && y + dy <= w.area.endY + 1) &&
      !home.spawns.some(s => Math.hypot(s.tileX - x - dx, s.tileY - y - dy) < 1)));
    if (!clear) continue;
    const path = findPath(home.id, { x: spawn.tileX * TILE, y: spawn.tileY * TILE },
      p => Math.hypot(p.x - x * TILE, p.y - (y + 2) * TILE) < 24, maps);
    if (!path) continue;
    let id = "home-sleep-bed";
    const ids = new Set(Object.values(maps).flatMap(m => m.objects.map(o => o.id)));
    while (ids.has(id)) id += "-new";
    home.objects.push({ id, assetId: "bed", kind: "bed", label: "침대 · 잠자기",
      position: { tileX: x, tileY: y },
      collision: { x: -48, y: -28, width: 96, height: 56 } });
    return;
  }
}
