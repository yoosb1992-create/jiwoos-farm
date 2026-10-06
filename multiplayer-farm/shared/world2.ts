import type { MapData, MapObject, Rect } from "./content.js";
export const CHUNK = 16;
export const TERRAIN = [
  "grass",
  "dark_grass",
  "soil",
  "tilled_soil",
  "sand",
  "beach_sand",
  "stone",
  "gravel",
  "stone_path",
  "dirt_path",
  "wood_floor",
  "snow",
  "water",
  "shallow_water",
  "deep_water",
  "cliff",
  "hill",
  "stairs",
  "ramp",
  "mine_floor",
] as const;
export type Terrain = (typeof TERRAIN)[number];
export const TERRAIN_NAMES = [
  "잔디",
  "진한 잔디",
  "흙",
  "경작 흙",
  "모래",
  "해변 모래",
  "돌",
  "자갈",
  "돌길",
  "흙길",
  "목재 바닥",
  "눈",
  "물",
  "얕은 물",
  "깊은 물",
  "절벽",
  "언덕",
  "계단",
  "경사로",
  "광산 바닥",
];
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type SeasonKey = (typeof SEASONS)[number];
export const CELL_LAYERS = [
  "terrain",
  "water",
  "elevation",
  "collision",
  "zones",
  ...SEASONS,
] as const;
export type CellLayer = (typeof CELL_LAYERS)[number];
export const LAYERS = [
  "Terrain",
  "Water",
  "Elevation",
  "Ground Decoration",
  "Objects",
  "Buildings",
  "Upper Decoration",
  "Collision",
  "Zones",
  "NPC",
  "Events",
  "Seasonal",
] as const;
export type ObjectLayer =
  | "Ground Decoration"
  | "Objects"
  | "Buildings"
  | "Upper Decoration"
  | "Seasonal";
export const ZONES = {
  farmable: 1,
  building: 2,
  decoration: 4,
  animal: 8,
  forage: 16,
  fishing: 32,
  "no-placement": 64,
} as const;
export type ZoneType = keyof typeof ZONES;
export interface ChunkData {
  layers: Partial<Record<CellLayer, Record<string, number>>>;
}
export interface RoutePoint {
  minute: number;
  x: number;
  y: number;
  facing: string;
  animation?: string;
  dialogue?: string;
}
export interface NpcRoute {
  id: string;
  points: RoutePoint[];
}
export interface EventZone {
  id: string;
  name: string;
  area: Rect;
  trigger:
    | "enter"
    | "interact"
    | "date"
    | "time"
    | "weather"
    | "season"
    | "quest";
  condition: string;
  once: boolean;
  action: "dialogue" | "item" | "warp" | "quest" | "effect";
  value: string;
  quantity: number;
  destination?: string;
  spawn?: string;
}
export interface World2Map {
  chunkSize: 16;
  seed: number;
  chunks: Record<string, ChunkData>;
  fishing: {
    waterType: "pond" | "river" | "forest" | "sea" | "cave";
    table: string;
    seasonOverride: "" | SeasonKey;
    rareFishBonus: number;
  };
  npcRoutes: NpcRoute[];
  events: EventZone[];
}
export interface ObjectProperties {
  width?: number;
  height?: number;
  rotation?: number;
  depth?: number;
  layer?: ObjectLayer;
  visible?: boolean;
  seasons?: SeasonKey[];
  group?: string;
  bridge?: boolean;
  tree?: {
    species: string;
    stage: number;
    chop: boolean;
    stump: boolean;
    regrow: boolean;
    drop: string;
  };
  building?: { home: string; shadow: boolean };
}
export function newWorld2(seed = 173): World2Map {
  return {
    chunkSize: 16,
    seed,
    chunks: {},
    fishing: {
      waterType: "pond",
      table: "seasonal",
      seasonOverride: "",
      rareFishBonus: 0,
    },
    npcRoutes: [],
    events: [],
  };
}
export function cellAddress(x: number, y: number) {
  return {
    key: `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`,
    index: String((y % CHUNK) * CHUNK + (x % CHUNK)),
  };
}
export function cell(
  map: MapData,
  layer: CellLayer,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  const a = cellAddress(x, y);
  return map.world2?.chunks[a.key]?.layers[layer]?.[a.index] ?? 0;
}
export function setCell(
  map: MapData,
  layer: CellLayer,
  x: number,
  y: number,
  value: number,
): void {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  const a = cellAddress(x, y),
    w = (map.world2 ??= newWorld2());
  if (!value) {
    const c = w.chunks[a.key];
    if (!c) return;
    delete c.layers[layer]?.[a.index];
    if (!Object.keys(c.layers[layer] ?? {}).length) delete c.layers[layer];
    if (!Object.keys(c.layers).length) delete w.chunks[a.key];
    return;
  }
  const c = (w.chunks[a.key] ??= { layers: {} });
  (c.layers[layer] ??= {})[a.index] = value;
}
export function terrainCode(t: string): number {
  const aliases: Record<string, string> = {
    path: "dirt_path",
    dirt: "soil",
    floor: "stone",
    stone_floor: "stone",
    wood: "wood_floor",
  };
  return Math.max(0, TERRAIN.indexOf((aliases[t] ?? t) as Terrain)) + 1;
}
export function terrainAt(
  m: MapData,
  x: number,
  y: number,
  season?: SeasonKey,
): Terrain {
  let n = season ? cell(m, season, x, y) : 0;
  n ||= cell(m, "water", x, y) || cell(m, "terrain", x, y);
  if (n) return TERRAIN[n - 1] ?? "grass";
  if (!m.world2) {
    for (let i = m.terrainRegions.length - 1; i >= 0; i--) {
      const r = m.terrainRegions[i]!;
      if (inRect(r, x, y)) return TERRAIN[terrainCode(r.tileType) - 1]!;
    }
  }
  return TERRAIN[terrainCode(m.baseTileType) - 1]!;
}
export function inRect(r: Rect, x: number, y: number) {
  return x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY;
}
export const waterTerrain = (t: string) =>
  ["water", "shallow_water", "deep_water"].includes(t);
