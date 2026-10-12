import { ITEMS } from "./content.js";
export const BAG_CATEGORIES = [
  ["all","전체"],["tools","도구"],["seeds","씨앗 / 묘목"],["harvest","작물 / 수확물"],
  ["materials","재료"],["food","음식 / 소모품"],["placeable","설치 / 장식"],["other","기타"],
] as const;
export type BagCategory = typeof BAG_CATEGORIES[number][0];
export function itemCategory(id: string): BagCategory {
  const item=ITEMS[id];
  if(id==="hand" || item?.kind==="tool")return "tools";
  if(!item)return "other";
  if(["seed","tree_seed","sapling"].includes(item.kind))return "seeds";
  if(item.placement || ["placeable","decoration","machine","furniture"].includes(item.kind))return "placeable";
  if(["crop","produce","fish","forage"].includes(item.kind))return "harvest";
  if(["food","consumable","feed"].includes(item.kind) || (item.energy??0)>0)return "food";
  if(["material","resource","ore"].includes(item.kind))return "materials";
  return "other";
}
