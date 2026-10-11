import type { Entity, World } from "./world.js";
import type { MapObject } from "./content.js";
import { TILE, mapFor, tileIn } from "./content.js";
import { terrainAt, hasZone } from "./world2.js";
import { collidesWithObstacle } from "./applyMovement.js";
import { TREES, inferSpecies, natureRoll, treeHp, stumpSprite } from "./nature.js";
export interface NaturePlacementIndex { readonly cells: Map<string, Entity[]>; }
const natureCellKey = (area: string, x: number, y: number) => `${area}:${x},${y}`;
export function recordNaturePlacement(index: NaturePlacementIndex, e: Entity): void {
  const key = natureCellKey(e.area, Math.floor(e.x / TILE), Math.floor(e.y / TILE));
  const cell = index.cells.get(key);
  if (cell) cell.push(e);
  else index.cells.set(key, [e]);
}
/** Generation passes use their own index; actions always read current world entities. */
export function buildNaturePlacementIndex(w: World): NaturePlacementIndex {
  const index: NaturePlacementIndex = { cells: new Map() };
  for (const e of Object.values(w.entities)) recordNaturePlacement(index, e);
  return index;
}
function nearbyIndexedNature(index: NaturePlacementIndex, area: string, x: number, y: number, radius: number): Entity[] {
  const found: Entity[] = [];
  for (let yy = y - radius; yy <= y + radius; yy++)
    for (let xx = x - radius; xx <= x + radius; xx++)
      for (const e of index.cells.get(natureCellKey(area, xx, yy)) ?? []) found.push(e);
  return found;
}


export function initializeTree(w: World, e: Entity, authored?: MapObject, planted = false): void {
  const p = authored?.tree;
  e.species = TREES[e.species ?? ""] ? e.species : inferSpecies(p?.species || e.asset, e.id);
  e.stage = Math.max(0, Math.min(4, Number.isInteger(e.stage) ? e.stage : 2));
  e.treeBornDay ??= w.day;
  e.treeStageDay ??= w.day;
  e.treeLastGrowthDay ??= w.day;
  e.planted ??= p?.planted ?? planted;
  e.chopEnabled ??= p?.chop !== false;
  e.regrow ??= p?.regrow ?? false;
  e.treeDrop ??= p?.drop ?? "";
  if (e.kind === "tree") e.asset = `${e.species}_${["seedling","young","mature","giant","guardian"][e.stage]}`;
  else if (e.kind === "stump") {
    e.asset = stumpSprite(e.species,e.stage,e.asset);
    if (!Number.isFinite(e.hp) || e.hp <= 0) e.hp = 3;
  }
}

/** One roll per elapsed world day, persisted before another checkpoint/reload. */
export function growTrees(w: World): void {
  // A juvenile has no physical stump. Retain its original ID/species and the
  // seven-day regrowth clock without putting an invisible obstacle in entities.
  for (const [id,e] of Object.entries(w.treeRegrowth ?? {})) {
    if (w.day - (e.treeStageDay ?? w.day) < 7) continue;
    const occupied = Object.values(w.entities).some(other => other.area === e.area && other.kind !== "drop" &&
      Math.floor(other.x/TILE) === Math.floor(e.x/TILE) && Math.floor(other.y/TILE) === Math.floor(e.y/TILE));
    // Player-built fields/objects always win; retry on a later day after removal.
    if (occupied || w.entities[id]) continue;
    e.kind="tree"; e.stage=0; e.hp=treeHp(0); e.treeStageDay=w.day; e.treeLastGrowthDay=w.day;
    initializeTree(w,e); w.entities[id]=e; delete w.treeRegrowth![id];
  }
  for (const e of Object.values(w.entities)) {
    if (e.kind !== "tree" && e.kind !== "stump") continue;
    initializeTree(w, e);
    for (let day = e.treeLastGrowthDay! + 1; day <= w.day; day++) {
      const age = day - e.treeStageDay!, t = TREES[e.species!]!;
      e.treeLastGrowthDay = day;
      if (e.kind === "stump") {
        if (!e.regrow || age < 7) continue;
        e.kind = "tree"; e.stage = 0; e.treeStageDay = day; e.hp = treeHp(0);
      } else {
        const promote = e.stage < 2 ? age >= t.days[e.stage]! :
          e.stage === 2 ? age >= t.giantMinDays && natureRoll(w.seed,day,e.id,"giant") < t.giantChance :
          e.stage === 3 && age >= t.guardianMinDays && natureRoll(w.seed,day,e.id,"guardian") < t.guardianChance;
        if (!promote) continue;
        const damage = Math.max(0, treeHp(e.stage) - e.hp);
        e.stage++; e.treeStageDay = day; e.hp = Math.max(1,treeHp(e.stage)-damage);
      }
      e.asset = `${e.species}_${["seedling","young","mature","giant","guardian"][e.stage]}`;
    }
  }
}

