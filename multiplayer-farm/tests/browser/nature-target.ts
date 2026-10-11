import type { Page } from "@playwright/test";
import { collidesWithObstacle, isFarmable, prepareDynamicObstacles } from "../../shared/applyMovement.js";
import { findPath } from "../../shared/pathfinding.js";
import { naturalPlacement } from "../../shared/nature-world.js";
import { TILE } from "../../shared/content.js";
import type { World, Entity } from "../../shared/world.js";

type Target = { x: number; y: number; screenX: number; screenY: number };

/** The extremely dense first-day meadow is dynamic; tests cannot assume a
 * particular pixel is clear or reachable. Select a real accessible target,
 * honor BOTH live server obstacles and editor static scenery, then tap it. */
export async function reachableNatureTarget(page: Page, mode: "till" | "tree"): Promise<Target | undefined> {
  const current = await page.evaluate(() => ({
    state: window.__FARM_DEBUG__.state(),
    actor: window.__FARM_DEBUG__.snapshot().players.find(p => p.local),
  }));
  const { state, actor } = current;
  if (!state || !actor) return undefined;
  const layout = JSON.parse(state.layout);
  const maps = layout.maps;
  const world = { ...state, layout } as unknown as World;
  const entities = Object.values(state.entities) as Entity[];
  const obstacles = prepareDynamicObstacles(entities);
  const occupied = new Set(entities.filter(e => e.area === "farm")
    .map(e => `${Math.floor(e.x / TILE)},${Math.floor(e.y / TILE)}`));
  const cx = Math.floor(actor.authoritativeX / TILE);
  const cy = Math.floor(actor.authoritativeY / TILE);
  const points: Array<{x:number;y:number;distance:number}> = [];
  const farm = maps.farm;
  for (let y = Math.max(2,cy-18); y < Math.min(farm.height-1,cy+18); y++)
    for (let x = Math.max(2,cx-18); x < Math.min(farm.width-1,cx+18); x++) {
      const dist = Math.abs(x - cx) + Math.abs(y - cy);
      if (dist < 4 || dist > 34 || occupied.has(`${x},${y}`) ||
          (mode === "till" && !isFarmable("farm",x,y,maps)) ||
          collidesWithObstacle((x+.5)*TILE,(y+.5)*TILE,"farm",maps,obstacles)) continue;
      if (mode === "tree" && !naturalPlacement(world,"farm",x,y,"tree")) continue;
      points.push({x,y,distance:dist});
    }
  points.sort((a,b)=>a.distance-b.distance);
  const onscreen = await page.evaluate((candidates) => candidates.map(tile => {
    const screen = window.__FARM_DEBUG__.screenPoint((tile.x+.5)*32,(tile.y+.5)*32);
    const element = document.elementFromPoint(screen.x,screen.y);
    const debug = window.__FARM_DEBUG__ as typeof window.__FARM_DEBUG__ & {
      pickWorld(x:number,y:number): { entityId?:string;npcId?:string;warpId?:string;x:number;y:number };
    };
    const picked = element?.tagName === "CANVAS" ? debug.pickWorld(screen.x,screen.y) : undefined;
    return { ...tile, screenX:screen.x, screenY:screen.y,
      valid: !!picked && !picked.entityId && !picked.npcId && !picked.warpId &&
        Math.floor(picked.x / 32) === tile.x && Math.floor(picked.y / 32) === tile.y };
  }).filter(tile=>tile.valid), points);
  for (const tile of onscreen) {
    const target = (p:{x:number;y:number}) =>
      Math.abs(Math.floor(p.x / TILE)-tile.x) +
      Math.abs(Math.floor(p.y / TILE)-tile.y) === 1;
    const path = findPath("farm",{ x:actor.authoritativeX, y:actor.authoritativeY },target,maps,obstacles);
    if (path && path.length <= 25) return tile;
  }
  return undefined;
}
