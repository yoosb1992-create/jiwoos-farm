import type { World2Map, ObjectProperties } from "./world2.js";
import snapshot from "./legacy-content.json" with { type: "json" };
import {
  EXPANSION_CROPS,
  FORAGE,
  FISH_CATALOG,
  DECORATIONS,
  festivalOn,
  type CropDef,
} from "./expansion.js";
export interface Rect {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}
export interface MapObject extends ObjectProperties {
  id: string;
  assetId: string;
  position: { tileX: number; tileY: number };
  collision?: { x: number; y: number; width: number; height: number };
  label?: string;
  kind?: string;
  scale?: number;
  decorative?: boolean;
}
export interface MapData {
  world2?: World2Map;
  id: string;
  name: string;
  width: number;
  height: number;
  baseTileType: string;
  terrainRegions: Array<Rect & { tileType: string }>;
  farmAreas: Rect[];
  collisionRegions: Rect[];
  objects: MapObject[];
  spawns: Array<{ id: string; tileX: number; tileY: number; facing: string }>;
  warps: Array<{
    id: string;
    area: Rect;
    targetMapId: string;
    targetSpawnId: string;
    facing?: string;
    effect?: string;
  }>;
}
export interface Asset {
  assetId: string;
  textureKey: string;
  source: {
    kind: string;
    path: string;
    frameWidth?: number;
    frameHeight?: number;
  } | null;
  frameSize?: { width: number; height: number };
  displayScale?: { x: number; y: number };
  origin?: { x: number; y: number };
}
export const MAPS: Record<string, MapData> = snapshot.maps;
export const ASSETS: Record<string, Asset> = snapshot.assets;
export const CROPS: Record<string, CropDef> = Object.fromEntries(
  EXPANSION_CROPS.map((c) => [c.id, c]),
);
export interface ItemDefinition {
  id: string;
  name: string;
  kind: string;
  assetId: string;
  sellPrice?: number;
  energy?: number;
  description?: string;
}
export const ITEMS: Record<string, ItemDefinition> = { ...snapshot.items };
for (const c of EXPANSION_CROPS) {
  ITEMS[c.id] = {
    id: c.id,
    name: c.name,
    kind: "crop",
    assetId: `crop_${c.id}_mature`,
    sellPrice: c.sellPrice,
    energy: c.energy,
    description: c.description,
  };
  ITEMS[c.seedItemId] = {
    id: c.seedItemId,
    name: `${c.name} 씨앗`,
    kind: "seed",
    assetId: "item_seed",
    description: c.description,
  };
}
for (const f of FORAGE)
  ITEMS[f.id] = {
    id: f.id,
    name: f.name,
    kind: "forage",
    assetId: f.asset,
    sellPrice: f.price,
    energy: f.energy,
    description: f.description,
  };
for (const f of FISH_CATALOG)
  ITEMS[f.id] = {
    id: f.id,
    name: f.name,
    kind: "fish",
    assetId: `icon_${f.id}`,
    sellPrice: f.price,
    energy: 10,
    description: f.description,
  };
for (const [id, d] of Object.entries(DECORATIONS))
  ITEMS[id] = {
    id,
    name: d.name,
    kind: "decoration",
    assetId: d.asset,
    description:
      "농장에서 앞칸에 배치해요. 손으로 가까이에서 회수할 수 있어요.",
  };
for (const [id, name, price, energy, asset] of [
  ["milk", "햇살우유", 90, 28, "icon_milk"],
  ["wool", "구름양털", 100, 0, "icon_wool"],
  ["herb_tea", "산책 허브차", 55, 40, "icon_tea"],
  ["harvest_stew", "포근한 채소수프", 100, 65, "icon_stew"],
  ["berry_jam", "계절 열매잼", 95, 35, "icon_jam"],
] as const)
  ITEMS[id] = {
    id,
    name,
    kind: "produce",
    assetId: asset,
    sellPrice: price,
    energy,
    description: energy
      ? `기력 ${energy} 회복. 따뜻한 농장의 맛.`
      : "공방에서 쓸 수 있는 포근한 천연 재료.",
  };
ITEMS.egg = {
  ...ITEMS.egg!,
  sellPrice: 35,
  energy: 15,
  description: "먹이를 먹은 닭이 다음 아침 선물해요.",
};
ITEMS.stamina_biscuit = {
  ...ITEMS.stamina_biscuit!,
  energy: 35,
  description: "기력 35를 회복하는 든든한 간식.",
};
export const RECIPES: Record<
  string,
  {
    id: string;
    name: string;
    ingredients: Array<{ itemId: string; quantity: number }>;
    output: { itemId: string; quantity: number };
  }
