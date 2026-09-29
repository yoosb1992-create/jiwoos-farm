import type * as Phaser from "phaser";
import { DEFAULT_CHARACTER_VISUAL_PROFILE, playerAnimationName, type CharacterVisualProfile, type Facing } from "../assets/definitions";
import { interactionTargetPoint, playerInteractionAnchorFromPosition } from "./interaction";

export class PlayerAnimationController {
  private toolAnimationActive = false;
  private lastFacing: Facing;

  constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite, initialFacing: Facing = "down", private readonly profile: CharacterVisualProfile = DEFAULT_CHARACTER_VISUAL_PROFILE) {
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

  playerInteractionAnchor() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    const authoredBody = this.profile.asset.collisionBox;
    const bodyRatio = (this.profile.interactionAnchor.y - authoredBody.offsetY) / authoredBody.height;
    return body
      ? { x: body.center.x, y: body.top + body.height * bodyRatio }
      : playerInteractionAnchorFromPosition(this.sprite, { x: this.sprite.scaleX ?? 1, y: this.sprite.scaleY ?? 1 }, this.profile);
  }

  interactionPoint(facing: Facing) {
    return interactionTargetPoint(this.playerInteractionAnchor(), facing);
  }

  private finishToolAnimation() {
    this.toolAnimationActive = false;
    this.sprite.play(playerAnimationName("idle", this.lastFacing), true);
  }
}