export function hasZone(
  m: MapData,
  type: ZoneType,
  x: number,
  y: number,
): boolean {
  return !!(cell(m, "zones", x, y) & ZONES[type]);
}
export function placementAllowed(
  m: MapData,
  type: "building" | "decoration" | "animal",
  x: number,
  y: number,
): boolean {
  if (!m.world2) return m.id === "farm";
  const z = cell(m, "zones", x, y);
  return !(z & ZONES["no-placement"]) && !!(z & ZONES[type]);
}
export function bridgeAt(m: MapData, x: number, y: number): boolean {
  return nearbyObjects(m, x, y).some(
    (o) =>
      o.bridge &&
      o.visible !== false &&
      Math.abs(x + 0.5 - o.position.tileX) <= (o.width ?? 2) / 2 &&
      Math.abs(y + 0.5 - o.position.tileY) <= (o.height ?? 4) / 2,
  );
}
export function blockedTile(m: MapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return true;
  const manual = cell(m, "collision", x, y);
  if (manual === 1) return true;
  if (manual === 2 || bridgeAt(m, x, y)) return false;
  const e = cell(m, "elevation", x, y),
    t = terrainAt(m, x, y);
  return waterTerrain(t) || e === 2 || t === "cliff";
}
export function elevationPass(
  m: MapData,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  if (!m.world2) return true;
  const a = cell(m, "elevation", Math.floor(ax / 32), Math.floor(ay / 32)),
    b = cell(m, "elevation", Math.floor(bx / 32), Math.floor(by / 32));
  return (
    a === b ||
    a === 3 ||
    a === 4 ||
    b === 3 ||
    b === 4 ||
    ((a === 0 || a === 2) && (b === 0 || b === 2))
  );
}
/** N/E/S/W + gated NE/SE/SW/NW (8-bit blob autotile). */
export function neighborMask(
  m: MapData,
  x: number,
  y: number,
  season?: SeasonKey,
): number {
  const t = terrainAt(m, x, y, season),
    same = (xx: number, yy: number) =>
      xx >= 0 &&
      yy >= 0 &&
      xx < m.width &&
      yy < m.height &&
      (terrainAt(m, xx, yy, season) === t ||
        (waterTerrain(t) && waterTerrain(terrainAt(m, xx, yy, season))));
  const n = same(x, y - 1),
    e = same(x + 1, y),
    s = same(x, y + 1),
    w = same(x - 1, y);
  return (
    +n |
    (+e << 1) |
    (+s << 2) |
    (+w << 3) |
    (+(n && e && same(x + 1, y - 1)) << 4) |
    (+(e && s && same(x + 1, y + 1)) << 5) |
    (+(s && w && same(x - 1, y + 1)) << 6) |
    (+(w && n && same(x - 1, y - 1)) << 7)
  );
}
export function tileHash(seed: number, x: number, y: number): number {
  let n =
    (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
export function objectVisible(o: MapObject, season: SeasonKey) {
  return (
    o.visible !== false && (!o.seasons?.length || o.seasons.includes(season))
  );
}
const indices = new WeakMap<MapData, Map<string, MapObject[]>>();
const objectIds = new WeakMap<MapData, Map<string, MapObject>>();
export function objectById(m: MapData, id: string) {
  let index = objectIds.get(m);
  if (!index) {
    index = new Map(m.objects.map((o) => [o.id, o]));
    objectIds.set(m, index);
  }
  return index.get(id);
}
export function invalidateObjectIndex(m: MapData) {
  indices.delete(m);
  objectIds.delete(m);
}
export function nearbyObjects(m: MapData, x: number, y: number): MapObject[] {
  let index = indices.get(m);
  if (!index) {
    index = new Map();
    for (const o of m.objects) {
      const r = Math.max(
        o.width ?? 0,
        o.height ?? 0,
        Math.abs(o.collision?.x ?? 0) / 32 + (o.collision?.width ?? 0) / 32,
        Math.abs(o.collision?.y ?? 0) / 32 + (o.collision?.height ?? 0) / 32,
        2,
      );
      for (
        let cy = Math.floor((o.position.tileY - r) / 16);
        cy <= Math.floor((o.position.tileY + r) / 16);
        cy++
      )
        for (
          let cx = Math.floor((o.position.tileX - r) / 16);
          cx <= Math.floor((o.position.tileX + r) / 16);
          cx++
        ) {
          const k = `${cx},${cy}`;
          let a = index.get(k);
          if (!a) index.set(k, (a = []));
          a.push(o);
        }
    }
    indices.set(m, index);
  }
  return index.get(`${Math.floor(x / 16)},${Math.floor(y / 16)}`) ?? [];
}
export function migrateMap(m: MapData): void {
  if (m.world2) return;
  m.world2 = newWorld2(tileHash(173, m.width, m.height));
  for (const r of m.terrainRegions)
    for (let y = Math.floor(r.startY); y <= r.endY; y++)
      for (let x = Math.floor(r.startX); x <= r.endX; x++)
        setCell(
          m,
          waterTerrain(r.tileType) ? "water" : "terrain",
          x,
          y,
          terrainCode(r.tileType),
        );
  for (const r of m.collisionRegions)
    for (let y = Math.floor(r.startY); y <= r.endY; y++)
      for (let x = Math.floor(r.startX); x <= r.endX; x++)
        setCell(m, "collision", x, y, 1);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) {
      let z = m.id === "farm" ? 14 : 0;
      if (m.farmAreas.some((r) => inRect(r, x, y))) z |= 1;
      if (waterTerrain(terrainAt(m, x, y))) z |= 32;
      if (z) setCell(m, "zones", x, y, z);
    }
  if (m.id === "coast") m.world2.fishing.waterType = "sea";
  else if (m.id === "forest") m.world2.fishing.waterType = "forest";
  else if (m.id.startsWith("mine")) m.world2.fishing.waterType = "cave";
  for (const o of m.objects) {
    o.layer = /house|store|shed|coop|cafe|workshop/.test(o.assetId)
      ? "Buildings"
      : "Objects";
    if (o.assetId === "bridge") {
      o.bridge = true;
      o.width = 1;
      o.height = 6;
      for (let y = 15; y <= 20; y++) setCell(m, "collision", 27, y, 2);
    }
  }
  m.terrainRegions = [];
  m.collisionRegions = [];
  m.farmAreas = [];
}
