export const ITEM_DEFINITIONS = {
  hoe: { id: "hoe", name: "괭이", kind: "tool", assetId: "item_hoe", toolbarHint: "땅 갈기" },
  seed: { id: "seed", name: "씨앗", kind: "seed", assetId: "item_seed", toolbarHint: "심기" },
  water: { id: "water", name: "물뿌리개", kind: "tool", assetId: "item_water", toolbarHint: "물 주기" },
  hand: { id: "hand", name: "손", kind: "tool", assetId: "item_hand", toolbarHint: "수확" },
  sproutberry_seed: { id: "sproutberry_seed", name: "새싹열매 씨앗", kind: "seed", assetId: "item_seed", sellPrice: 0 },
  sproutberry: { id: "sproutberry", name: "새싹열매", kind: "crop", assetId: "item_sproutberry", sellPrice: 35 },
} as const;

export type ItemId = keyof typeof ITEM_DEFINITIONS;
