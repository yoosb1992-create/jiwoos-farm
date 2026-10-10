import { DEBRIS, DEBRIS_FIRST, DEBRIS_MAX, NATURAL_TREE_FIRST, TREE_SPECIES, treeHp } from "./nature.js";
import { initializeTree, naturalPlacement, fencedInterior } from "./nature-world.js";
import { cell, hasZone, tileHash } from "./world2.js";
import { TILE, mapFor } from "./content.js";
import { calendar, FORAGE } from "./expansion.js";
import type { FishingChallenge } from "./fishing.js";
import { defaultLayout, legacyLayout, type WorldLayout } from "./layout.js";
import { safeSpawn } from "./regions.js";
import { collidesWithObstacle } from "./applyMovement.js";
export const WORLD_VERSION = 4;
export const STAMINA_MAX = 100;
export const ACTION_COOLDOWN_MS = 200;
export const ACTION_RANGE = 64;
export const CHECKPOINT_MS = 5000;
export const GAME_MINUTE_MS = 500;
export const MAX_QUANTITY = 999;
export type Facing = "up" | "down" | "left" | "right";
export interface Member {
  id: string;
  nickname: string;
  inventory: Record<string, number>;
  stamina: number;
  money: number;
  xp: number;
  toolLevel: number;
  quests: Record<string, number>;
  water: number;
  fishing?: FishingChallenge;
  fishBook?: Record<string, { count: number; bestCm: number }>;
  friendship?: Record<string, number>;
  collections?: Record<string, number>;
}
export interface Entity {
  species?: string;
  treeBornDay?: number;
  treeStageDay?: number;
  treeLastGrowthDay?: number;
  planted?: boolean;
  chopEnabled?: boolean;
  regrow?: boolean;
  treeDrop?: string;
  id: string;
  area: string;
  kind: string;
  asset: string;
  x: number;
  y: number;
  hp: number;
  stage: number;
  crop: string;
  watered: boolean;
  item: string;
  quantity: number;
  readyAt: number;
  owner: string;
}
export interface World {
  natureCleared?: Record<string, number>;
  debrisDay?: number;
  initialWorldVersion?: number;
  blueprintId?: string;
  layout?: WorldLayout;
  version: number;
  revision: number;
  day: number;
  minute: number;
  weather: string;
  seed: number;
  deepest: number;
  members: Record<string, Member>;
  entities: Record<string, Entity>;
  chest: Record<string, number>;
  nextEntity: number;
  events: string[];
}
export interface Actor {
  id: string;
  area: string;
  x: number;
  y: number;
  facing: string;
  running: boolean;
  stamina: number;
}
export interface Command {
  actionId: string;
  type: string;
  targetId?: string;
  tileX?: number;
  tileY?: number;
  itemId?: string;
  quantity?: number;
  area?: string;
  inputs?: number[];
  value?: boolean;
}
export interface ActionResult {
  actionId: string;
  ok: boolean;
  message: string;
  revision: number;
  transition?: {
    area: string;
    x: number;
    y: number;
    facing?: string;
    effect?: string;
  };
  fishing?: FishingChallenge;
  serverNow?: number;
  dialogue?: { name: string; lines: string[]; npcId: string };
}
export const entity = (
  id: string,
  area: string,
  kind: string,
  x: number,
  y: number,
  asset: string,
): Entity => ({
  id,
  area,
  kind,
  x,
  y,
  asset,
  hp: 0,
  stage: 0,
  crop: "",
  watered: false,
  item: "",
  quantity: 0,
  readyAt: 0,
  owner: "",
});
export function newMember(id: string, nickname: string, day = 1): Member {
  return {
    id,
    nickname,
    inventory: {
      hoe: 1,
      water: 1,
      axe: 1,
      pickaxe: 1,
      fishing_rod: 1,
      [calendar(day).season === "spring" || calendar(day).season === "summer"
        ? "sproutberry_seed"
        : calendar(day).season === "autumn"
          ? "morningcarrot_seed"
          : "snowradish_seed"]: 12,
      pine_cone: 2,
      acorn: 2,
      animal_feed: 8,
      decor_planter: 2,
      stamina_biscuit: 5,
    },
    stamina: 100,
    money: 120,
    xp: 0,
    toolLevel: 1,
    quests: {},
    fishBook: {},
    friendship: {},
    collections: {},
    water: 30,
  };
}
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** New farms should feel like natural land waiting to be cleared.
 * Farmable means "the hoe may till this tile"; it does not make untouched grass
 * a special empty surface. Sparse natural trees may therefore occupy farmable
 * grass until the player clears/tills it. */
