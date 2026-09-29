import type { InventoryData } from "../domain";

export type ContainerId = "family_chest";
export type ContainerScope = "shared" | "personal";
export interface ContainerDefinition { id: ContainerId; name: string; capacity: number; scope: ContainerScope }
export interface ContainerData extends InventoryData { id: ContainerId }
export interface StorageData { containers: Record<ContainerId, ContainerData> }
export type StorageDirection = "deposit" | "withdraw";
