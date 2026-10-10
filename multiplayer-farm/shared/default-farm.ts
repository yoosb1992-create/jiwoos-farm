import { ASSETS, TILE, type MapData, type MapObject } from "./content.js";
import { newWorld2, setCell, terrainCode, tileHash, ZONES } from "./world2.js";

/** Authored content, evaluated only when making a default layout. No renderer
 * coordinates, no per-frame generation. The result is ordinary editable data. */
export const DEFAULT_FARM = {
  width: 128,
  height: 88,
  seed: 20261008,
  house: { x: 60, y: 29 },
  well: { x: 76.5, y: 34.5 },
  spawn: { x: 60.5, y: 37.5 },
} as const;
type Point = readonly [number, number];
const paths: readonly (readonly Point[])[] = [
  // North curves around the east side of the house, rather than through it.
  [[64, 0], [64, 11], [67, 19], [70, 26], [70, 32], [66, 38], [63, 40]],
  [[0, 42], [11, 42], [23, 39], [34, 40], [45, 43], [54, 42], [63, 40]],
  [[63, 40], [76, 39], [88, 42], [103, 43], [115, 40], [128, 40]],
  [[63, 40], [59, 49], [59, 58], [65, 68], [64, 78], [64, 88]],
  [[60, 33], [60, 36], [63, 40]],
  [[76.5, 35], [76.5, 39]],
];
function segmentDistance(x: number, y: number, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}
function pathDistance(x: number, y: number) {
  let d = Infinity;
  for (const points of paths)
    for (let i = 1; i < points.length; i++)
      d = Math.min(d, segmentDistance(x, y, points[i - 1]!, points[i]!));
  return d;
}
function edgeDistance(x: number, y: number) {
  return Math.min(x, DEFAULT_FARM.width - x, y, DEFAULT_FARM.height - y);
}
function livingArea(x: number, y: number) {
  return ((x - 60) / 10) ** 2 + ((y - 31) / 10) ** 2 < 1 ||
    ((x - 76.5) / 4.3) ** 2 + ((y - 34) / 4.8) ** 2 < 1;
}

