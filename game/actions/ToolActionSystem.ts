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
  private actionActive = false;
  constructor(
    private readonly animations: ToolAnimationPort,
    private readonly now = () => performance.now(),
    private readonly definitions: Record<ToolKey, ToolActionDefinition> = TOOL_ACTION_DEFINITIONS,
    private readonly onActiveChange: (active: boolean) => void = () => undefined,
  ) {}

  isActive() { return this.actionActive; }

  execute(tool: ToolKey, facing: Facing, action: (tool: ToolKey) => void, definitionOverride?: ToolActionDefinition) {
    const now = this.now();
    if (this.actionActive || now < this.lockedUntil) return false;
    this.lockedUntil = now + GAME_CONFIG.toolActionCooldownMs;
    const definition = definitionOverride ?? this.definitions[tool];
    let effectApplied = false;
    let completed = false;
    const applyEffect = () => {
      if (effectApplied) return;
      effectApplied = true;
      action(tool);
    };
    const complete = () => {
      if (completed) return;
      completed = true;
      try {
        if (shouldTriggerToolEffect(definition.effectTiming, "complete")) applyEffect();
      } finally {
        this.actionActive = false;
        this.onActiveChange(false);
      }
    };
    this.actionActive = true;
    this.onActiveChange(true);
    try {
      this.animations.playAction({
        tool, style: definition.style, facing, definition,
        onFrame: (frame) => { if (shouldTriggerToolEffect(definition.effectTiming, "frame", frame)) applyEffect(); },
        onComplete: complete,
      });
      // Existing authoritative tool effects remain start-triggered. Refill uses
      // the same bridge with a complete trigger so the visible scoop happens first.
      if (shouldTriggerToolEffect(definition.effectTiming, "start")) applyEffect();
    } catch (error) {
      complete();
      throw error;
    }
    return true;
  }
}
