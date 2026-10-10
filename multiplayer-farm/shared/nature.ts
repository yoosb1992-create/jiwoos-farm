/** Stable nature IDs are shared by authority, inventory, renderer and editor. */
export const TREE_STAGES = ["새싹", "어린나무", "성목", "거목", "수호목"] as const;
export const TREE_STAGE_IDS = ["seedling", "young", "mature", "giant", "guardian"] as const;
export interface TreeSpecies {
  id: string; name: string; seed: string; seedName: string; seedPrice: number;
  days: readonly [number, number]; giantChance: number; guardianChance: number;
  giantMinDays: number; guardianMinDays: number; evergreen: boolean;
  drops: readonly { item: string; chance: number }[];
}
const species = (id: string, name: string, seed: string, seedName: string, seedPrice: number,
  days: readonly [number, number], extra: readonly { item: string; chance: number }[], evergreen = false): TreeSpecies => ({
  id: `tree_${id}`, name, seed, seedName, seedPrice, days, evergreen,
  giantChance: .02, guardianChance: .005, giantMinDays: 14, guardianMinDays: 28,
  drops: [{item: id === "bamboo" ? "bamboo" : "wood", chance: 1}, ...extra],
});
export const TREE_SPECIES: TreeSpecies[] = [
  species("cherry", "벚꽃나무", "cherry_seed", "벚꽃 씨앗", 30, [3,4], [{item:"cherry_petals",chance:1},{item:"cherry_seed",chance:1}]),
  species("pine", "소나무", "pine_cone", "솔방울", 20, [3,5], [{item:"pine_needles",chance:1},{item:"pine_cone",chance:1}], true),
  species("maple", "단풍나무", "maple_seed", "단풍 씨앗", 30, [3,4], [{item:"maple_seed",chance:1},{item:"maple_sap",chance:.15}]),
  species("willow", "버드나무", "willow_sapling", "버드 묘목", 35, [2,4], [{item:"willow_branch",chance:1},{item:"willow_sapling",chance:1}]),
  species("birch", "자작나무", "birch_sapling", "자작 묘목", 35, [2,5], [{item:"birch_bark",chance:1},{item:"birch_sapling",chance:1}]),
  species("oak", "참나무", "acorn", "도토리", 20, [3,5], [{item:"acorn",chance:1}]),
  species("bamboo", "대나무", "bamboo_shoot", "죽순", 40, [2,3], [{item:"bamboo_shoot",chance:1}], true),
  species("metasequoia", "메타세쿼이아", "metasequoia_seed", "메타세쿼이아 씨앗", 0, [3,5], [{item:"metasequoia_seed",chance:.25}]),
];
export const TREES = Object.fromEntries(TREE_SPECIES.map(t => [t.id, t]));
export const plantingTree = (item?: string) => TREE_SPECIES.find(t => t.seed === item);
export function inferSpecies(asset = "", id = ""): string {
  if (id === "starter-pine" || asset === "tree_variant_b") return "tree_pine";
  return TREE_SPECIES.find(t => asset === t.id || asset.startsWith(`${t.id}_`))?.id ?? "tree_oak";
}
export const treeHp = (stage: number) => [1, 2, 3, 5, 7][stage] ?? 3;
/** Independent stable rolls: adding another entity never changes an old tree's luck. */
export function natureRoll(seed: number, day: number, id: string, salt: string): number {
  let h = (seed ^ Math.imul(day, 0x9e3779b1)) >>> 0;
  for (const c of `${id}:${salt}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function treeSprite(species: string, stage: number, season = "spring"): string {
  const t = TREES[species] ?? TREES.tree_oak!;
  // Seasonal mature silhouettes include actual leaf loss; giant/guardian get
  // their own extended branches/roots in spring and evergreen seasons.
  const seasonal = stage >= 2 && !t.evergreen && season !== "spring";
  return `${t.id}_${seasonal ? season : TREE_STAGE_IDS[stage] ?? "mature"}`;
}
export const treeSeasonScale = (species: string, stage: number, season: string) =>
  stage >= 3 && !TREES[species]?.evergreen && season !== "spring" ? [1,1,1,1.35,1.7][stage]! : 1;
/** Seasonal old-growth crowns share the seasonal art, with the original
 * giant/guardian buttress roots composited over it to preserve their silhouette. */
export const treeRootSprite = (species: string, stage: number, season: string) =>
  treeSeasonScale(species,stage,season) > 1 ? `${species}_${TREE_STAGE_IDS[stage]}` : undefined;
export const NATURE_MATERIALS: Record<string, string> = {
  cherry_petals:"벚꽃잎", maple_sap:"단풍 수액", willow_branch:"버드가지", birch_bark:"자작 껍질", bamboo:"대나무 줄기",
};
export const DEBRIS = [
  ...["twig_a","twig_b","twig_c","forked_twig","leafy_branch","thick_branch"].map((id,i)=>({id:`farm_${id}`,name:["마른 가지 A","마른 가지 B","굽은 가지","갈라진 가지","잎 달린 가지","굵은 가지"][i]!,kind:"twig",item:"wood"})),
  ...["stone_a","stone_b","moss_stone","flat_stone","dark_stone","small_stone_cluster"].map((id,i)=>({id:`farm_${id}`,name:["들돌 A","들돌 B","이끼돌","납작돌","검은돌","작은 돌무리"][i]!,kind:"rock",item:"stone"})),
  ...["weed","weed_b","weed_c"].map((id,i)=>({id:`farm_${id}`,name:["잡초 A","잡초 B","잡초 C"][i]!,kind:"gather",item:"wild_herb"})),
  ...["white","yellow","pink","purple"].map((color,i)=>({id:`farm_${color}_wildflower`,name:["흰 들꽃","노란 들꽃","분홍 들꽃","보라 들꽃"][i]!,kind:"gather",item:`wildflower_${color}`})),
];
export const FARM_GRASS = [
  {id:"farm_short_grass",name:"짧은 목초",kind:"gather",item:"grass"},
  {id:"farm_tall_grass",name:"긴 목초",kind:"gather",item:"grass"},
  {id:"farm_clover",name:"토끼풀 목초",kind:"gather",item:"grass"},
] as const;
export const GARDEN_FLOWERS = [
  {id:"flower_daisy",name:"데이지 덤불"},{id:"flower_poppy",name:"양귀비"},
  {id:"flower_bluebell",name:"블루벨"},{id:"flower_hydrangea",name:"수국"},
  {id:"flower_lavender",name:"라벤더 군락"},
];
// The opening farm should feel overgrown: clearing space is an early-game activity.
// Daily regrowth is intentionally much gentler than this first dense pass.
export const DEBRIS_FIRST = 1800, DEBRIS_MAX = 2200;
export const GRASS_FIRST = 2400, GRASS_MAX = 3000;
/** Natural trees are deliberately spread through the future field too. Farmable is
 * only permission to use the hoe; until a tile is actually tilled it is natural grass.
 * This is intentionally extreme: the opening cleanup is a major part of day one. */
export const NATURAL_TREE_FIRST = 260;
