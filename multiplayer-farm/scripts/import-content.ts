/** One-way data snapshot from Golden Baseline; never imports the legacy runtime at play time. */
import { writeFileSync } from "node:fs";
import { MAP_DEFINITIONS } from "../../game/maps/definitions";
import { CROP_DEFINITIONS } from "../../game/data/crops";
import { ITEM_DEFINITIONS } from "../../game/data/items";
import { CRAFTING_RECIPES } from "../../game/crafting/definitions";
import { MACHINE_PROCESSES } from "../../game/machines/definitions";
import {
  PLAYER_ASSET,
  TILE_ASSETS,
  WORLD_OBJECT_ASSETS,
  CROP_ASSETS,
  ITEM_ASSETS,
} from "../../game/assets/definitions";
import { NPC_DEFINITIONS } from "../../game/npc/definitions";
import { FISH_DEFINITIONS } from "../../game/fishing/definitions";
const data = {
  maps: MAP_DEFINITIONS,
  crops: CROP_DEFINITIONS,
  items: ITEM_DEFINITIONS,
  recipes: CRAFTING_RECIPES,
  machines: MACHINE_PROCESSES,
  assets: {
    ...TILE_ASSETS,
    ...WORLD_OBJECT_ASSETS,
    ...CROP_ASSETS,
    ...ITEM_ASSETS,
    player: PLAYER_ASSET,
  },
  npcs: NPC_DEFINITIONS,
  fish: FISH_DEFINITIONS,
};
writeFileSync(
  new URL("../shared/legacy-content.json", import.meta.url),
  JSON.stringify(data, null, 2) + "\n",
);
