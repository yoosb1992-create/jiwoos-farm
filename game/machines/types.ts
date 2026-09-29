import type { ItemId } from "../data/items";

export type MachineStatus = "idle" | "processing" | "ready";
export interface MachineState {
  status: MachineStatus;
  processId: string | null;
  input: { itemId: ItemId; quantity: number } | null;
  output: { itemId: ItemId; quantity: number } | null;
  startedAt: number | null;
  completesAt: number | null;
}
export interface MachineProcess { id: string; name: string; input: { itemId: ItemId; quantity: number }; output: { itemId: ItemId; quantity: number }; durationMinutes: number }
