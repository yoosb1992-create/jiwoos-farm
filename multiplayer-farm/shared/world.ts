import { MAPS, TILE } from "./content.js";
export const WORLD_VERSION = 1;
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
  fishing?: {
    id: string;
    size: number;
    walls: number[];
    biteAt: number;
    expiresAt: number;
  };
}
export interface Entity {
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
  path?: number[];
  value?: boolean;
}
export interface ActionResult {
  actionId: string;
  ok: boolean;
  message: string;
  revision: number;
  transition?: { area: string; x: number; y: number };
  fishing?: {
    id: string;
    size: number;
    walls: number[];
    biteAt: number;
    expiresAt: number;
  };
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
export function newMember(id: string, nickname: string): Member {
  return {
    id,
    nickname,
    inventory: {
      hoe: 1,
      water: 1,
      axe: 1,
      pickaxe: 1,
      fishing_rod: 1,
      sproutberry_seed: 12,
      stamina_biscuit: 5,
    },
    stamina: 100,
    money: 120,
    xp: 0,
    toolLevel: 1,
    quests: {},
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
export function generateDaily(world: World): void {
  for (const [id, e] of Object.entries(world.entities))
    if (e.area === "forest" || e.area.startsWith("mine"))
      delete world.entities[id];
  const rng = random(world.seed + world.day * 7919);
  for (let i = 0; i < 28; i++) {
    const kind = i < 12 ? "tree" : i < 20 ? "gather" : "rock";
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
      kind === "gather" ? (rng() < 0.3 ? "fairy_bloom" : "wild_herb") : "stone";
    world.entities[e.id] = e;
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
      world.entities[e.id] = e;
    }
}
export function newWorld(seed: number): World {
  const w: World = {
    version: WORLD_VERSION,
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
  };
  for (const o of MAPS.farm!.objects)
    if (o.assetId.startsWith("tree")) {
      const e = entity(
        o.id,
        "farm",
        "tree",
        o.position.tileX * TILE,
        o.position.tileY * TILE,
        o.assetId,
      );
      e.hp = 3;
      w.entities[e.id] = e;
    }
  // Beginner interaction cluster is beside the initial spawn and field, never inside the house.
  const tree = entity(
    "starter-pine",
    "farm",
    "tree",
    7 * TILE,
    12 * TILE,
    "tree",
  );
  tree.hp = 3;
  w.entities[tree.id] = tree;
  const chest = entity(
    "family-chest",
    "farm",
    "chest",
    8 * TILE,
    9.5 * TILE,
    "storage_chest",
  );
  w.entities[chest.id] = chest;
  const bench = entity(
    "crafting-table",
    "farm",
    "craft",
    6 * TILE,
    10.5 * TILE,
    "crafting_table",
  );
  w.entities[bench.id] = bench;
  const well = entity(
    "water-well",
    "farm",
    "well",
    12 * TILE,
    5.3 * TILE,
    "stone_well",
  );
  w.entities[well.id] = well;
  generateDaily(w);
  return w;
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