> = { ...snapshot.recipes };
for (const [id, d] of Object.entries(DECORATIONS))
  RECIPES[id] = {
    id,
    name: d.name,
    ingredients: [{ itemId: "wood", quantity: d.wood }],
    output: { itemId: id, quantity: 1 },
  };
RECIPES.herb_tea = {
  id: "herb_tea",
  name: "산책 허브차",
  ingredients: [{ itemId: "wild_herb", quantity: 2 }],
  output: { itemId: "herb_tea", quantity: 1 },
};
RECIPES.harvest_stew = {
  id: "harvest_stew",
  name: "포근한 채소수프",
  ingredients: [
    { itemId: "sunpotato", quantity: 1 },
    { itemId: "morningcarrot", quantity: 1 },
  ],
  output: { itemId: "harvest_stew", quantity: 1 },
};
RECIPES.berry_jam = {
  id: "berry_jam",
  name: "계절 열매잼",
  ingredients: [{ itemId: "sproutberry", quantity: 2 }],
  output: { itemId: "berry_jam", quantity: 1 },
};
type LegacyNpc = (typeof snapshot.npcs)[number];
export type NpcDefinition = Omit<LegacyNpc, "dialogue"> & {
  dialogue: {
    first: string[];
    general: string[][];
    morning: string[][];
    afternoon: string[][];
    evening: string[][];
    progress: Array<{ minDay: number; lines: string[] }>;
    relationship?: Array<{ minPoints: number; lines: string[] }>;
  };
};
export const NPCS: NpcDefinition[] = [...snapshot.npcs];
for (const [id, name, role, personality, area, x, y, source, words] of [
  [
    "naru",
    "나루",
    "낚시 친구",
    "성급한 하루에도 물결을 기다릴 줄 아는 사람",
    "coast",
    8,
    10,
    0,
    "낚시는 계속 누르는 게 아니야. 물고기를 따라 짧게 눌렀다 놓아 봐.",
  ],
  [
    "yul",
    "율",
    "공방 주인",
    "나무 향과 작은 발명을 좋아하는 장인",
    "workshop",
    6,
    5,
    1,
    "쓸모있는 것에도 예쁜 모서리가 필요하지. 가구를 만들어 정원을 꾸며 봐.",
  ],
  [
    "mira",
    "미라",
    "카페 주인",
    "계절마다 새로운 차를 끓이는 이야기꾼",
    "cafe",
    6,
    5,
    0,
    "피곤하면 허브차 한 잔 어때요? 숲에서 허브를 모으면 직접 만들 수도 있어요.",
  ],
  [
    "haneul",
    "하늘",
    "마을 기록가",
    "마을의 사소한 기쁨을 기억하는 어른",
    "town",
    16,
    9,
    1,
    "광장의 게시판을 봤니? 작은 약속들이 마을을 특별하게 만들지.",
  ],
] as const) {
  const base = snapshot.npcs[source]!;
  NPCS.push({
    ...base,
    id,
    name,
    displayName: `${name} · ${role}`,
    personality,
    asset: { ...base.asset, assetId: `npc_${id}`, textureKey: `npc-${id}` },
    schedule: [
      {
        minute: 360,
        mapId: area,
        from: { x, y },
        to: { x, y },
        facing: "down",
        activity: role,
      },
      {
        minute: 1080,
        mapId: "town",
        from: {
          x: 10 + source * 3 + (id === "mira" ? 2 : id === "haneul" ? 6 : 0),
          y: 12,
        },
        to: { x: 12, y: 12 },
        facing: "down",
        activity: "저녁 산책",
      },
    ],
    dialogue: {
      ...base.dialogue,
      first: [words],
      general: [
        [words],
        [`${name}의 하루도 당신 덕분에 조금 더 따뜻해졌어요.`],
      ],
    },
  });
}
export function npcSchedule(
  npc: (typeof NPCS)[number],
  day: number,
  minute: number,
) {
  const festival = festivalOn(day);
  if (festival && minute >= festival.from && minute <= festival.to)
    return {
      ...npc.schedule[0]!,
      mapId: "town",
      from: { x: 10 + NPCS.indexOf(npc) * 2, y: 11 },
      activity: festival.name,
    };
  return (
    [...npc.schedule].reverse().find((s) => s.minute <= minute) ??
    npc.schedule[0]!
  );
}
export const FISH = snapshot.fish;
export const TILE = 32;
export const FOREST: MapData = {
  id: "forest",
  name: "요정의 숲",
  width: 32,
  height: 24,
  baseTileType: "grass",
  terrainRegions: [],
  farmAreas: [],
  collisionRegions: [],
  objects: [],
  spawns: [{ id: "entry", tileX: 5, tileY: 6, facing: "down" }],
  warps: [
    {
      id: "exit",
      area: { startX: 3, endX: 6, startY: 2, endY: 3 },
      targetMapId: "road",
      targetSpawnId: "farm_entrance",
    },
  ],
};
MAPS.forest = FOREST;
for (let floor = 1; floor <= 5; floor++)
  MAPS[`mine${floor}`] = {
    ...FOREST,
    id: `mine${floor}`,
    name: `광산 ${floor}층`,
    width: 24,
    height: 18,
    baseTileType: "mine_floor",
    warps: [
      {
        id: "exit",
        area: { startX: 3, endX: 6, startY: 2, endY: 3 },
        targetMapId: "road",
        targetSpawnId: "farm_entrance",
      },
    ],
  };
