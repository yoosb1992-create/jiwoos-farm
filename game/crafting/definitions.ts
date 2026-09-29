import type { CraftingRecipe } from "./types";

export const CRAFTING_RECIPES = {
  wood_plank: {
    id: "wood_plank", name: "목재판", description: "나무를 켜서 단단한 판재를 만듭니다.",
    ingredients: [{ itemId: "wood", quantity: 2 }], output: { itemId: "wood_plank", quantity: 1 },
  },
  stone_block: {
    id: "stone_block", name: "다듬은 돌", description: "작은 돌을 모아 반듯하게 다듬습니다.",
    ingredients: [{ itemId: "stone", quantity: 3 }], output: { itemId: "stone_block", quantity: 1 },
  },
  fairy_thread: {
    id: "fairy_thread", name: "요정실", description: "들풀과 요정꽃에서 가느다란 실을 뽑습니다.",
    ingredients: [{ itemId: "wild_herb", quantity: 2 }, { itemId: "fairy_bloom", quantity: 1 }],
    output: { itemId: "fairy_thread", quantity: 1 },
  },
  wood_processor: {
    id: "wood_processor", name: "목재 가공기", description: "농장에 배치해 나무를 목재판으로 가공합니다.",
    ingredients: [{ itemId: "wood_plank", quantity: 2 }, { itemId: "stone_block", quantity: 1 }], output: { itemId: "wood_processor", quantity: 1 },
  },
} as const satisfies Record<string, CraftingRecipe>;

export type RecipeId = keyof typeof CRAFTING_RECIPES;
export const getRecipe = (id: unknown): CraftingRecipe | null =>
  typeof id === "string" && Object.hasOwn(CRAFTING_RECIPES, id) ? CRAFTING_RECIPES[id as RecipeId] : null;
