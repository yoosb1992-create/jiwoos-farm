import type { Actor, Entity, Facing, Member, World } from "./world.js";
import { chestInfo } from "./chest-storage.js";
import type { TransportMode } from "./transport-config.js";
export interface CarriedChest {
  itemId: "storage_chest";
  mode: TransportMode;
  storageKey: string;
  entities: Entity[];
  position: Pick<Actor, "area" | "x" | "y" | "facing">;
}
export interface CarryAppearance { ids: string[]; size: number; color: string; name: string }
export interface TransportFx extends CarryAppearance {
  id: string; actorId: string; area: string; kind: "lift" | "lower";
  x: number; y: number; facing: Facing; cells: Array<{ x: number; y: number }>;
}
export function carryAppearance(w: World, m: Member): CarryAppearance | undefined {
  if (!m.carried?.entities.length) return;
  const info = chestInfo(w, m.carried.entities[0]!.id);
  return { ids: info.members, size: info.size, color: info.color, name: info.name };
}
