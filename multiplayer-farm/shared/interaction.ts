import type { Entity, Facing } from "./world.js";

export const TOOLS = ["axe", "pickaxe", "scythe", "hoe", "water"] as const;
export type Tool = (typeof TOOLS)[number];
export const isTool = (value?: string): value is Tool => TOOLS.includes(value as Tool);
/** One 32px tile, only 20px beyond the player's 12px collision radius. */
export const BASE_PICKUP_RADIUS = 32;
// Movement can stop at 32.00000000000045px beside a solid stump. Preserve the
// one-tile radius while accepting subpixel floating-point drift at its boundary.
export const PICKUP_RANGE_EPSILON = .001;
export const PICKUP_SCAN_MS = 120;
export const DROP_SETTLE_MS = 800;
/** Future equipment must supply this bonus from server-owned member data. */
export const pickupRadius = (equipmentBonus = 0) => BASE_PICKUP_RADIUS + Math.max(0, Math.min(128, equipmentBonus));
export const cuttableGrass = (e: Pick<Entity, "kind" | "asset">) =>
  e.kind === "gather" && /^(farm_(short_grass|tall_grass|clover|weed(?:_b|_c)?))$/.test(e.asset);

/** A committed event, never a stream of animation coordinates. */
export interface ActionFx {
  id: string;
  actorId: string;
  area: string;
  x: number;
  y: number;
  facing: Facing;
  tool: Tool | "hand";
  outcome: "hit" | "break" | "fail" | "pickup";
  target?: Pick<Entity, "id" | "kind" | "asset" | "x" | "y" | "stage" | "species" | "item" | "quantity">;
  drops: Array<Pick<Entity, "id" | "x" | "y" | "item" | "quantity">>;
}
export const impactDelay = (tool: ActionFx["tool"]) => tool === "hand" ? 0 : 140;
export const breakDuration = (target?: ActionFx["target"]) =>
  target?.kind === "tree" ? 460 + target.stage * 130 : target?.kind === "rock" ? 260 : 200;
export const dropAppearDelay = (fx: ActionFx) => impactDelay(fx.tool) +
  (fx.outcome === "break" ? breakDuration(fx.target) * .8 : 0);

/** Rebuilt only on a committed world change. The 30Hz loop checks nearby buckets. */
export class DropIndex {
  private cells = new Map<string, Entity[]>();
  rebuild(entities: Iterable<Entity>): void {
    this.cells.clear();
    for (const e of entities) if (e.kind === "drop") {
      const key = `${e.area}:${Math.floor(e.x/64)}:${Math.floor(e.y/64)}`;
      const cell = this.cells.get(key) ?? [];
      cell.push(e); this.cells.set(key,cell);
    }
  }
  nearby(area: string,x: number,y: number,r = pickupRadius()): Entity[] {
    r += PICKUP_RANGE_EPSILON;
    const out: Entity[] = [];
    for (let cy=Math.floor((y-r)/64);cy<=Math.floor((y+r)/64);cy++)
      for (let cx=Math.floor((x-r)/64);cx<=Math.floor((x+r)/64);cx++)
        for (const e of this.cells.get(`${area}:${cx}:${cy}`) ?? [])
          if ((e.x-x)**2+(e.y-y)**2 <= r*r) out.push(e);
    return out.sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2));
  }
}