export function seedFarmTrees(world: World, rng: () => number): void {
  const map = world.layout?.maps?.farm;
  if (!map?.world2 || world.day !== 1) return;
  const existing = Object.values(world.entities).filter(
    e => e.area === "farm" && e.id.startsWith("farmnature-tree-"),
  ).length;
  if (existing >= NATURAL_TREE_FIRST) return;

  let count = existing;
  for (let attempt = 0; count < NATURAL_TREE_FIRST && attempt < 4000; attempt++) {
    const x = 2 + Math.floor(rng() * Math.max(1, map.width - 4));
    const y = 2 + Math.floor(rng() * Math.max(1, map.height - 4));
    if (!naturalPlacement(world, "farm", x, y, "tree")) continue;

    const species = TREE_SPECIES[Math.floor(rng() * TREE_SPECIES.length)]!;
    const roll = rng();
    const stage = roll < 0.2 ? 0 : roll < 0.55 ? 1 : 2;
    const e = entity(
      `farmnature-tree-${count}`,
      "farm",
      "tree",
      (x + 0.5) * TILE,
      (y + 0.5) * TILE,
      species.id,
    );
    e.species = species.id;
    e.stage = stage;
    e.hp = treeHp(stage);
    e.planted = false;
    e.regrow = false;
    initializeTree(world, e, undefined, false);
    world.entities[e.id] = e;
    count++;
  }
}

