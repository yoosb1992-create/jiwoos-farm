import type { Inventory } from "../domain";
import { MACHINE_PROCESSES } from "./definitions";
import type { MachineState } from "./types";

export const idleMachine = (): MachineState => ({ status: "idle", processId: null, input: null, output: null, startedAt: null, completesAt: null });
export function normalizeMachine(value: unknown): MachineState {
  if (!value || typeof value !== "object") return idleMachine();
  const raw = value as Partial<MachineState>, process = typeof raw.processId === "string" ? MACHINE_PROCESSES[raw.processId] : undefined;
  if (!process || !Number.isSafeInteger(raw.startedAt) || (raw.startedAt as number) < 0 || !Number.isSafeInteger(raw.completesAt) ||
      (raw.completesAt as number) !== (raw.startedAt as number) + process.durationMinutes || !["processing", "ready"].includes(raw.status ?? "")) return idleMachine();
  return { status: raw.status as "processing" | "ready", processId: process.id, input: { ...process.input }, output: { ...process.output }, startedAt: raw.startedAt as number, completesAt: raw.completesAt as number };
}
export function advanceMachine(machine: MachineState, now: number): void {
  if (machine.status === "processing" && machine.completesAt !== null && now >= machine.completesAt) machine.status = "ready";
}
export function startMachine(machine: MachineState, inventory: Inventory, processId: unknown, now: number): string | null {
  const process = typeof processId === "string" ? MACHINE_PROCESSES[processId] : undefined;
  if (!process) return "없는 가공법이에요.";
  if (machine.status !== "idle") return "기계가 사용 중이에요.";
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + process.durationMinutes)) return "월드 시간이 올바르지 않아요.";
  if (inventory.count(process.input.itemId) < process.input.quantity) return "가공 재료가 부족해요.";
  inventory.consume(process.input.itemId, process.input.quantity);
  Object.assign(machine, { status: "processing", processId: process.id, input: { ...process.input }, output: { ...process.output }, startedAt: now, completesAt: now + process.durationMinutes });
  return null;
}
export function collectMachine(machine: MachineState, inventory: Inventory, now: number): string | null {
  advanceMachine(machine, now);
  if (machine.status !== "ready" || !machine.output) return "아직 받을 결과물이 없어요.";
  if (!Number.isSafeInteger(inventory.count(machine.output.itemId) + machine.output.quantity)) return "가방 수량이 너무 많아요.";
  inventory.add(machine.output.itemId, machine.output.quantity);
  Object.assign(machine, idleMachine());
  return null;
}
