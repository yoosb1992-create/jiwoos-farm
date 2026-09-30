import type { ToolKey } from "../events";
import type { Facing } from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import { TOOL_ACTION_DEFINITIONS, shouldTriggerToolEffect, type ToolActionDefinition, type ToolActionStyle } from "./toolActionDefinitions";

export interface ToolAnimationPort {
  playAction(request: {
    tool: ToolKey;
    style: ToolActionStyle;
    facing: Facing;
    definition: ToolActionDefinition;
    onFrame: (frame: number) => void;
    onComplete: () => void;
  }): void;
}

export class ToolActionSystem {
  private lockedUntil = 0;
  constructor(
    private readonly animations: ToolAnimationPort,
    private readonly now = () => performance.now(),
    private readonly definitions: Record<ToolKey, ToolActionDefinition> = TOOL_ACTION_DEFINITIONS,
  ) {}

  execute(tool: ToolKey, facing: Facing, action: (tool: ToolKey) => void) {
    const now = this.now();
    if (now < this.lockedUntil) return false;
    this.lockedUntil = now + GAME_CONFIG.toolActionCooldownMs;
    const definition = this.definitions[tool];
    let effectApplied = false;
    const applyEffect = () => {
      if (effectApplied) return;
      effectApplied = true;
      action(tool);
    };
    this.animations.playAction({
      tool, style: definition.style, facing, definition,
      onFrame: (frame) => { if (shouldTriggerToolEffect(definition.effectTiming, "frame", frame)) applyEffect(); },
      onComplete: () => { if (shouldTriggerToolEffect(definition.effectTiming, "complete")) applyEffect(); },
    });
    // All current authoritative actions intentionally retain their existing start
    // timing. Frame/complete are wired above for later server-contract changes.
    if (shouldTriggerToolEffect(definition.effectTiming, "start")) applyEffect();
    return true;
  }
}
