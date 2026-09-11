import type { ToolKey } from "../events";
import type { Facing } from "../assets/definitions";
import { PlayerAnimationController } from "../player/PlayerAnimationController";

export class ToolActionSystem {
  constructor(private readonly animations: PlayerAnimationController) {}

  execute(tool: ToolKey, facing: Facing, action: (tool: ToolKey) => void) {
    this.animations.playTool(facing);
    action(tool);
  }
}
