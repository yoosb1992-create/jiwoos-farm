import { validateLayout, type WorldLayout } from "./layout.js";
import { migrateMap } from "./world2.js";
import { activateHomeFurniture } from "./home-furniture.js";
import { safeSpawn } from "./regions.js";
import type { World } from "./world.js";

export interface OfficialWorld {
  revision: number;
  layout: WorldLayout;
}
export type StartWorld =
  | { type: "official" }
  | { type: "published"; id: string }
  | { type: "local"; layout: WorldLayout; id: string; revision: number }
  | { type: "server"; id: string; editToken: string; revision: number };
export interface BlueprintCapability {
  auth?: "blueprint" | "session";
  id: string;
  editToken: string;
  revision: number;
  name?: string;
}
export interface FarmBackup {
  id: string;
  createdAt: string;
  revision: number;
  reason: string;
}
export interface FarmSnapshot {
  farmId: string;
  farmName: string;
  world: World;
  backups: FarmBackup[];
}
export interface LayoutConflict {
  area: string;
  id: string;
  x: number;
  y: number;
  reason: string;
}
export interface LayoutReview {
  revision: number;
  layoutRevision: number;
  changedMaps: string[];
  conflicts: LayoutConflict[];
  protectedEntities: number;
  protectedMembers: number;
  previewId?: string;
  backupId?: string;
  restore?: boolean;
}
/** Normalize only NEW layouts, never rewrite an existing family's snapshot. */
export function prepareLayout(value: unknown): WorldLayout {
  try {
    const layout = validateLayout(value);
    layout.version = 2;
    for (const map of Object.values(layout.maps)) migrateMap(map);
    activateHomeFurniture(layout.maps);
    for (const map of Object.values(layout.maps))
      for (const spawn of map.spawns) safeSpawn(map.id, spawn.id, layout.maps);
    return layout;
  } catch (error) {
    throw Error(
      "설계도 오류: " +
        (error instanceof Error ? error.message : "형식을 확인하세요"),
    );
  }
}
