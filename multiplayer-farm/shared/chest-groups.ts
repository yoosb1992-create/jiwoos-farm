import { TILE } from "./content.js";
import { STACK_LIMIT } from "./household.js";
import { CHEST_SLOTS, chestInfo, chestStorageKey, migrateChestStorage } from "./chest-storage.js";
import type { Entity, World } from "./world.js";

const ordinary = (w: World, e: Entity) => e.kind === "chest" && w.chestBindings?.[e.id]?.mode !== "shared";
const adjacent = (a: Entity, b: Entity) => a.area === b.area && Math.abs(a.y - b.y) < .01 && Math.abs(Math.abs(a.x - b.x) - TILE) < .01;
const order = (a: Entity, b: Entity) => a.x - b.x || a.id.localeCompare(b.id, "en");

/** Resolve neighbors by world coordinates, never by client-supplied membership. */
export function adjacentChestIds(w: World, id: string): string[] {
  const first = w.entities[id];
  if (!first || !ordinary(w, first)) return [];
  const candidates = Object.values(w.entities).filter(e => ordinary(w, e));
  const found = new Map([[id, first]]), queue = [first];
  for (const current of queue) for (const e of candidates) {
    if (!found.has(e.id) && adjacent(current, e)) { found.set(e.id, e); queue.push(e); }
  }
  return [...found.values()].sort(order).map(e => e.id);
}

/** Validate the entire merge before touching either source ledger. FarmRoom
 * commits this proposed snapshot and action receipt in the same transaction. */
export function mergeChestGroup(w: World, ids: string[], preferredId = ids[0]!): string | undefined {
  const members = [...new Set(ids)].map(id => w.entities[id]).filter((e): e is Entity => !!e).sort(order);
  if (members.length < 2) return "가로로 바로 옆에 보관함을 놓아 주세요.";
  if (members.length > 3) return "보관함은 가로로 최대 3칸까지 연결할 수 있어요.";
  if (members.length !== ids.length || members.some((e, i) => !ordinary(w, e) || (i > 0 && !adjacent(members[i - 1]!, e))))
    return "같은 높이에서 가로로 인접한 일반 보관함만 연결할 수 있어요.";
  const memberIds = members.map(e => e.id);
  if (members.some(e => chestInfo(w, e.id).members.some(id => !memberIds.includes(id))))
    return "이미 연결된 보관함은 함께 연결해야 해요.";
  const keys = [...new Set(members.map(e => chestStorageKey(e.id, w.chestBindings?.[e.id])))];
  if (keys.length === 1) return "이미 하나로 연결된 보관함이에요.";
  const merged: Record<string, number> = {};
  for (const key of keys) for (const [item, count] of Object.entries(w.chestStores?.[key] ?? {})) {
    if (!Number.isSafeInteger(count) || count < 0 || count > STACK_LIMIT || (merged[item] ?? 0) + count > STACK_LIMIT)
      return "같은 아이템의 수량 한도를 넘어 연결할 수 없어요. 먼저 물품을 꺼내 주세요.";
    if (count > 0) merged[item] = (merged[item] ?? 0) + count;
  }
  if (Object.keys(merged).length > members.length * CHEST_SLOTS)
    return "연결 후 용량을 넘어요. 물품을 꺼낸 뒤 다시 연결해 주세요.";
  // Retain an existing group's ID even when a new chest is added on its left.
  const existing = members.map(e => w.chestBindings?.[e.id]).find(b => b?.mode === "group");
  const group = existing && existing.mode === "group" ? existing.group : members[0]!.id;
  const key = `group:${group}`, stores = w.chestStores ?? {};
  if (!keys.includes(key) && Object.values(stores[key] ?? {}).some(n => n > 0))
    return "이전에 저장한 물품을 보호하기 위해 연결하지 못했어요.";
  const preferred = chestStorageKey(preferredId, w.chestBindings?.[preferredId]);
  const settings = { ...w.chestSettings?.[preferred] };
  w.chestStores ??= {};
  w.chestSettings ??= {};
  w.chestGroups ??= {};
  w.chestBindings ??= {};
  for (const source of keys) {
    w.chestStores[source] = {};
    if (source.startsWith("group:") && source !== key) delete w.chestGroups[source.slice(6)];
  }
  w.chestStores[key] = merged;
  w.chestSettings[key] = settings;
  w.chestGroups[group] = memberIds;
  for (const id of memberIds) w.chestBindings[id] = { mode: "group", group };
}

/** Splitting is deliberately limited to empty groups. No item distribution or
 * copying takes place, and read/reconnect never automatically reconnects it. */
export function splitChestGroup(w: World, id: string): string | undefined {
  const binding = w.chestBindings?.[id], info = chestInfo(w, id);
  if (binding?.mode !== "group" || info.size < 2) return "연결된 보관함이 아니에요.";
  if (Object.values(w.chestStores?.[info.storageKey] ?? {}).some(n => n !== 0))
    return "물품을 모두 꺼낸 뒤 연결을 해제해 주세요.";
  const settings = w.chestSettings?.[info.storageKey];
  w.chestSettings ??= {};
  for (const member of info.members) {
    w.chestBindings![member] = { mode: "individual" };
    w.chestSettings[`chest:${member}`] = { ...settings };
  }
  delete w.chestGroups![binding.group];
}

/** One-time additive JSON upgrade, also used for new World Editor layouts.
 * Longer rows become 3+3+…+1. Unsafe merges retain every original ledger. */
export function initializeChestGroups(w: World): void {
  migrateChestStorage(w);
  if (w.chestGroupsVersion === 1) return;
  const visited = new Set<string>();
  for (const e of Object.values(w.entities).sort(order)) {
    if (!ordinary(w, e) || visited.has(e.id) || w.chestBindings?.[e.id]?.mode === "group") continue;
    const row = adjacentChestIds(w, e.id);
    row.forEach(id => visited.add(id));
    for (let i = 0; i < row.length; i += 3) {
      const part = row.slice(i, i + 3);
      if (part.length > 1) mergeChestGroup(w, part);
    }
  }
  w.chestGroupsVersion = 1;
}
