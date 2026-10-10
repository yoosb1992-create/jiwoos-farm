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
  tree_cherry: { file: "broadleaf", width: 132, height: 164, originY: .92, name: "벚꽃나무" },
  tree_maple: { file: "broadleaf", width: 132, height: 164, originY: .92, name: "단풍나무" },
  tree_birch: { file: "broadleaf", width: 122, height: 158, originY: .92, name: "자작나무" },
  tree_willow: { file: "broadleaf", width: 140, height: 170, originY: .92, name: "버드나무" },
  flower_daisy: { file: "flowering-bush", width: 58, height: 42, originY: .94, name: "들국화" },
  flower_poppy: { file: "flowering-bush", width: 58, height: 42, originY: .94, name: "양귀비꽃" },
  flower_bluebell: { file: "flowering-bush", width: 58, height: 42, originY: .94, name: "푸른방울꽃" },
  flower_lavender: { file: "flowering-bush", width: 60, height: 44, originY: .94, name: "라벤더 덤불" },
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
  springonion: "carrot", rubybeet: "carrot",
  ribboncabbage: "cabbage", frostkale: "cabbage", sunpotato: "cabbage", honeyyam: "cabbage",
  ambermelon: "cabbage", moonpumpkin: "cabbage", watermelon: "cabbage", icelettuce: "cabbage",
  rubytomato: "tomato", sunpepper: "tomato", goldcorn: "tomato", velveteggplant: "tomato", sunwheel: "tomato",
  sweetpea: "berry", coolcucumber: "berry", scarletbean: "berry", snowpea: "berry",
  pinktulip: "berry", lavender: "berry", chrysanthemum: "berry", frostflower: "berry",
};
const stripMature: Record<string, string> = {
  morningcarrot: "carrot", ribboncabbage: "cabbage", rubytomato: "tomato",
  heartberry: "berry", sproutberry: "berry",
  pinktulip: "dewflower", lavender: "dewflower",
  chrysanthemum: "sunwheel", frostflower: "winterstar",
  watermelon: "ambermelon",
};
const bespokeMature = new Set([
  "ambermelon", "bluepearl", "cloudturnip", "dewflower", "duskgrape",
  "frostkale", "goldcorn", "honeyyam", "moonpumpkin", "redbell",
  "snowradish", "sunpepper", "sunpotato", "sunwheel", "velveteggplant",
  "winterstar",
]);
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
    const family = CROP_FAMILIES[crop.id] ?? "berry";
    const file = stage === "mature"
      ? stripMature[crop.id] ?? (bespokeMature.has(crop.id) ? crop.id : family)
      : family;
    const fileName = stage === "mature" && bespokeMature.has(crop.id)
      ? `${file}-mature`
      : `${file}-${stage}`;
    assets[id] = {
      assetId: id, textureKey: id, source: { kind: "image", path: `${root}/crops/${fileName}.webp` },
      frameSize: { width: 40, height: 52 }, origin: { x: .5, y: .8 }, displayScale: { x: 1, y: 1 },
    };
  }
  for (const [id, size] of Object.entries({
    farm_twig_a: [48, 28],
    farm_twig_b: [54, 30],
    farm_stone_a: [40, 30],
    farm_stone_b: [46, 34],
    farm_weed: [38, 34],
    farm_wildflower: [42, 38],
  } as Record<string, [number, number]>))
    assets[id] = {
      assetId: id,
      textureKey: id,
      source: null,
      frameSize: { width: size[0], height: size[1] },
      origin: { x: .5, y: .85 },
      displayScale: { x: 1, y: 1 },
    };
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
  if(id.startsWith("tree_") || id==="tree" || id.startsWith("flower_") || id.startsWith("farm_")) return 0xffffff;
  if (id === "tree_cherry")
    return { spring: 0xffd1dc, summer: 0xd9f2c0, autumn: 0xf1b47e, winter: 0xe8edf2 }[season];
  if (id === "tree_maple")
    return { spring: 0xe4f2c3, summer: 0xc8e8a4, autumn: 0xf28b52, winter: 0xe4ebef }[season];
  if (id === "tree_birch")
    return { spring: 0xe8f4c9, summer: 0xd7edb3, autumn: 0xe4c679, winter: 0xedf2f3 }[season];
  if (id === "tree_willow")
    return { spring: 0xd3efad, summer: 0xb7df91, autumn: 0xd0b46b, winter: 0xe3ecec }[season];
  if (id === "flower_daisy") return 0xfff4c7;
  if (id === "flower_poppy") return 0xffb09f;
  if (id === "flower_bluebell") return 0xc8c6ff;
  if (id === "flower_lavender") return 0xd7b9f2;
  if (!/tree|bush|shrub|flower_bed|grass_tuft|flower_/.test(id)) return 0xffffff;
  return { spring: 0xffffff, summer: 0xe7f5d8, autumn: 0xffcea0, winter: 0xe5edf4 }[season];
}
