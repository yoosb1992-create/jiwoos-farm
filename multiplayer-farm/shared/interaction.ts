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
  action?: string;
  /** Surface contact and result are a single committed event, not frame data. */
  point?: { x: number; y: number };
  hpAfter?: number;
  hpBefore?: number;
  maxHp?: number;
  target?: Pick<Entity, "id" | "kind" | "asset" | "x" | "y" | "stage" | "species" | "item" | "quantity">;
  drops: Array<Pick<Entity, "id" | "x" | "y" | "item" | "quantity">>;
}
export type ToolMotion = "horizontal_chop" | "overhead_chop" | "overhead_mine" | "horizontal_cut" | "watering" | "tilling" | "hand_gather" | "refill";
export interface ToolTiming { windup: number; impact: number; hold: number; follow: number; duration: number }
/** Shared presentation clock: tool contact, sound, object reaction and drop
 * readiness all derive from the same definition. Authority still commits now. */
export const TOOL_TIMINGS: Record<ToolMotion,ToolTiming> = {
  horizontal_chop:{windup:175,impact:265,hold:42,follow:395,duration:600},
  overhead_chop:{windup:185,impact:280,hold:40,follow:380,duration:580},
  overhead_mine:{windup:215,impact:315,hold:48,follow:440,duration:660},
  horizontal_cut:{windup:105,impact:175,hold:12,follow:275,duration:430},
  watering:{windup:180,impact:290,hold:0,follow:600,duration:820},
  tilling:{windup:195,impact:295,hold:35,follow:430,duration:640},
  hand_gather:{windup:120,impact:235,hold:15,follow:320,duration:480},
  refill:{windup:140,impact:240,hold:0,follow:440,duration:640},
};
export function toolMotion(fx: Pick<ActionFx,"tool"|"target"|"action">): ToolMotion {
  if(fx.tool==="axe") return fx.target?.kind==="tree" ? "horizontal_chop" : "overhead_chop";
  if(fx.tool==="pickaxe") return "overhead_mine";
  if(fx.tool==="scythe") return "horizontal_cut";
  if(fx.tool==="hoe") return "tilling";
  if(fx.tool==="water") return fx.action==="refill" ? "refill" : "watering";
  return "hand_gather";
}
export const actionTiming = (fx: Pick<ActionFx,"tool"|"target"|"action">) => TOOL_TIMINGS[toolMotion(fx)];
export const impactDelay = (fx: Pick<ActionFx,"tool"|"target"|"action">) => actionTiming(fx).impact;
export const breakDuration = (target?: ActionFx["target"]) =>
  target?.kind === "tree" ? target.stage < 2 ? 200 + target.stage * 110 : 460 + target.stage * 130 : target?.kind === "rock" ? 260 : 200;
export const dropAppearDelay = (fx: ActionFx) => impactDelay(fx) +
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
