import type * as Phaser from "phaser";
import { PLAYER_ASSET, playerAnimationName, type Facing } from "../assets/definitions";

export class PlayerAnimationController {
  private toolAnimationActive = false;
  private lastFacing: Facing = "down";

  constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite) {
    this.sprite.on("animationcomplete", () => {
      if (!this.toolAnimationActive) return;
      this.finishToolAnimation();
    });
  }

  playMovement(facing: Facing, moving: boolean) {
    this.lastFacing = facing;
    if (this.toolAnimationActive) return;
    this.sprite.play(playerAnimationName(moving ? "walk" : "idle", facing), true);
  }

  playTool(facing: Facing) {
    this.lastFacing = facing;
    this.toolAnimationActive = true;
    const name = playerAnimationName("tool", facing);
    this.sprite.play(name, true);
    if (PLAYER_ASSET.animations[name].startFrame === PLAYER_ASSET.animations[name].endFrame) {
      this.finishToolAnimation();
    }
  }

  interactionPoint(facing: Facing) {
    const offset = PLAYER_ASSET.interactionPoints[facing];
    return { x: this.sprite.x + offset.x, y: this.sprite.y + offset.y };
  }

  private finishToolAnimation() {
    this.toolAnimationActive = false;
    this.sprite.play(playerAnimationName("idle", this.lastFacing), true);
  }
}
