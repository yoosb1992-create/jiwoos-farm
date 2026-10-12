import { ITEMS, RECIPES } from "../shared/content.js";

export const CRAFT_CATEGORIES = [
  { id: "all", name: "전체" },
  { id: "materials", name: "재료 / 가공" },
  { id: "equipment", name: "도구 / 설비" },
  { id: "food", name: "음식 / 소모품" },
  { id: "other", name: "장식 / 기타" },
] as const;
export type CraftCategory = typeof CRAFT_CATEGORIES[number]["id"];
type Recipe = typeof RECIPES[string];

function categoryOf(recipe: Recipe): CraftCategory {
  const item = ITEMS[recipe.output.itemId];
  if (item?.kind === "tool" || item?.kind === "placeable") return "equipment";
  if ((item?.energy ?? 0) > 0 || item?.id === "animal_feed") return "food";
  if (item?.kind === "material" || item?.kind === "resource") return "materials";
  return "other";
}
export function recipesInCategory(category: CraftCategory): Recipe[] {
  return Object.values(RECIPES).filter(r => category === "all" || categoryOf(r) === category);
}
export const visibleCraftCategories = CRAFT_CATEGORIES.filter(c => recipesInCategory(c.id).length > 0);
