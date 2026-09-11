import type * as Phaser from "phaser";
import { PLAYER_ASSET, type Facing, type PlayerAnimationName } from "../assets/definitions";

export class PlayerAnimationController {
  private toolAnimationActive = false;
  constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite) {
    this.sprite.on("animationcomplete", () => { this.toolAnimationActive = false; });
  }

  playMovement(facing: Facing, moving: boolean) {
    if (this.toolAnimationActive) return;
    this.sprite.play(`${moving ? "walk" : "idle"}_${facing}` as PlayerAnimationName, true);
  }

  playTool(facing: Facing) {
    this.toolAnimationActive = true;
    this.sprite.play(`tool_${facing}` as PlayerAnimationName, true);
    if (PLAYER_ASSET.animations[`tool_${facing}`].startFrame === PLAYER_ASSET.animations[`tool_${facing}`].endFrame) {
      this.toolAnimationActive = false;
    }
  }

  interactionPoint(facing: Facing) {
    const offset = PLAYER_ASSET.interactionPoints[facing];
    return { x: this.sprite.x + offset.x, y: this.sprite.y + offset.y };
  }
}
