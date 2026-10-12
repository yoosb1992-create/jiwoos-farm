import { editorHeaders } from "./editor-auth.js";
import { expect, type Page } from "@playwright/test";
import { collidesWithObstacle, isFarmable, prepareDynamicObstacles } from "../../shared/applyMovement.js";
import { findPath } from "../../shared/pathfinding.js";
import { naturalPlacement } from "../../shared/nature-world.js";
import { TILE } from "../../shared/content.js";
import type { World, Entity } from "../../shared/world.js";

type Target = { x: number; y: number; screenX: number; screenY: number };

/** Cold software rendering can trigger the existing backlog reconnect. Wait
 * for live server acknowledgements before a test sends its first touch. */
export async function waitForFarmInput(page: Page): Promise<void> {
  let settledAt=0,connection=-1;
  await expect.poll(async()=>{
    const s=await page.evaluate(()=>window.__FARM_DEBUG__.snapshot());
    // In-flight inputs include normal RTT and slow software-rendered frames;
    // their count is not the server's backlog. Observe committed progress on
    // one uninterrupted connection instead of imposing a fixed queue budget.
    if(s.status!=="connected"||!s.local||s.reconnectCount!==connection){
      connection=s.reconnectCount;settledAt=s.acknowledgedInputs;return false;
    }
    return s.acknowledgedInputs-settledAt>=60;
  },{timeout:25000,intervals:[150]}).toBe(true);
}

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
    // A newly cultivable tile can sit exactly on a tree crown's hit-box edge.
    // Touch coordinates are rounded differently from JS camera coordinates;
    // require a small clear tap area instead of trusting a floating-point edge.
    const clear = element?.tagName === "CANVAS" && [[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy]) => {
      const picked = debug.pickWorld(screen.x+dx!,screen.y+dy!);
      return !picked.entityId && !picked.npcId && !picked.warpId &&
        Math.floor(picked.x / 32) === tile.x && Math.floor(picked.y / 32) === tile.y;
    });
    return { ...tile, screenX:screen.x, screenY:screen.y,
      valid: clear };
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


/** Browser test fixture: a real server-published editable blueprint, with
 * no randomly generated meadow blockers, makes tool controls deterministic.
 * Dense first-day nature and tile authority remain covered by integration
 * and default farm tests against the actual production generator. */
export async function clearWorldBlueprint(page: Page, spawnX: number, spawnY: number): Promise<string> {
  const backend = "http://127.0.0.1:2575";
  const defaults = await page.request.get(`${backend}/api/blueprints/defaults`);
  if (!defaults.ok()) throw Error("Cannot fetch editable test layout: " + await defaults.text());
  const layout = await defaults.json();
  delete layout.maps.farm.world2;
  const farmEntry = layout.maps.farm.spawns.find((s: {id:string}) => s.id === "farm_entry");
  if (!farmEntry) throw Error("Missing default farm spawn");
  farmEntry.tileX = spawnX;
  farmEntry.tileY = spawnY;
  const draftResponse = await page.request.post(`${backend}/api/blueprints`, {headers:await editorHeaders(page),data: layout});
  if (!draftResponse.ok()) throw Error("Cannot create test blueprint: " + await draftResponse.text());
  const draft = await draftResponse.json();
  const published = await page.request.post(`${backend}/api/blueprints/${draft.id}`, {
    headers: { Authorization: `Bearer ${draft.editToken}` },
    data: { layout, revision: draft.revision, publish: true },
  });
  if (!published.ok()) throw Error("Cannot publish test blueprint: " + await published.text());
  // Seed the initial selection once. Later editor publishing must be able to
  // replace it, including across navigation and creation of a second farm.
  await page.addInitScript((id: string) => {
    if (!localStorage.getItem("farm-active-blueprint")) localStorage.setItem("farm-active-blueprint", id);
  }, draft.id);
  return draft.id;
}