MAPS.road!.warps.push(
  {
    id: "forest",
    area: { startX: 5, endX: 8, startY: 3, endY: 5 },
    targetMapId: "forest",
    targetSpawnId: "entry",
  },
  {
    id: "mine",
    area: { startX: 14, endX: 17, startY: 5, endY: 7 },
    targetMapId: "mine1",
    targetSpawnId: "entry",
  },
);
export function tileIn(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.startX && x <= rect.endX && y >= rect.startY && y <= rect.endY
  );
}
export function mapFor(
  id: string,
  maps: Record<string, MapData> = MAPS,
): MapData {
  return maps[id] ?? maps.farm!;
}
export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}

// The old map geometry is retained; v2.6 adds clearly separated destinations.
for (const [id, name] of [
  ["cafe", "바람찻집"],
  ["workshop", "나뭇결 공방"],
] as const) {
  MAPS[id] = {
    ...MAPS.general_store!,
    id,
    name,
    objects: [],
    warps: [
      {
        id: "exit",
        area: { startX: 8, endX: 10, startY: 11, endY: 12 },
        targetMapId: "town",
        targetSpawnId: `from_${id}`,
      },
    ],
  };
}
MAPS.coast = {
  ...FOREST,
  id: "coast",
  name: "물결해안",
  width: 32,
  height: 22,
  baseTileType: "path",
  terrainRegions: [
    { startX: 0, endX: 31, startY: 12, endY: 21, tileType: "water" },
  ],
  collisionRegions: [{ startX: 0, endX: 31, startY: 12, endY: 21 }],
  spawns: [{ id: "entry", tileX: 15, tileY: 5, facing: "down" }],
  warps: [
    {
      id: "exit",
      area: { startX: 13, endX: 17, startY: 2, endY: 3 },
      targetMapId: "town",
      targetSpawnId: "from_coast",
    },
  ],
};
for (const [id, x, y] of [
  ["cafe", 7, 8],
  ["workshop", 33, 8],
  ["coast", 40, 15],
] as const) {
  MAPS.town!.warps.push({
    id: `${id}_door`,
    area: { startX: x - 1, endX: x + 1, startY: y, endY: y + 1 },
    targetMapId: id,
    targetSpawnId: "entry",
  });
  MAPS.town!.spawns.push({
    id: `from_${id}`,
    tileX: x,
    tileY: y + 2,
    facing: "down",
  });
}
MAPS.forest!.terrainRegions.push({
  startX: 0,
  endX: 4,
  startY: 18,
  endY: 23,
  tileType: "water",
});
MAPS.forest!.collisionRegions.push({
  startX: 0,
  endX: 4,
  startY: 18,
  endY: 23,
});
// Arrays must be independent: shallow copying FOREST would also flood every mine.
for (let f = 1; f <= 5; f++) {
  MAPS[`mine${f}`]!.terrainRegions = [];
  MAPS[`mine${f}`]!.collisionRegions = [];
}
MAPS.mine5!.terrainRegions.push({
  startX: 16,
  endX: 23,
  startY: 15,
  endY: 17,
  tileType: "water",
});
MAPS.mine5!.collisionRegions.push({
  startX: 16,
  endX: 23,
  startY: 15,
  endY: 17,
});
// A traversable little bridge across the farm pond; geometry shared with prediction.
MAPS.farm!.collisionRegions = MAPS.farm!.collisionRegions.filter(
  (r) => !(r.startX === 24 && r.startY === 15),
);
MAPS.farm!.collisionRegions.push(
  { startX: 24, endX: 26, startY: 15, endY: 20 },
  { startX: 28, endX: 30, startY: 15, endY: 20 },
);