export function seedFarmDebris(world: World, rng: () => number): void {
  const map = world.layout?.maps?.farm;
  if (!map?.world2 || world.debrisDay === world.day) return;
  world.debrisDay = world.day;
  const existing = Object.values(world.entities).filter(e => e.area === "farm" && e.id.startsWith("farmdebris-")).length;
  const target = world.day === 1 ? DEBRIS_FIRST : Math.min(DEBRIS_MAX, existing + 2 + Math.floor(rng()*5));
  const enclosed = fencedInterior(world,"farm");
  for(const [k,d] of Object.entries(world.natureCleared??{})) if(world.day-d>=7)delete world.natureCleared![k];
  let count=existing;
  for(let attempt=0;count<target && attempt<4000;attempt++) {
    const x=2+Math.floor(rng()*(map.width-4)), y=2+Math.floor(rng()*(map.height-4));
    if(!naturalPlacement(world,"farm",x,y,"debris",enclosed))continue;
    const d=DEBRIS[Math.floor(rng()*DEBRIS.length)]!;
    const id=`farmdebris-${world.day}-${++world.nextEntity}`;
    const e=entity(id,"farm",d.kind,(x+.5)*TILE,(y+.5)*TILE,d.id);
    e.hp=1; e.item=d.item; world.entities[id]=e; count++;
  }
}
export function generateDaily(world: World): void {
  for (const [id, e] of Object.entries(world.entities))
    if (
      (!e.planted && ((e.area === "forest" && e.kind !== "tree" && e.kind !== "stump") || e.area.startsWith("mine"))) ||
      id.startsWith("zoneforage-")
    )
      delete world.entities[id];
  const rng = random(world.seed + world.day * 7919);
  const forage = FORAGE.filter((f) =>
    f.seasons.includes(calendar(world.day).season),
  );
  seedFarmTrees(world, rng);
  seedFarmDebris(world, rng);
  // Natural forest trees age too. Keep occupied resource slots across days;
  // only a fully cleared slot receives a new natural tree the next morning.
  const forestSlots = new Set(Object.values(world.entities)
    .filter(e => e.area === "forest" && (e.kind === "tree" || e.kind === "stump"))
    .map(e => /^forest-\d+-(\d+)$/.exec(e.id)?.[1]));
  for (let i = 0; i < 28; i++) {
    const kind = i < 12 ? "tree" : i < 20 ? "gather" : "rock";
    if (kind === "tree" && forestSlots.has(String(i))) continue;
    const e = entity(
      `forest-${world.day}-${i}`,
      "forest",
      kind,
      (9 + (i % 7) * 3) * TILE,
      (5 + Math.floor(i / 7) * 4) * TILE,
      kind === "tree"
        ? "tree"
        : kind === "gather"
          ? "forest_herb"
          : "forest_rock",
    );
    e.hp = kind === "tree" ? 3 : 2;
    e.item =
      kind === "gather"
        ? forage[Math.floor(rng() * forage.length)]!.id
        : "stone";
    if (kind === "gather") e.asset = forage.find((f) => f.id === e.item)!.asset;
    if (kind === "tree") { e.stage=2; e.species=TREE_SPECIES[i % TREE_SPECIES.length]!.id; e.regrow=true; initializeTree(world,e); }
    placeDaily(world, e);
  }
  for (let floor = 1; floor <= 5; floor++)
    for (let i = 0; i < 12; i++) {
      const e = entity(
        `mine-${world.day}-${floor}-${i}`,
        `mine${floor}`,
        "rock",
        (8 + (i % 4) * 3) * TILE,
        (5 + Math.floor(i / 4) * 3) * TILE,
        rng() < 0.4 ? "mine_copper" : "mine_stone",
      );
      e.hp = 2;
      e.item = e.asset === "mine_copper" ? "copper_ore" : "stone";
      placeDaily(world, e);
    }
  for (const map of Object.values(world.layout?.maps ?? {}))
    if (map.world2) {
      let count = 0;
      for (const [key, c] of Object.entries(map.world2.chunks))
        for (const [index, value] of Object.entries(c.layers.zones ?? {})) {
          if (!(value & 16) || count >= 64) continue;
          const [cx, cy] = key.split(",").map(Number),
            i = Number(index),
            x = cx! * 16 + (i % 16),
            y = cy! * 16 + Math.floor(i / 16),
            hash = tileHash(map.world2.seed + world.day, x, y);
          if (
            hash % 5 ||
            collidesWithObstacle(
              (x + 0.5) * TILE,
              (y + 0.5) * TILE,
              map.id,
              world.layout!.maps,
            )
          )
            continue;
          const f = forage[hash % forage.length]!,
            e = entity(
              `zoneforage-${map.id}-${world.day}-${count++}`,
              map.id,
              "gather",
              (x + 0.5) * TILE,
              (y + 0.5) * TILE,
              f.asset,
            );
          e.item = f.id;
          world.entities[e.id] = e;
        }
    }
  seedFixtures(world, true);

}
function placeDaily(w: World, e: Entity): void {
  const maps = w.layout?.maps ?? defaultLayout().maps,
    map = mapFor(e.area, maps);
  if (collidesWithObstacle(e.x, e.y, e.area, maps)) {
    const free = [];
    for (let y = 1; y < map.height - 1; y++)
      for (let x = 1; x < map.width - 1; x++)
        if (
          !collidesWithObstacle(
            (x + 0.5) * TILE,
            (y + 0.5) * TILE,
            e.area,
            maps,
          )
        )
          free.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
    const n = Object.keys(w.entities).length,
      pos =
        free[n % Math.max(1, free.length)] ??
        safeSpawn(e.area, undefined, maps);
    e.x = pos.x;
    e.y = pos.y;
  }
  w.entities[e.id] = e;
}
export function newWorld(
  seed: number,
  layout: WorldLayout = defaultLayout(),
): World {
  const w: World = {
    version: WORLD_VERSION,
    debrisDay: 0,
    initialWorldVersion: layout.worldVersion ?? 0,
    ...(layout.blueprintId ? { blueprintId: layout.blueprintId } : {}),
    revision: 0,
    day: 1,
    minute: 360,
    weather: "clear",
    seed,
    deepest: 1,
    members: {},
    entities: {},
    chest: {},
    nextEntity: 0,
    events: [],
    layout: structuredClone(layout),
  };
  seedFixtures(w, false);
  generateDaily(w);
  return w;
}
function seedFixtures(w: World, daily: boolean): void {
  for (const map of Object.values(w.layout?.maps ?? defaultLayout().maps)) {
    if ((map.id === "forest" || map.id.startsWith("mine")) !== daily) continue;
    for (const o of map.objects)
      if (o.kind && o.visible !== false) {
        const e = entity(
          o.id,
          map.id,
          o.kind,
          o.position.tileX * TILE,
          o.position.tileY * TILE,
          o.assetId,
        );
        if (e.kind === "tree") {
          e.stage = o.tree?.stage ?? 2;
          e.hp = treeHp(e.stage);
          initializeTree(w,e,o);
          if (o.tree?.stump) {
            e.kind = "stump";
            e.asset = "stump";
            e.hp = 3;
          }
        }
        const debris = DEBRIS.find(d => d.id === o.assetId);
        if(debris) { e.kind=debris.kind; e.hp=1; e.item=debris.item; }
        if (e.kind === "animal")
          e.crop = o.assetId.includes("cow")
            ? "cow"
            : o.assetId.includes("sheep")
              ? "sheep"
              : "chicken";
        w.entities[e.id] = e;
      }
  }
}
export function addDrop(
  w: World,
  at: Pick<Entity, "area" | "x" | "y">,
  item: string,
  quantity: number,
): Entity {
  const id = `drop-${++w.nextEntity}`;
  const e = entity(id, at.area, "drop", at.x, at.y, "");
  e.item = item;
  e.quantity = quantity;
  w.entities[id] = e;
  return e;
}

