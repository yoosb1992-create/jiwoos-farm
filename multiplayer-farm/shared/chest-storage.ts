import type { World } from "./world.js";

export type ChestStores = Record<string, Record<string, number>>;
/** Saved server-side bindings. Ordinary chests need no entry. */
export type ChestBinding = { mode: "individual" } | { mode: "shared"; group: string };

export function chestStorageKey(id: string, binding?: ChestBinding): string {
  return binding?.mode === "shared" ? `shared:${binding.group}` : `chest:${id}`;
}

/** Move the old ledger exactly once; the snapshot and receipts commit atomically.
 * Prefer the farmhouse chest, then the outdoor default, then a stable entity ID.
 * If there is no empty real chest yet, retain the legacy ledger until one exists.
 * Never overwrite a store or discard stores for temporarily absent entities.
 */
export function migrateChestStorage(w: World): void {
  const stores = w.chestStores ??= {};
  if (!Object.keys(w.chest).length) return;
  const rank = (id: string) => id === "family_chest" ? 0 : id === "family-chest" ? 1 : 2;
  const chests = Object.values(w.entities).filter(e => e.kind === "chest")
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id, "en"));
  const target = chests.find(e => w.chestBindings?.[e.id]?.mode !== "shared" &&
    !Object.keys(stores[chestStorageKey(e.id)] ?? {}).length);
  if (!target) return;
  stores[chestStorageKey(target.id)] = w.chest;
  w.chest = {};
  w.legacyChestTarget = target.id;
}

/** Call only after the command's chest target and distance have been validated. */
export function chestInventory(w: World, id: string): Record<string, number> {
  migrateChestStorage(w);
  const key = chestStorageKey(id, w.chestBindings?.[id]);
  return w.chestStores![key] ??= {};
}

/** Clients receive the server's routing map; commands still contain only targetId. */
export function chestStorageKeys(w: World): Record<string, string> {
  return Object.fromEntries(Object.values(w.entities).filter(e => e.kind === "chest")
    .map(e => [e.id, chestStorageKey(e.id, w.chestBindings?.[e.id])]));
}
