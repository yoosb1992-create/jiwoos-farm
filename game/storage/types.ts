import type { InventoryData } from "../domain";
import type { ItemId } from "../data/items";

export type ContainerId = "family_chest";
export type ContainerScope = "shared" | "personal";
export interface ContainerDefinition { id: ContainerId; name: string; capacity: number; scope: ContainerScope }
export interface ContainerData extends InventoryData { id: ContainerId }
export interface StorageData { containers: Record<ContainerId, ContainerData> }
export type StorageDirection = "deposit" | "withdraw";
export interface StorageTransfer { direction: StorageDirection; itemId: ItemId; quantity: number }

export interface StorageLock { containerId: ContainerId; playerId: string; nickname: string; expiresAt: number }
