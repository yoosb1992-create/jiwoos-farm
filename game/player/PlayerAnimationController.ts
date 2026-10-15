import type * as Phaser from "phaser";
import { PLAYER_ASSET, playerAnimationName, type Facing } from "../assets/definitions";

export class PlayerAnimationController {
  private toolAnimationActive = false;
  private lastFacing: Facing;

  constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite, initialFacing: Facing = "down") {
    this.lastFacing = initialFacing;
    this.sprite.on("animationcomplete", () => {
      if (this.toolAnimationActive) this.finishToolAnimation();
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
    this.sprite.play(playerAnimationName("tool", facing), true);
    // The generated fallback has one frame, so it cannot emit a useful visible
    // sequence. Release it immediately and preserve normal movement controls.
    if ((this.sprite.anims.currentAnim?.frames.length ?? 0) <= 1) this.finishToolAnimation();
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
