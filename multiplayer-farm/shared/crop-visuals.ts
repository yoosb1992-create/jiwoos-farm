export type SeedForm = "fine" | "grain" | "round" | "bean" | "flat" | "bulb" | "tuber";
export type PlantForm = "berry" | "root" | "leaf" | "stalk" | "vine" | "bush" | "flower" | "bulb" | "spike";
export interface CropVisual { seed: SeedForm; plant: PlantForm }
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
