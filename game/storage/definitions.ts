import type { ContainerDefinition, ContainerId } from "./types";

/** Capacity counts distinct positive item stacks; adding to an existing stack is free. */
export const CONTAINER_DEFINITIONS: Record<ContainerId, ContainerDefinition> = {
  family_chest: { id: "family_chest", name: "가족 보관함", capacity: 12, scope: "shared" },
};
export const isContainerId = (value: unknown): value is ContainerId => typeof value === "string" && Object.hasOwn(CONTAINER_DEFINITIONS, value);
