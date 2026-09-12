import type { ToolKey } from "../events";
import type { Facing } from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import { TOOL_ACTION_DEFINITIONS } from "./toolActionDefinitions";

interface ToolAnimationPort { playTool(facing: Facing): void }

export class ToolActionSystem {
  private lockedUntil = 0;
  constructor(private readonly animations: ToolAnimationPort, private readonly now = () => performance.now()) {}

  execute(tool: ToolKey, facing: Facing, action: (tool: ToolKey) => void) {
    const now = this.now();
    if (now < this.lockedUntil) return false;
    this.lockedUntil = now + GAME_CONFIG.toolActionCooldownMs;
    this.animations.playTool(facing);
    // Current placeholder animations apply at start. The timing data already supports
    // moving this callback to a configured frame or animation completion later.
    if (TOOL_ACTION_DEFINITIONS[tool].effectTiming.trigger === "start") action(tool);
    return true;
  }
}
