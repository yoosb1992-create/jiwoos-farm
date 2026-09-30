import type { ToolKey } from "../events";
import type { Facing } from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import { TOOL_ACTION_DEFINITIONS, shouldTriggerToolEffect, type ToolActionDefinition, type ToolActionStyle } from "./toolActionDefinitions";

export type ToolActionContext = {
  tool: ToolKey;
  facing: Facing;
  mapId: string;
  player: { x: number; y: number };
  targetWorld: { x: number; y: number };
  targetTile: { x: number; y: number };
  targetObjectId?: string;
};

/** Capture every coordinate used by an action before animation/movement locking.
 * Gameplay callbacks must consume this immutable snapshot instead of sampling
 * the animated player again. */
export const captureToolActionContext = (
  tool: ToolKey,
  facing: Facing,
  mapId: string,
  player: { x: number; y: number },
  targetWorld: { x: number; y: number },
): ToolActionContext => ({
  tool,
  facing,
  mapId,
  player: { ...player },
  targetWorld: { ...targetWorld },
  targetTile: {
    x: Math.floor(targetWorld.x / GAME_CONFIG.tileSize),
    y: Math.floor(targetWorld.y / GAME_CONFIG.tileSize),
  },
});

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
      // Start-triggered gameplay is authoritative and must not depend on the
      // Phaser animation lifecycle. Apply it exactly once before visual setup;
      // refill remains complete-triggered below.
      if (shouldTriggerToolEffect(definition.effectTiming, "start")) applyEffect();
      this.animations.playAction({
        tool, style: definition.style, facing, definition,
        onFrame: (frame) => { if (shouldTriggerToolEffect(definition.effectTiming, "frame", frame)) applyEffect(); },
        onComplete: complete,
      });
    } catch (error) {
      complete();
      throw error;
    }
    return true;
  }
}
