import { ASSETS, ITEMS } from "./content.js";
import type { Entity } from "./world.js";

/** Only live natural gather entities qualify. Crop/decorative flowers never do. */
export const naturalFlower = (e: Pick<Entity,"kind"|"item">) =>
  e.kind === "gather" && ITEMS[e.item]?.naturalHarvest === "flower";
export const rockClass = (e: Pick<Entity,"asset"|"item">) =>
  ASSETS[e.asset]?.rockClass ?? (e.item === "copper_ore" ? "ore" : "stone");
export const rockMaxHp = (e: Pick<Entity,"asset"|"item">) => rockClass(e) === "ore" ? 3 : 1;
/** Lazy, additive save compatibility. Preserve old partial damage, coordinates,
 * IDs and drops. The marker prevents healing on reconnect or every new hit. */
export function normalizeRock(e: Entity): void {
  if (e.kind !== "rock" || e.rockRule === 1) return;
  const max = rockMaxHp(e);
  e.item ||= ASSETS[e.asset]?.rockDrop ?? "stone";
  e.hp = max === 1 ? 1 : e.hp === 1 ? 2 : 3;
  e.rockRule = 1;
}