/** Additive JSON upgrade. Existing crops, inventories and receipts are retained. */
export function upgradeWorld(w: World): void {
  if (w.version > WORLD_VERSION)
    throw new Error("This farm needs a newer server");
  for (const m of Object.values(w.members)) {
    m.fishBook ??= {};
    m.friendship ??= {};
    m.collections ??= {};
    if (m.fishing && !("seed" in m.fishing)) delete m.fishing;
  }
  const needsUpgrade = w.version < 2;
  const fixed = [
    ["animal-home", "farm", "barn", 41, 8, "chicken_coop"],
    ["feeding-trough", "farm", "trough", 40, 12, "feed_trough"],
    ["town-board", "town", "board", 18, 9, "decor_board"],
    ["workshop-table", "workshop", "craft", 10, 6, "crafting_table"],
    ["cafe-kitchen", "cafe", "craft", 12, 5, "crafting_table"],
  ] as const;
  if (needsUpgrade)
    for (const [id, area, kind, x, y, asset] of fixed)
      w.entities[id] ??= entity(id, area, kind, x * TILE, y * TILE, asset);
  if (!w.entities["animal-starter"] && w.version < 2) {
    const chick = entity(
      "animal-starter",
      "farm",
      "animal",
      39 * TILE,
      12 * TILE,
      "chicken",
    );
    chick.crop = "chicken";
    w.entities[chick.id] = chick;
  }
  // Missing snapshots belong to legacy families, never opt them into new maps.
  w.layout ??= legacyLayout();
  for(const e of Object.values(w.entities)) if(e.kind==="tree" || e.kind==="stump") {
    const o=w.layout.maps[e.area]?.objects.find(o=>o.id===e.id);
    // Old unannotated entities used stage=0 as an unrelated default, yet rendered mature.
    if(!e.species && !o?.tree && w.version<4) e.stage=2;
    if(e.stage===undefined)e.stage=2;
    initializeTree(w,e,o);
  }
  w.debrisDay ??= w.day;
  w.version = WORLD_VERSION;
}
