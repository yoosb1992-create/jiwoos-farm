import type { World } from "./world.js";

export type ChestStores = Record<string, Record<string, number>>;
/** Saved server-side bindings. Ordinary chests need no entry. */
export type ChestBinding = { mode: "individual" } | { mode: "group" | "shared"; group: string };
export const CHEST_COLORS = {
  wood: { name: "나무색", light: "#ebbf77", main: "#bd854e", dark: "#795031" },
  red: { name: "빨강", light: "#eea38a", main: "#bd6155", dark: "#763d3d" },
  yellow: { name: "노랑", light: "#f6dc89", main: "#d0aa4d", dark: "#8b7135" },
  green: { name: "초록", light: "#b8cf8a", main: "#80995b", dark: "#4e663f" },
  blue: { name: "파랑", light: "#a9cbd9", main: "#7397b3", dark: "#475f7c" },
  purple: { name: "보라", light: "#d0b5d7", main: "#a17fae", dark: "#6a527b" },
  gray: { name: "회색", light: "#d0cec0", main: "#a09f96", dark: "#64665f" },
} as const;
export type ChestColor = keyof typeof CHEST_COLORS;
export interface ChestSettings { name?: string; color?: ChestColor }
export interface ChestInfo {
  storageKey: string; name: string; customName: string; color: ChestColor; size: number; index: number;
  capacity: number; used: number; members: string[];
}
export const CHEST_NAME_LIMIT = 20;
export const CHEST_SLOTS = 16;

export function validChestName(value: unknown): value is string {
  return typeof value === "string" && [...value.normalize("NFC").trim()].length <= CHEST_NAME_LIMIT &&
    !/[\p{Cc}\p{Cf}<>]/u.test(value);
}
export function validChestColor(value: unknown): value is ChestColor {
  return typeof value === "string" && Object.hasOwn(CHEST_COLORS, value);
}

export function chestStorageKey(id: string, binding?: ChestBinding): string {
  return binding && binding.mode !== "individual" ? `${binding.mode}:${binding.group}` : `chest:${id}`;
}
export function chestInfo(w: World, id: string): ChestInfo {
  const binding = w.chestBindings?.[id], storageKey = chestStorageKey(id, binding);
  const members = binding?.mode === "group" ? w.chestGroups?.[binding.group] ?? [id] : [id];
  const size = members.length, settings = w.chestSettings?.[storageKey];
  return { storageKey, members, size, index: Math.max(0, members.indexOf(id)), capacity: CHEST_SLOTS * size,
    customName: settings?.name ?? "",
    name: settings?.name || ["작은 보관함", "큰 보관함", "대형 보관함"][size - 1] || "보관함",
    color: validChestColor(settings?.color) ? settings.color : "wood",
    used: Object.values(w.chestStores?.[storageKey] ?? {}).filter(n => n > 0).length };
}
export function chestInfos(w: World): Record<string, ChestInfo> {
  return Object.fromEntries(Object.values(w.entities).filter(e => e.kind === "chest").map(e => [e.id, chestInfo(w, e.id)]));
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
    !Object.keys(stores[chestStorageKey(e.id, w.chestBindings?.[e.id])] ?? {}).length);
  if (!target) return;
  stores[chestStorageKey(target.id, w.chestBindings?.[target.id])] = w.chest;
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
