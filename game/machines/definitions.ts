import type { MachineProcess } from "./types";

export const MACHINE_PROCESSES: Record<string, MachineProcess> = {
  saw_wood: { id: "saw_wood", name: "목재 가공", input: { itemId: "wood", quantity: 2 }, output: { itemId: "wood_plank", quantity: 1 }, durationMinutes: 120 },
};
