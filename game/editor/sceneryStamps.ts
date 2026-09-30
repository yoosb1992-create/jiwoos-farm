import { WORLD_OBJECT_ASSETS, type WorldObjectAssetId } from "../assets/definitions";
import type { MapDefinition, PixelRect } from "../maps/types";

export type SceneryStampId = "cottage_garden" | "pond_rest" | "forest_edge" | "farm_entry" | "animal_corner";

interface StampPlacement {
  assetId: WorldObjectAssetId;
  dx: number;
  dy: number;
  collision?: false;
}

export interface SceneryStampDefinition {
  id: SceneryStampId;
  label: string;
  hint: string;
  placements: readonly StampPlacement[];
}

export const SCENERY_STAMPS: Record<SceneryStampId, SceneryStampDefinition> = {
  cottage_garden: {
    id: "cottage_garden", label: "집 앞 정원", hint: "꽃밭·관목·우체통·가로등",
    placements: [
      { assetId: "flower_bed", dx: -2.1, dy: .8 },
      { assetId: "flowering_bush", dx: 2.0, dy: -.6 },
      { assetId: "mailbox", dx: 2.6, dy: 1.1 },
      { assetId: "rustic_lamp", dx: -1.2, dy: 1.9 },
      { assetId: "green_shrub", dx: .8, dy: -1.4 },
    ],
  },
  pond_rest: {
    id: "pond_rest", label: "연못 쉼터", hint: "벤치·등불·꽃과 바위",
    placements: [
      { assetId: "bench", dx: -1.7, dy: 0 },
      { assetId: "rustic_lamp", dx: 1.1, dy: -.3 },
      { assetId: "flower_bed", dx: 2.2, dy: .7 },
      { assetId: "pond_rock_large", dx: .4, dy: 1.8 },
      { assetId: "green_shrub", dx: -2.6, dy: 1.6 },
    ],
  },
  forest_edge: {
    id: "forest_edge", label: "숲 가장자리", hint: "큰 나무와 관목 군락",
    placements: [
      { assetId: "tree_variant_a", dx: -2.2, dy: 0 },
      { assetId: "tree_variant_b", dx: 1.8, dy: -.4 },
      { assetId: "tree", dx: .1, dy: 2.2 },
      { assetId: "flowering_bush", dx: -1.0, dy: 2.5 },
      { assetId: "stump", dx: 2.7, dy: 2.0 },
    ],
  },
  farm_entry: {
    id: "farm_entry", label: "농장 입구", hint: "문·울타리·가로등·꽃",
    placements: [
      { assetId: "gate", dx: 0, dy: 0 },
      { assetId: "fence_horizontal", dx: -3.4, dy: 0 },
      { assetId: "fence_horizontal", dx: 3.4, dy: 0 },
      { assetId: "rustic_lamp", dx: -1.5, dy: 1.0 },
      { assetId: "rustic_lamp", dx: 1.5, dy: 1.0 },
      { assetId: "flower_bed", dx: 0, dy: 1.7 },
    ],
  },
  animal_corner: {
    id: "animal_corner", label: "가축 구역", hint: "울타리·문·먹이통·상자",
    placements: [
      { assetId: "fence_horizontal", dx: -2.8, dy: -1.8 },
      { assetId: "fence_horizontal", dx: 2.8, dy: -1.8 },
      { assetId: "fence_vertical", dx: -4.4, dy: .5 },
      { assetId: "fence_vertical", dx: 4.4, dy: .5 },
      { assetId: "gate", dx: 0, dy: 2.5 },
      { assetId: "feed_trough", dx: 2.3, dy: .8 },
      { assetId: "farm_crate", dx: -2.2, dy: .8 },
    ],
  },
};

const uniqueObjectId = (map: MapDefinition, base: string) => {
  let id = base, suffix = 2;
  while (map.objects.some((entry) => entry.id === id)) id = `${base}_${suffix++}`;
  return id;
};

export function applySceneryStamp(map: MapDefinition, stampId: SceneryStampId, tileX: number, tileY: number) {
  const stamp = SCENERY_STAMPS[stampId];
  let added = 0;
  for (const [index, placement] of stamp.placements.entries()) {
    const x = Math.round((tileX + placement.dx) * 2) / 2;
    const y = Math.round((tileY + placement.dy) * 2) / 2;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const asset = WORLD_OBJECT_ASSETS[placement.assetId];
    const collision = placement.collision === false || !("defaultCollisionBox" in asset)
      ? undefined
      : { ...(asset.defaultCollisionBox as PixelRect) };
    map.objects.push({
      id: uniqueObjectId(map, `scenery_${stampId}_${index + 1}`),
      assetId: placement.assetId,
      position: { tileX: x, tileY: y },
      collision,
    });
    added++;
  }
  return added;
}
