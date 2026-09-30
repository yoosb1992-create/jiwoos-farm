import type { MapDefinition, MapObjectDefinition, SpawnDefinition, TileRegion, TileRect } from "./types";

export const FAIRY_FOREST_ENTRANCE_ANCHOR_ID = "runtime_fairy_forest_entrance";
export const MINE_ENTRANCE_ANCHOR_ID = "runtime_mine_entrance";
export const RUNTIME_ENTRANCE_ANCHOR_IDS = new Set([FAIRY_FOREST_ENTRANCE_ANCHOR_ID, MINE_ENTRANCE_ANCHOR_ID]);

type EntranceKind = "fairy_forest" | "mine";

const DEFAULT_ANCHORS: Record<EntranceKind, MapObjectDefinition> = {
  fairy_forest: {
    id: FAIRY_FOREST_ENTRANCE_ANCHOR_ID,
    assetId: "tree_variant_b",
    position: { tileX: 19, tileY: 5.2 },
    label: "요정의 숲 입구",
  },
  mine: {
    id: MINE_ENTRANCE_ANCHOR_ID,
    assetId: "mine_entrance",
    position: { tileX: 6.5, tileY: 9.2 },
    label: "광산 입구",
  },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function ensureRuntimeEntranceAnchors(maps: Record<string, MapDefinition>) {
  const road = maps.road;
  if (!road) return maps;
  for (const definition of Object.values(DEFAULT_ANCHORS)) {
    if (!road.objects.some((object) => object.id === definition.id)) road.objects.push(structuredClone(definition));
  }
  return maps;
}

export interface RuntimeEntranceLayout {
  anchor: MapObjectDefinition;
  warpArea: TileRect;
  returnSpawn: SpawnDefinition;
  pathRegion: TileRegion;
}

export function runtimeEntranceLayout(road: MapDefinition, kind: EntranceKind): RuntimeEntranceLayout {
  const fallback = DEFAULT_ANCHORS[kind];
  const anchor = road.objects.find((object) => object.id === fallback.id) ?? fallback;
  const maxX = Math.max(0, road.width - 2), maxY = Math.max(0, road.height - 2);

  if (kind === "fairy_forest") {
    const startX = clamp(Math.floor(anchor.position.tileX), 0, maxX);
    const startY = clamp(Math.floor(anchor.position.tileY + .8), 0, maxY);
    return {
      anchor,
      warpArea: { startX, endX: startX + 1, startY, endY: startY + 1 },
      returnSpawn: {
        id: "forest_return",
        tileX: clamp(startX - 3, .5, Math.max(.5, road.width - .5)),
        tileY: clamp(startY + 1, .5, Math.max(.5, road.height - .5)),
        facing: "left",
      },
      pathRegion: {
        startX: Math.max(0, startX - 6),
        endX: Math.min(road.width - 1, startX + 1),
        startY,
        endY: Math.min(road.height - 1, startY + 1),
        tileType: "path",
      },
    };
  }

  const startX = clamp(Math.floor(anchor.position.tileX - .5), 0, maxX);
  const startY = clamp(Math.floor(anchor.position.tileY + .8), 0, maxY);
  return {
    anchor,
    warpArea: { startX, endX: startX + 1, startY, endY: startY + 1 },
    returnSpawn: {
      id: "mine_return",
      tileX: clamp(startX + 2.5, .5, Math.max(.5, road.width - .5)),
      tileY: clamp(startY + .5, .5, Math.max(.5, road.height - .5)),
      facing: "right",
    },
    pathRegion: {
      startX,
      endX: Math.min(road.width - 1, startX + 2),
      startY,
      endY: Math.min(road.height - 1, startY + 1),
      tileType: "path",
    },
  };
}
