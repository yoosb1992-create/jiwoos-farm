export type SeedForm = "fine" | "grain" | "round" | "bean" | "flat" | "bulb" | "tuber";
export type PlantForm = "berry" | "root" | "leaf" | "stalk" | "vine" | "bush" | "flower" | "bulb" | "spike";
export interface CropVisual { seed: SeedForm; plant: PlantForm }
/** One ground-contact convention for the generated 40x52 seed/young artwork.
 * World coordinates remain the tile center; this offset is presentation only. */
export const CROP_GROUND_OFFSET = 6;
export const CROP_TEXTURE = { width: 40, height: 52, rootX: 20, rootY: 44 } as const;
export const CROP_ORIGIN = { x: CROP_TEXTURE.rootX / CROP_TEXTURE.width, y: CROP_TEXTURE.rootY / CROP_TEXTURE.height };

/** Measured ground contacts in the original 80x104 painted mature images.
 * Alpha bounds include leaves and soil shadows, so they are not root anchors.
 * Keys are source artwork names (several crops intentionally share an image). */
export const MATURE_ROOTS: Readonly<Record<string, readonly [number, number]>> = {
  ambermelon:[40,74], berry:[39,69], bluepearl:[41,77], cabbage:[39,73],
  carrot:[39,75], cloudturnip:[40,78], dewflower:[42,75], duskgrape:[42,81],
  frostkale:[40,77], goldcorn:[42,80], honeyyam:[40,72], moonpumpkin:[41,73],
  redbell:[41,76], snowradish:[40,76], sunpepper:[43,75], sunpotato:[40,78],
  sunwheel:[42,79], tomato:[40,78], velveteggplant:[42,79], winterstar:[41,76],
  // Later nature artwork is also 80x104, with a common lower root baseline.
  pinktulip:[40,80], sweetpea:[40,80], springonion:[40,80], coolcucumber:[40,80],
  watermelon:[40,80], lavender:[40,80], rubybeet:[40,80], chrysanthemum:[40,80],
  scarletbean:[40,80], icelettuce:[40,80], snowpea:[40,80], frostflower:[40,80],
};
export function matureCropOrigin(source: string): { x: number; y: number } {
  const root = MATURE_ROOTS[source];
  return root ? { x: root[0] / 80, y: root[1] / 104 } : CROP_ORIGIN;
}
/** Botanical presentation only; IDs, growth days, seasons and saves are unchanged.
 * Fantasy names keep a recognizable real-world plant silhouette. */
export const CROP_VISUALS: Record<string, CropVisual> = Object.fromEntries([
  ["sproutberry", "fine", "berry"], ["sunpotato", "tuber", "bush"],
  ["heartberry", "fine", "berry"], ["morningcarrot", "fine", "root"],
  ["cloudturnip", "round", "root"], ["ribboncabbage", "round", "leaf"],
  ["dewflower", "fine", "flower"], ["rubytomato", "flat", "bush"],
  ["goldcorn", "grain", "stalk"], ["bluepearl", "fine", "berry"],
  ["sunpepper", "flat", "bush"], ["sunwheel", "grain", "flower"],
  ["ambermelon", "flat", "vine"], ["moonpumpkin", "flat", "vine"],
  ["velveteggplant", "flat", "bush"], ["honeyyam", "tuber", "vine"],
  ["duskgrape", "round", "vine"], ["redbell", "fine", "berry"],
  ["snowradish", "round", "root"], ["frostkale", "round", "leaf"],
  ["winterstar", "fine", "flower"], ["pinktulip", "bulb", "bulb"],
  ["sweetpea", "round", "vine"], ["springonion", "round", "bulb"],
  ["coolcucumber", "flat", "vine"], ["watermelon", "flat", "vine"],
  ["lavender", "fine", "spike"], ["rubybeet", "round", "root"],
  ["chrysanthemum", "fine", "flower"], ["scarletbean", "bean", "vine"],
  ["icelettuce", "round", "leaf"], ["snowpea", "round", "vine"],
  ["frostflower", "fine", "flower"],
].map(([id, seed, plant]) => [id, { seed: seed as SeedForm, plant: plant as PlantForm }]));

export const cropVisual = (id: string): CropVisual => CROP_VISUALS[id] ?? { seed: "fine", plant: "berry" };
