import type { ToolKey } from "../events";

export type ToolEffectTiming =
  | { trigger: "start" }
  | { trigger: "frame"; frame: number }
  | { trigger: "complete" };

export const TOOL_ACTION_DEFINITIONS: Record<ToolKey, { effectTiming: ToolEffectTiming }> = {
  hoe: { effectTiming: { trigger: "start" } },
  seed: { effectTiming: { trigger: "start" } },
  water: { effectTiming: { trigger: "start" } },
  hand: { effectTiming: { trigger: "start" } },
};
