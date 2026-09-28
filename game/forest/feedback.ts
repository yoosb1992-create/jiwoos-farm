import type { MapObjectDefinition } from "../maps/types";
import type { ForestState } from "./resources";
import { FOREST_RESOURCES, resourceKind } from "./resources";

export type ForestFeedback = { kind: "hit" | "felled" | "picked"; progress?: string; pickup?: string };

/** Derive visual feedback only from an accepted state transition, never from a pending request. */
export function forestFeedback(object: MapObjectDefinition, before: ForestState | null, after: ForestState | null,
  awardedItem?: string, awardedQuantity?: number): ForestFeedback | null {
  const kind = resourceKind(object);
  if (!kind || !before || !after || before.daySerial !== after.daySerial || before.depleted.includes(object.id)) return null;
  const definition = FOREST_RESOURCES[kind];
  if (after.depleted.includes(object.id)) {
    const awarded = awardedItem === definition.drop && awardedQuantity === definition.quantity;
    return { kind: kind === "tree" ? "felled" : "picked", pickup: awarded ? `+${definition.quantity} ${definition.name === "나무" ? "목재" : definition.name}` : undefined };
  }
  const count = after.hits[object.id] ?? 0;
  return count > (before.hits[object.id] ?? 0) && count < definition.hits ?
    { kind: "hit", progress: `${count}/${definition.hits}` } : null;
}
