import { adjacentCells, planPlacement, type PlacementPlan } from "../shared/placement.js";
import type { Actor, World } from "../shared/world.js";
import type { ColyseusAdapter, RenderPlayer } from "./network.js";
import { CLIENT_MAPS } from "./layout.js";
import { frontTile } from "../shared/applyMovement.js";

export interface PlacementHint extends Pick<PlacementPlan, "cells" | "error"> { tileX: number; tileY: number }
export function placementHints(network: ColyseusAdapter, me: RenderPlayer, itemId?: string): PlacementHint[] {
  const personal = network.personal, carried = personal?.member.carried;
  if (!network.state || (!itemId && !carried)) return [];
  const actor: Actor = { id: personal?.member.id ?? "", area: me.area, x: me.authoritativeX, y: me.authoritativeY,
    facing: me.facing, stamina: me.stamina, running: false };
  const bindings: NonNullable<World["chestBindings"]> = {}, groups: NonNullable<World["chestGroups"]> = {}, settings: NonNullable<World["chestSettings"]> = {};
  for (const [id, info] of Object.entries(personal?.chestInfos ?? {})) {
    if (info.storageKey.startsWith("group:")) { const group = info.storageKey.slice(6); bindings[id] = { mode: "group", group }; groups[group] = info.members; }
    else if (info.storageKey.startsWith("shared:")) bindings[id] = { mode: "shared", group: info.storageKey.slice(7) };
    settings[info.storageKey] = { name: info.customName, color: info.color };
  }
  if (carried?.storageKey.startsWith("group:")) {
    const group = carried.storageKey.slice(6);
    groups[group] = carried.entities.map(e => e.id);
    for (const e of carried.entities) bindings[e.id] = { mode: "group", group };
  }
  const world: World = { version: 11, revision: network.state.revision, day: network.state.day, minute: network.state.minute, weather: network.state.weather, seed: 0, deepest: 1, members: {}, events: [], entities: Object.fromEntries(network.state.entities.entries()), layout: { version: 1, maps: CLIENT_MAPS },
    chest: {}, chestStores: personal?.chestStores ?? {}, chestBindings: bindings, chestGroups: groups, chestSettings: settings,
    nextEntity: 1_000_000_000 };
  const choices = itemId ? adjacentCells(actor) : [frontTile(actor)];
  const others = network.snapshot().players.filter(p => !p.local && p.connected).map(p => ({ area: p.area, x: p.authoritativeX, y: p.authoritativeY }));
  return choices.map(t => {
    const plan = planPlacement(world, actor, itemId ?? "storage_chest", t.tileX, t.tileY, itemId ? undefined : carried?.entities, others);
    return { ...t, cells: plan.cells, error: plan.error };
  });
}