export function createDefaultFarm(previous: MapData): MapData {
  const { width, height, seed } = DEFAULT_FARM;
  const farm: MapData = {
    id: "farm", name: "지우네 농장", width, height,
    baseTileType: "grass", terrainRegions: [], farmAreas: [], collisionRegions: [],
    world2: newWorld2(seed), objects: [],
    spawns: [
      { id: "farm_entry", tileX: 60.5, tileY: 37.5, facing: "down" },
      { id: "house_front", tileX: 60.5, tileY: 37.5, facing: "down" },
      { id: "from_house", tileX: 60.5, tileY: 36.5, facing: "down" },
      { id: "from_road", tileX: 64.5, tileY: 83.5, facing: "up" },
      // Reserved editor markers, NOT invented destination maps or active warps.
      { id: "pending_north", tileX: 64.5, tileY: 2.5, facing: "down" },
      { id: "pending_west", tileX: 2.5, tileY: 42.5, facing: "right" },
      { id: "pending_east", tileX: 125.5, tileY: 40.5, facing: "left" },
    ],
    warps: previous.warps.map(w => ({
      ...structuredClone(w),
      ...(w.id === "house_door" ? { area: { startX: 59, endX: 60, startY: 33, endY: 34 } } : {}),
      ...(w.id === "exit_south" ? { area: { startX: 62, endX: 65, startY: 86, endY: 87 } } : {}),
    })),
  };
  const add = (id: string, assetId: string, x: number, y: number, scale = 1, properties: Partial<MapObject> = {}) => {
    const a = ASSETS[assetId];
    const o: MapObject = {
      id, assetId, position: { tileX: x, tileY: y }, layer: "Objects",
      // Explicit size keeps the same appearance in editor and gameplay.
      width: (a?.frameSize?.width ?? 64) * scale / TILE,
      height: (a?.frameSize?.height ?? 96) * scale / TILE,
      ...properties,
    };
    farm.objects.push(o);
    return o;
  };
  add("house", "house", 60, 29, 1.75, {
    layer: "Buildings", label: "우리 집", depth: 96,
    collision: { x: -168, y: -140, width: 336, height: 236 },
    building: { home: "", shadow: true },
  });
  add("water-well", "stone_well", 76.5, 34.5, 1.15, {
    kind: "well", collision: { x: -39, y: -24, width: 78, height: 34 },
  });
  add("family-chest", "storage_chest", 65.5, 34.5, 1, {
    kind: "chest", collision: { x: -25, y: -16, width: 50, height: 30 },
  });
  add("crafting-table", "crafting_table", 53, 34.5, 1, {
    kind: "craft", collision: { x: -26, y: -17, width: 52, height: 32 },
  });
  add("yard-mailbox", "mailbox", 64.5, 36.5, 0.85, {
    collision: { x: -8, y: -10, width: 16, height: 18 },
  });
  add("yard-bench", "bench", 51, 32.5, 0.85, {
    collision: { x: -36, y: -10, width: 72, height: 16 },
  });
  add("yard-lamp", "rustic_lamp", 56, 34.5, 0.8);
  // One removable tree by the yard introduces clearing without filling fields.
  add("starter-pine", "tree", 56.5, 39.5, 1, {
    kind: "tree", tree: { species: "tree", stage: 2, chop: true, stump: false, regrow: false, drop: "wood" },
  });
  for (const [x, y, asset, scale] of [
    [54, 32.7, "flower_bed", 0.55], [65, 31.8, "flower_bed", 0.55],
    [52, 29.5, "flowering_bush", 0.8], [66, 27.5, "green_shrub", 0.85],
    [79.7, 33, "flowering_bush", 0.65], [74, 31.8, "green_shrub", 0.65],
  ] as const) add(`yard-plant-${String(x).replace(".", "-")}`, asset, x, y, scale, { decorative: true });

  // Broken little fence ends frame the northern lane; no fenced crop plots.
  for (const x of [58, 70]) {
    add(`north-fence-${x}`, "fence_horizontal", x, 8, 0.65, {
      collision: { x: -36, y: -6, width: 72, height: 12 },
    });
    add(`north-flowers-${x}`, "flower_bed", x, 6.5, 0.65, { decorative: true });
  }
  for (const [direction, label, x, y, area] of [
    ["north", "북쪽길", 68.5, 4.5, { startX: 62, endX: 65, startY: 1, endY: 3 }],
    ["west", "서쪽길", 5, 46, { startX: 1, endX: 3, startY: 40, endY: 43 }],
    ["east", "동쪽길", 123, 44, { startX: 124, endX: 126, startY: 38, endY: 41 }],
  ] as const) {
    add(`pending-${direction}-sign`, "decor_board", x, y, 0.6, { label: `${label} · 연결 준비` });
    farm.world2!.events.push({
      id: `pending-${direction}-exit`, name: `${label} 연결 준비`, area,
      trigger: "enter", condition: "", once: false, action: "dialogue",
      value: `${label}은 아직 이어지지 않았어요. 지금은 남쪽 들꽃길로 마을과 숲에 갈 수 있어요.`, quantity: 1,
    });
  }
  add("south-sign", "decor_board", 69, 82.5, 0.6, { label: "남쪽 · 들꽃길" });

  // Seeded border clusters, with generous canopy clearance around every lane.
  // Static tree collisions cover only trunks, never their large canopies.
  let serial = 0;
  for (let gy = 5; gy < height - 1; gy += 3.5)
    for (let gx = 3; gx < width - 2; gx += 3.8) {
      const h = tileHash(seed, Math.floor(gx * 10), Math.floor(gy * 10));
      const x = gx + ((h % 100) / 100 - 0.5) * 1.6;
      const y = gy + (((h >>> 8) % 100) / 100 - 0.5) * 1.6;
      const edge = edgeDistance(x, y);
      if (edge > 6.8 + Math.sin(x * 0.14 + y * 0.19) * 1.2 || pathDistance(x, y) < 5.2) continue;
      const id = `border-${serial++}`;
      if (h % 10 < 6) {
        const scale = 0.9 + (h % 65) / 100;
        add(id, [
          "tree", "tree_variant_a", "tree_variant_b", "tree_pine",
          "tree_cherry", "tree_maple", "tree_birch", "tree_willow",
        ][h % 8]!, x, y, scale, {
          decorative: true,
          collision: { x: -11 * scale, y: -9 * scale, width: 22 * scale, height: 18 * scale },
        });
      } else if (h % 10 < 9) {
        add(id, h % 2 ? "green_shrub" : "flowering_bush", x, y, 0.7 + (h % 40) / 100, { decorative: true });
      } else add(id, "pond_rock_large", x, y, 0.55, {
        decorative: true, collision: { x: -22, y: -12, width: 44, height: 20 },
      });
      if (h % 3 === 0) add(
        `${id}-flowers`,
        ["flower_bed", "flower_daisy", "flower_poppy", "flower_bluebell", "flower_lavender"][h % 5]!,
        x + 1.3,
        y + 1.1,
        0.45 + (h % 18) / 100,
        { decorative: true },
      );
    }

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = x + 0.5, py = y + 0.5, edge = edgeDistance(px, py);
      const lane = pathDistance(px, py), h = tileHash(seed, x, y);
      const yard = ((px - 60) / 7.3) ** 2 + ((py - 34) / 4.3) ** 2 < 1;
      const wellPad = ((px - 76.5) / 2.7) ** 2 + ((py - 34.5) / 2.2) ** 2 < 1;
      const border = edge < 7 + Math.sin(px * 0.14 + py * 0.19) * 1.2;
      let terrain = "grass";
      if (border && Math.sin(px * 0.21) + Math.cos(py * 0.25) > -0.4) terrain = "dark_grass";
      if (lane < 1.8) terrain = "dirt_path";
      if (yard && py > 31.5) terrain = h % 5 === 0 ? "gravel" : "dirt_path";
      if (wellPad || (py > 32 && py < 35 && Math.abs(px - 60) < 2.2)) terrain = "stone_path";
      if (terrain !== "grass") setCell(farm, "terrain", x, y, terrainCode(terrain));
      const blockedObject = farm.objects.some(o => {
        if (!o.collision && !o.kind) return false;
        const c = o.collision ?? { x: -18, y: -18, width: 36, height: 36 };
        const ox = o.position.tileX * TILE + c.x, oy = o.position.tileY * TILE + c.y;
        return x * TILE < ox + c.width + 12 && (x + 1) * TILE > ox - 12 &&
          y * TILE < oy + c.height + 12 && (y + 1) * TILE > oy - 12;
      });
      const free = !border && !livingArea(px, py) && lane > 2.8 && !blockedObject;
      setCell(farm, "zones", x, y, free
        ? ZONES.farmable | ZONES.building | ZONES.decoration | ZONES.animal
        : ZONES["no-placement"]);
      // Physical perimeter. The south portal remains open; other lanes stop at
      // their marked future connection rather than leading out of the world.
      if ((x === 0 || x === width - 1 || y === 0 || y === height - 1) &&
        !(y === height - 1 && x >= 62 && x <= 65)) setCell(farm, "collision", x, y, 1);
    }
  return farm;
}
