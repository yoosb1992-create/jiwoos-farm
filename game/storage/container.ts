import { Inventory } from "../domain";
import { ITEM_DEFINITIONS, type ItemId } from "../data/items";
import { CONTAINER_DEFINITIONS, isContainerId } from "./definitions";
import type { ContainerData, ContainerId, StorageData, StorageTransfer } from "./types";

export const isStorableItemId = (value: unknown): value is ItemId =>
  typeof value === "string" && Object.hasOwn(ITEM_DEFINITIONS, value) &&
  ["seed", "crop", "resource", "material", "placeable", "food"].includes(ITEM_DEFINITIONS[value as ItemId].kind) && value !== "seed";

export function initialStorage(): StorageData {
  return { containers: Object.fromEntries(Object.keys(CONTAINER_DEFINITIONS).map(id => [id, { id, items: {} }])) as StorageData["containers"] };
}

/** New-world supplies. Keep this separate from normalization so consumed or
 * withdrawn starter items can never be recreated while loading a save. */
export function starterStorage(): StorageData {
  const storage = initialStorage();
  storage.containers.family_chest.items.stamina_biscuit = 99;
  return storage;
}

export function normalizeStorage(value: unknown): StorageData {
  const result = initialStorage();
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as { containers?: unknown }).containers : null;
  const containers = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  for (const id of Object.keys(CONTAINER_DEFINITIONS) as ContainerId[]) {
    const entry = containers[id];
    const items = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as { items?: unknown }).items : null;
    if (!items || typeof items !== "object" || Array.isArray(items)) continue;
    for (const [itemId, count] of Object.entries(items)) {
      if (isStorableItemId(itemId) && Number.isSafeInteger(count) && (count as number) > 0 &&
          Object.keys(result.containers[id].items).length < CONTAINER_DEFINITIONS[id].capacity)
        result.containers[id].items[itemId] = count as number;
    }
  }
  return result;
}

export function transferItem(inventory: Inventory, storage: StorageData, containerId: unknown, direction: unknown, itemId: unknown, quantity: unknown): string | null {
  if (!isContainerId(containerId) || !["deposit", "withdraw"].includes(direction as string) || !isStorableItemId(itemId) ||
      !Number.isSafeInteger(quantity) || (quantity as number) <= 0) return "아이템과 수량을 확인해 주세요.";
  const container: ContainerData = storage.containers[containerId];
  const amount = quantity as number, inChest = container.items[itemId] ?? 0, inBag = inventory.count(itemId);
  if (direction === "deposit") {
    if (inBag < amount) return "가방에 아이템이 부족해요.";
    if (inChest === 0 && Object.values(container.items).filter(n => n > 0).length >= CONTAINER_DEFINITIONS[containerId].capacity)
      return "보관함이 가득 찼어요.";
    if (!Number.isSafeInteger(inChest + amount)) return "보관 수량이 너무 많아요.";
    inventory.consume(itemId, amount); container.items[itemId] = inChest + amount;
  } else {
    if (inChest < amount) return "보관함에 아이템이 부족해요.";
    if (!Number.isSafeInteger(inBag + amount)) return "가방 수량이 너무 많아요.";
    container.items[itemId] = inChest - amount; inventory.add(itemId, amount);
  }
  return null;
}


/** Validate a complete storage edit against cloned state, then commit all moves. */
export function transferItemsAtomically(
  inventory: Inventory,
  storage: StorageData,
  containerId: unknown,
  transfers: unknown,
): string | null {
  if (!isContainerId(containerId) || !Array.isArray(transfers) || transfers.length < 1 || transfers.length > 100)
    return "보관함 변경 내용을 확인해 주세요.";
  const previewInventory = new Inventory(inventory.serialize());
  const previewStorage = normalizeStorage(storage);
  for (const transfer of transfers as StorageTransfer[]) {
    if (!transfer || typeof transfer !== "object") return "보관함 변경 내용을 확인해 주세요.";
    const error = transferItem(previewInventory, previewStorage, containerId, transfer.direction, transfer.itemId, transfer.quantity);
    if (error) return error;
  }
  for (const transfer of transfers as StorageTransfer[]) {
    const error = transferItem(inventory, storage, containerId, transfer.direction, transfer.itemId, transfer.quantity);
    if (error) return error;
  }
  return null;
}
