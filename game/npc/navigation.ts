import { GAME_CONFIG } from "../config";
import { getTileTypeInMap, TILE_TYPE_DEFINITIONS } from "../maps/definitions";
import type { MapDefinition } from "../maps/types";
import type { NpcPoint } from "./types";
const size = GAME_CONFIG.tileSize;
export const npcCellCenter = (p: NpcPoint) => ({ x: (p.x + .5) * size, y: (p.y + .5) * size });
/** Conservative cell mask, including actor radius and warp exclusions. Cardinal routes never corner-cut. */
export function npcCellSafe(map: MapDefinition, p: NpcPoint): boolean {
  const {x,y} = p;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) return false;
  const inside = (r: {startX:number;endX:number;startY:number;endY:number}) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY;
  if (!TILE_TYPE_DEFINITIONS[getTileTypeInMap(map,x,y)].walkable || map.collisionRegions.some(inside) || map.warps.some(w => inside(w.area))) return false;
  // Mark whole obstacle-overlapping cells plus 10px clearance, so their connecting edges are safe too.
  return !map.objects.some(o => {
    if (!o.collision) return false;
    const r = o.collision, left = o.position.tileX * size + r.x - 10, top = o.position.tileY * size + r.y - 10;
    return x * size < left + r.width + 20 && (x+1)*size > left && y*size < top+r.height+20 && (y+1)*size > top;
  });
}
export function npcRoute(map: MapDefinition, from: NpcPoint, to: NpcPoint): NpcPoint[] {
  if (!npcCellSafe(map,from) || !npcCellSafe(map,to)) return [];
  const key = (p:NpcPoint) => `${p.x},${p.y}`, queue=[from], parent=new Map<string,NpcPoint|null>([[key(from),null]]);
  for (let i=0;i<queue.length;i++) {
    const p=queue[i];
    if (key(p)===key(to)) {
      const route:NpcPoint[]=[]; let at:NpcPoint|null=p;
      while(at) { route.unshift(npcCellCenter(at)); at=parent.get(key(at))??null; }
      return route;
    }
    for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
      const next={x:p.x+dx,y:p.y+dy};
      if(npcCellSafe(map,next)&&!parent.has(key(next))) { parent.set(key(next),p);queue.push(next); }
    }
  }
  return [npcCellCenter(from)];
}

/** Check a short interaction ray against actual terrain/obstacle bounds, independent of rendering. */
export function npcLineClear(map:MapDefinition,a:NpcPoint,b:NpcPoint):boolean {
 const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/4));
 for(let i=0;i<=count;i++){
  const x=a.x+(b.x-a.x)*i/count,y=a.y+(b.y-a.y)*i/count,cx=Math.floor(x/size),cy=Math.floor(y/size);
  if(cx<0||cy<0||cx>=map.width||cy>=map.height||!TILE_TYPE_DEFINITIONS[getTileTypeInMap(map,cx,cy)].walkable)return false;
  if(map.collisionRegions.some(r=>cx>=r.startX&&cx<=r.endX&&cy>=r.startY&&cy<=r.endY))return false;
  if(map.objects.some(o=>o.collision&&x>=o.position.tileX*size+o.collision.x&&x<=o.position.tileX*size+o.collision.x+o.collision.width&&y>=o.position.tileY*size+o.collision.y&&y<=o.position.tileY*size+o.collision.y+o.collision.height))return false;
 }return true;
}
