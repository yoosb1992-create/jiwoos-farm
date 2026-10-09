import type { Asset } from "./content.js";
import type { SeasonKey } from "./world2.js";

/** Painted pixels are independent of world geometry. frameSize is in world pixels,
 * not the downloaded image resolution; anchors/collisions in saved maps stay valid. */
const root = "/assets/art-foundation";
export const PAINTED_SPRITES: Record<string, {
  file: string; width: number; height: number; originY: number; name: string;
}> = {
  house: { file: "house", width: 224, height: 192, originY: .5, name: "햇살 농가" },
  stone_well: { file: "stone-well", width: 112, height: 104, originY: .94, name: "돌 우물" },
  tree: { file: "broadleaf", width: 128, height: 160, originY: .92, name: "큰 참나무" },
  tree_variant_b: { file: "pine", width: 128, height: 160, originY: .92, name: "큰 소나무" },
  tree_pine: { file: "pine", width: 128, height: 160, originY: .92, name: "소나무" },
  flowering_bush: { file: "flowering-bush", width: 96, height: 64, originY: .94, name: "들꽃 덤불" },
  grass_tuft: { file: "grass-tuft", width: 48, height: 36, originY: .94, name: "클로버 들풀" },
  small_rock: { file: "small-rock", width: 48, height: 36, originY: .94, name: "작은 이끼돌" },
  reed: { file: "reed", width: 48, height: 64, originY: .8, name: "물가 갈대" },
  mushroom: { file: "mushroom", width: 48, height: 64, originY: .8, name: "숲 버섯" },
  water_lily: { file: "water-lily", width: 48, height: 64, originY: .8, name: "분홍 수련" },
  bridge: { file: "bridge", width: 48, height: 208, originY: .5, name: "작은 목교" },
  bridge_wide: { file: "bridge", width: 128, height: 160, originY: .5, name: "넓은 목교" },
  storage_chest: { file: "storage-chest", width: 64, height: 48, originY: .5, name: "참나무 보관함" },
  crafting_table: { file: "crafting-table", width: 64, height: 48, originY: .5, name: "목공 제작대" },
  decor_board: { file: "decor-board", width: 74, height: 86, originY: .8, name: "마을 안내판" },
  animal_cow: { file: "cow", width: 70, height: 64, originY: .8, name: "햇살 소" },
  animal_sheep: { file: "sheep", width: 70, height: 64, originY: .8, name: "구름 양" },
  chicken: { file: "chicken", width: 32, height: 32, originY: .5, name: "꼬꼬 닭" },
};

export const CROP_STAGES = ["seed", "sprout", "growing", "mature"] as const;
export const CROP_FAMILIES: Record<string, string> = {
  morningcarrot: "carrot", cloudturnip: "carrot", snowradish: "carrot",
  ribboncabbage: "cabbage", frostkale: "cabbage", sunpotato: "cabbage", honeyyam: "cabbage",
  ambermelon: "cabbage", moonpumpkin: "cabbage",
  rubytomato: "tomato", sunpepper: "tomato", goldcorn: "tomato", velveteggplant: "tomato", sunwheel: "tomato",
};
const stripMature: Record<string, string> = {
  morningcarrot: "carrot", ribboncabbage: "cabbage", rubytomato: "tomato", heartberry: "berry", sproutberry: "berry",
};
export function withPaintedArt(legacy: Record<string, Asset>, crops: readonly { id: string }[]): Record<string, Asset> {
  const assets = { ...legacy };
  for (const [id, a] of Object.entries(PAINTED_SPRITES)) {
    assets[id] = {
      ...legacy[id], assetId: id, textureKey: id,
      source: { kind: "image", path: `${root}/sprites/${a.file}.webp`,
        fallbackPath: legacy[id]?.source?.path },
      frameSize: legacy[id]?.frameSize ?? { width: a.width, height: a.height },
      origin: legacy[id]?.origin ?? { x: .5, y: a.originY },
      displayScale: legacy[id]?.displayScale ?? { x: 1, y: 1 },
    };
  }
  for (const crop of crops) for (const stage of CROP_STAGES) {
    const id = `crop_${crop.id}_${stage}`;
    const file = stage === "mature" && !stripMature[crop.id]
      ? `${crop.id}-mature` : `${CROP_FAMILIES[crop.id] ?? "berry"}-${stage}`;
    assets[id] = {
      assetId: id, textureKey: id, source: { kind: "image", path: `${root}/crops/${file}.webp` },
      frameSize: { width: 40, height: 52 }, origin: { x: .5, y: .8 }, displayScale: { x: 1, y: 1 },
    };
  }
  return assets;
}

export const TERRAIN_ART = Object.fromEntries(
  ["grass", "dirt", "stone", "gravel", "soil", "water"].map(id => [id, `${root}/terrain/${id}.webp`]),
);

/** No raw-image dimensions in placement math: image assets may be 2x/3x. */
export function visualSize(a: Asset | undefined, scale?: number) {
  return {
    width: (a?.frameSize?.width ?? 64) * (scale ?? a?.displayScale?.x ?? 1),
    height: (a?.frameSize?.height ?? 96) * (scale ?? a?.displayScale?.y ?? 1),
  };
}
export function foliageColor(id: string, season: SeasonKey): number {
  if (!/tree|bush|shrub|flower_bed|grass_tuft/.test(id)) return 0xffffff;
  return { spring: 0xffffff, summer: 0xe7f5d8, autumn: 0xffcea0, winter: 0xe5edf4 }[season];
}
