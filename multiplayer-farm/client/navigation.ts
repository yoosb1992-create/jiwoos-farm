import { waterTerrain, terrainAt, hasZone } from "../shared/world2.js";
import { worldNpcSchedule } from "../shared/world2-runtime.js";
import { CLIENT_MAPS as NPC_MAPS } from "./layout.js";
import { findPath, type Point } from "../shared/pathfinding.js";
import { frontTile, type MovementInput } from "../shared/applyMovement.js";
import { TILE, NPCS, npcSchedule, tileIn } from "../shared/content.js";
import { FISHING_SPOTS, fishingSpot } from "../shared/expansion.js";
import type { FarmState } from "../shared/schema.js";
import type { RenderPlayer } from "./network.js";
import { CLIENT_MAPS, mapFor } from "./layout.js";
export type TouchTarget = {
  area: string;
  kind: "ground" | "entity" | "npc" | "warp" | "fish" | "shop";
  id: string;
  x: number;
  y: number;
  signature?: string;
};
const stop: MovementInput = { moveX: 0, moveY: 0, run: false };
const faceOnly = (face: string): MovementInput => ({
  ...stop,
  faceX: face === "right" ? 1 : face === "left" ? -1 : 0,
  faceY: face === "down" ? 1 : face === "up" ? -1 : 0,
});
export class TouchNavigator {
  target?: TouchTarget;
  private path: Point[] = [];
  private started = 0;
  private planned = 0;
  private lastDistance = Infinity;
  private progressAt = 0;
  constructor(
    private notice: (s: string) => void,
    private act: (t: TouchTarget) => void,
  ) {}
  cancel(): void {
    this.target = undefined;
    this.path = [];
  }
  choose(
    point: Point & {
      entityId?: string;
      npcId?: string;
      warpId?: string;
      shop?: boolean;
    },
    me: RenderPlayer,
    state: FarmState,
    groundAction?: string,
  ): void {
    this.cancel();
    const map = mapFor(me.area),
      entity = point.entityId && state.entities.get(point.entityId);
    let t: TouchTarget = {
      area: me.area,
      kind: "ground",
      id: "",
      ...point,
      signature: groundAction,
    };
    if (entity)
      t = {
        ...t,
        kind: "entity",
        id: entity.id,
        x: entity.x,
        y: entity.y,
        signature: entity.kind,
      };
    else if (point.shop) t = { ...t, kind: "shop", id: "shop" };
    else if (point.npcId) t = { ...t, kind: "npc", id: point.npcId };
    else {
      const warp = map.warps.find(
        (w) =>
          w.id === point.warpId ||
          tileIn(
            w.area,
            Math.floor(point.x / TILE),
            Math.floor(point.y / TILE),
          ),
      );
      if (warp)
        t = {
          ...t,
          kind: "warp",
          id: warp.id,
          x: (warp.area.startX + 0.5) * TILE,
          y: (warp.area.startY + 0.5) * TILE,
        };
      else {
        const water = map.world2
            ? waterTerrain(
                terrainAt(
                  map,
                  Math.floor(point.x / TILE),
                  Math.floor(point.y / TILE),
                ),
              )
            : map.terrainRegions.some(
                (r) =>
                  r.tileType === "water" &&
                  tileIn(r, point.x / TILE, point.y / TILE),
              ),
          spot = map.world2
            ? fishingSpot(me.area, point.x, point.y, CLIENT_MAPS)
            : FISHING_SPOTS.filter((s) => s.area === me.area).sort(
                (a, b) =>
                  Math.hypot(a.x * TILE - point.x, a.y * TILE - point.y) -
                  Math.hypot(b.x * TILE - point.x, b.y * TILE - point.y),
              )[0];
        if (
          (water || fishingSpot(me.area, point.x, point.y, CLIENT_MAPS)) &&
          spot
        )
          t = {
            ...t,
            kind: "fish",
            id: spot.water,
            x: (spot.x + 0.5) * TILE,
            y: (spot.y + 0.5) * TILE,
          };
      }
    }
    this.target = t;
    this.started = this.progressAt = performance.now();
    this.planned = 0;
    this.lastDistance = Infinity;
  }
  private updateTarget(state: FarmState): boolean {
    const t = this.target!;
    if (t.kind === "entity") {
      const e = state.entities.get(t.id);
      if (!e || e.area !== t.area || e.kind !== t.signature) return false;
      t.x = e.x;
      t.y = e.y;
    }
    if (t.kind === "npc") {
      const n = NPCS.find((n) => n.id === t.id);
      if (!n) return false;
      const s = authoredNpcSchedule(n, state.day, state.minute);
      if (s.mapId !== t.area) return false;
      t.x = s.from.x * TILE;
      t.y = s.from.y * TILE;
    }
    return true;
  }
  step(
    now: number,
    me: RenderPlayer | undefined,
    state: FarmState | undefined,
    manual: MovementInput,
  ): MovementInput {
    const t = this.target;
    if (!t) return manual;
    if (!me || !state || me.area !== t.area || manual.moveX || manual.moveY) {
      this.cancel();
      return manual;
    }
    if (now - this.started > 30000 || !this.updateTarget(state)) {
      this.notice("대상이 바뀌어 이동을 취소했어요");
      this.cancel();
      return stop;
    }
    const groundAction = t.kind === "ground" && !!t.signature;
    const tileTarget =
      groundAction ||
      (t.kind === "entity" &&
        ["crop", "soil", "withered"].includes(t.signature ?? ""));
    const near = (p: Point) =>
      t.kind === "ground"
        ? groundAction
          ? Math.abs(Math.floor(p.x / TILE) - Math.floor(t.x / TILE)) +
              Math.abs(Math.floor(p.y / TILE) - Math.floor(t.y / TILE)) ===
            1
          : Math.hypot(p.x - t.x, p.y - t.y) <= 24
        : t.kind === "fish"
          ? fishingSpot(t.area, p.x, p.y, CLIENT_MAPS)?.water === t.id &&
            (!mapFor(t.area).world2 || Math.hypot(p.x - t.x, p.y - t.y) <= 80)
          : t.kind === "warp"
            ? !!mapFor(t.area).warps.find(
                (w) =>
                  w.id === t.id &&
                  tileIn(
                    w.area,
                    Math.floor(p.x / TILE),
                    Math.floor(p.y / TILE),
                  ),
              )
            : tileTarget
              ? Math.abs(Math.floor(p.x / TILE) - Math.floor(t.x / TILE)) +
                  Math.abs(Math.floor(p.y / TILE) - Math.floor(t.y / TILE)) ===
                1
              : Math.hypot(p.x - t.x, p.y - t.y) <= 48;
    const authoritative = { x: me.authoritativeX, y: me.authoritativeY };
    if (t.kind !== "warp" && near(authoritative) && (!tileTarget || near(me))) {
      if (t.kind === "ground" && !groundAction) {
        this.cancel();
        return stop;
      }
      const dx = t.x - authoritative.x,
        dy = t.y - authoritative.y,
        face =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";
      // Brake first and wait until the server confirms movement has stopped.
      // This drains queued movement frames before action range/front-tile checks.
      if (me.moving) return stop;
      if (
        groundAction ||
        (t.kind === "entity" &&
          ["tree", "stump", "twig", "rock", "crop", "soil", "withered"].includes(
            t.signature ?? "",
          ))
      ) {
        const front = frontTile({ ...authoritative, facing: me.facing });
        if (
          me.facing !== face ||
          (tileTarget &&
            (front.tileX !== Math.floor(t.x / TILE) ||
              front.tileY !== Math.floor(t.y / TILE)))
        )
          // Turn without translating. Walking one extra tick to fix facing was
          // the source of intermittent overshoot before touch interactions.
          return faceOnly(face);
      }
      this.cancel();
      this.act(t);
      return stop;
    }
    if (!this.path.length || now - this.planned > 1500) {
      this.path = findPath(t.area, me, near, CLIENT_MAPS) ?? [];
      this.planned = now;
      if (!this.path.length) {
        this.notice("갈 수 있는 길이 없어요. 다른 쪽을 터치해 주세요");
        this.cancel();
        return stop;
      }
    }
    let p = this.path[0]!;
    while (this.path.length > 1 && Math.hypot(p.x - me.x, p.y - me.y) < 8) {
      this.path.shift();
      p = this.path[0]!;
      this.lastDistance = Infinity;
    }
    const distance = Math.hypot(p.x - me.x, p.y - me.y);
    if (distance < this.lastDistance - 1) {
      this.progressAt = now;
      this.lastDistance = distance;
    }
    if (now - this.progressAt > 3500) {
      this.notice("길이 막혀 이동을 멈췄어요");
      this.cancel();
      return stop;
    }
    // A diagonal approach can be within 6px of the last waypoint while still
    // outside interaction range. Brake only after entering the actual goal.
    if (distance < 6 && near(me)) return stop;
    return {
      moveX: (p.x - me.x) / Math.max(distance, 12),
      moveY: (p.y - me.y) / Math.max(distance, 12),
      run: manual.run,
    };
  }
}

function authoredNpcSchedule(
  npc: Parameters<typeof worldNpcSchedule>[0],
  day: number,
  minute: number,
) {
  return worldNpcSchedule(npc, day, minute, NPC_MAPS);
}