export function markCleared(w: World, e: Pick<Entity,"area"|"x"|"y">): void {
  w.natureCleared ??= {};
  w.natureCleared[`${e.area}:${Math.floor(e.x/TILE)},${Math.floor(e.y/TILE)}`] = w.day;
}

/** Protect enclosed player gardens without introducing another saved zone system. */
export function fencedInterior(w: World, area: string): Set<string> {
  const map = mapFor(area,w.layout?.maps), walls = new Set<string>();
  for (const e of Object.values(w.entities))
    if (e.area===area && /fence/.test(e.asset)) walls.add(`${Math.floor(e.x/TILE)},${Math.floor(e.y/TILE)}`);
  for (const o of map.objects)
    if (o.visible!==false && /fence/.test(o.assetId)) walls.add(`${Math.floor(o.position.tileX)},${Math.floor(o.position.tileY)}`);
  if (walls.size < 4) return new Set();
  const outside=new Set<string>(), queue: [number,number][]=[];
  const add=(x:number,y:number)=>{const k=`${x},${y}`;if(x<0||y<0||x>=map.width||y>=map.height||walls.has(k)||outside.has(k))return;outside.add(k);queue.push([x,y]);};
  for(let x=0;x<map.width;x++){add(x,0);add(x,map.height-1);}
  for(let y=0;y<map.height;y++){add(0,y);add(map.width-1,y);}
  for(let i=0;i<queue.length;i++){const [x,y]=queue[i]!;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
  const inside=new Set(walls);
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++)if(!outside.has(`${x},${y}`))inside.add(`${x},${y}`);
  return inside;
}

/** Authority checks natural ground, authored protection and current live entities. */
export function naturalPlacement(w: World, area: string, x: number, y: number,
  purpose: "tree"|"debris", enclosed = new Set<string>(), treeSpacing = 3,
  spatial?: NaturePlacementIndex): boolean {
  const map = mapFor(area,w.layout?.maps);
  if (area !== "farm" || x < 1 || y < 1 || x >= map.width-1 || y >= map.height-1) return false;
  if (!/^(grass|dark_grass|meadow)$/.test(terrainAt(map,x,y))) return false;
  if (hasZone(map,"no-placement",x,y) || collidesWithObstacle((x+.5)*TILE,(y+.5)*TILE,area,w.layout?.maps)) return false;
  if (map.spawns.some(s=>Math.hypot(x+.5-s.tileX,y+.5-s.tileY)<3)) return false;
  if (map.warps.some(p=>tileIn({startX:p.area.startX-1,endX:p.area.endX+1,startY:p.area.startY-1,endY:p.area.endY+1},x,y))) return false;
  if (purpose==="debris" && (enclosed.has(`${x},${y}`) || w.day-(w.natureCleared?.[`${area}:${x},${y}`] ?? -100)<7)) return false;
  if (purpose==="debris" && Object.values(w.treeRegrowth ?? {}).some(e=>e.area===area && Math.floor(e.x/TILE)===x && Math.floor(e.y/TILE)===y)) return false;
  for (const o of map.objects) {
    if(o.visible===false)continue;
    const dx=x+.5-o.position.tileX, dy=y+.5-o.position.tileY;
    if(o.kind==="tree" || o.assetId.startsWith("tree")) {
      // Removed harvestables no longer reserve land; static border trees do.
      if ((!o.kind || w.entities[o.id]) && Math.hypot(dx,dy)<(purpose==="tree"?treeSpacing:2)) return false;
    } else if (o.kind==="well" || o.assetId==="stone_well") {
      if(Math.abs(dx)<3 && Math.abs(dy)<3)return false;
    } else if(o.collision) {
      const c=o.collision, pad=purpose==="debris"?2:1;
      if(dx>=c.x/TILE-pad && dx<= (c.x+c.width)/TILE+pad && dy>=c.y/TILE-pad && dy<=(c.y+c.height)/TILE+pad)return false;
    } else if (o.kind || /house|store|shed|coop|bench|flower|planter|lamp|fence|bridge/.test(o.assetId)) {
      if(Math.abs(dx)<Math.max(1,(o.width??2)/2) && Math.abs(dy)<Math.max(1,(o.height??2)/2))return false;
    }
  }
  const nearby = spatial
    ? nearbyIndexedNature(spatial, area, x, y, Math.ceil(Math.max(3, treeSpacing)) + 1)
    : Object.values(w.entities);
  for (const e of nearby) {
    if(e.area!==area)continue;
    const dx=e.x/TILE-(x+.5),dy=e.y/TILE-(y+.5);
    if(Math.floor(e.x/TILE)===x && Math.floor(e.y/TILE)===y)return false;
    if((e.kind==="tree"||e.kind==="stump") && Math.hypot(dx,dy)<(purpose==="tree"?treeSpacing:2))return false;
    if(["decoration","machine","well","chest","craft","barn","trough"].includes(e.kind) && Math.abs(dx)<2 && Math.abs(dy)<2)return false;
  }
  return true;
}
