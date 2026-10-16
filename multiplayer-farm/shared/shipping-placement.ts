import { TILE, type MapObject } from "./content.js";
import { collidesWithObstacle, prepareDynamicObstacles } from "./applyMovement.js";
import { terrainAt, invalidateObjectIndex } from "./world2.js";
import { findPath } from "./pathfinding.js";
import { entity, type World } from "./world.js";

export const SHIPPING_ASSET = "shipping_crate";
export const shippingObject = (id: string, x: number, y: number): MapObject => ({
  id, assetId: SHIPPING_ASSET, kind: "shipping", label: "판매 꾸러미", layer: "Objects",
  position: { tileX: x, tileY: y }, width: 2.5, height: 2.25,
  collision: { x: -28, y: -14, width: 56, height: 28 },
});

/** Validate the entire footprint, protected live data and a reachable front.
 * Never clear/move an existing object, crop, spawn, portal or player. */
export function shippingPositionSafe(w: World, x: number, y: number, ignoreId?: string): boolean {
  const farm = w.layout?.maps.farm;
  if (!farm || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const maps = { ...w.layout!.maps, farm: { ...farm, objects: farm.objects.filter(o => o.id !== ignoreId) } };
  const entities = Object.values(w.entities).filter(e => e.id !== ignoreId);
  const obstacles = prepareDynamicObstacles(entities);
  const px = x * TILE, py = y * TILE;
  if (x < 2 || y < 2 || x > farm.width - 2 || y > farm.height - 3) return false;
  for (const dx of [-28, 0, 28]) for (const dy of [-14, 0, 14]) {
    const tx = Math.floor((px + dx) / TILE), ty = Math.floor((py + dy) / TILE);
    if (/path|gravel/.test(terrainAt(farm, tx, ty)) ||
      collidesWithObstacle(px + dx, py + dy, "farm", maps, obstacles)) return false;
    if (farm.warps.some(r => tx >= r.area.startX && tx <= r.area.endX && ty >= r.area.startY && ty <= r.area.endY)) return false;
  }
  if ([...entities, ...Object.values(w.treeRegrowth ?? {})].some(e => e.area === "farm" && Math.abs(e.x - px) < 48 && Math.abs(e.y - py) < 34)) return false;
  if (farm.spawns.some(s => Math.abs(s.tileX * TILE - px) < 48 && Math.abs(s.tileY * TILE - py) < 40)) return false;
  if (Object.values(w.members).some(m => { const p = m.carried?.position ?? m.position; return p?.area === "farm" && Math.abs(p.x-px)<48 && Math.abs(p.y-py)<40; })) return false;
  const start = farm.spawns.find(s => s.id === "from_house" || s.id === "house_front") ?? farm.spawns[0];
  if (!start) return false;
  const withCrate = [...entities, entity("shipping-check", "farm", "shipping", px, py, SHIPPING_ASSET)];
  return !!findPath("farm", { x: start.tileX * TILE, y: start.tileY * TILE },
    p => Math.abs(p.x - px) <= 32 && p.y > py + 22 && p.y <= py + 60, maps, withCrate);
}

/** Additive, idempotent compatibility upgrade for every saved/start layout. */
export function ensureShippingCrate(w: World): boolean {
  const farm = w.layout?.maps.farm;
  if (!farm) { w.shippingPlacementNeeded = true; return false; }
  const live = Object.values(w.entities).find(e => e.kind === "shipping");
  if (live) { delete w.shippingPlacementNeeded; return false; }
  const authored = farm.objects.find(o => o.kind === "shipping" || [SHIPPING_ASSET, "sell_basket"].includes(o.assetId));
  if (authored) {
    // Activate an already authored crate without creating another physical copy.
    Object.assign(authored, shippingObject(authored.id, authored.position.tileX, authored.position.tileY));
    w.entities[authored.id] = entity(authored.id, "farm", "shipping", authored.position.tileX*TILE, authored.position.tileY*TILE, SHIPPING_ASSET);
    invalidateObjectIndex(farm);
    delete w.shippingPlacementNeeded;
    return true;
  }
  const home = farm.objects.find(o => o.id === "house" || o.assetId === "house");
  const anchor = home?.position ?? farm.spawns[0];
  if (!anchor) { w.shippingPlacementNeeded = true; return false; }
  const candidates = [{ x: anchor.tileX + 7, y: anchor.tileY + 2.5 }];
  for (let dy = -8; dy <= 12; dy++) for (let dx = 2; dx <= 16; dx++)
    candidates.push({ x: Math.floor(anchor.tileX) + dx + .5, y: Math.floor(anchor.tileY) + dy + .5 });
  candidates.splice(1, candidates.length - 1, ...candidates.slice(1).sort((a,b) =>
    Math.hypot(a.x-candidates[0]!.x,a.y-candidates[0]!.y)-Math.hypot(b.x-candidates[0]!.x,b.y-candidates[0]!.y)));
  const spot = candidates.find(p => shippingPositionSafe(w, p.x, p.y));
  if (!spot) { w.shippingPlacementNeeded = true; return false; }
  let id = "shipping-crate";
  while (w.entities[id] || farm.objects.some(o => o.id === id)) id = `shipping-crate-${++w.nextEntity}`;
  farm.objects.push(shippingObject(id, spot.x, spot.y));
  w.entities[id] = entity(id, "farm", "shipping", spot.x*TILE, spot.y*TILE, SHIPPING_ASSET);
  invalidateObjectIndex(farm);
  w.layoutRevision = (w.layoutRevision ?? 0) + 1;
  delete w.shippingPlacementNeeded;
  return true;
}
