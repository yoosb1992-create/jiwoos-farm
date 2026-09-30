import type * as Phaser from "phaser";
import { DEFAULT_CHARACTER_VISUAL_PROFILE, playerAnimationName, type CharacterVisualProfile, type Facing } from "../assets/definitions";
import { playerActionAnimationName, type ToolActionStyle } from "../actions/toolActionDefinitions";
import { interactionTargetPoint, playerInteractionAnchorFromPosition } from "./interaction";

export class PlayerAnimationController {
  private toolAnimationActive = false;
  private lastFacing: Facing;
  private activeActionKey?: string;
  private lastActionFrame = -1;
  private actionHooks?: { onFrame?: (frame: number) => void; onComplete?: () => void };

  constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite, initialFacing: Facing = "down", private readonly profile: CharacterVisualProfile = DEFAULT_CHARACTER_VISUAL_PROFILE) {
    this.lastFacing = initialFacing;
    this.sprite.on("animationupdate", (animation: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
      if (!this.toolAnimationActive || animation.key !== this.activeActionKey) return;
      const index = Math.max(0, Math.min(3, frame.index - 1));
      if (index === this.lastActionFrame) return;
      this.lastActionFrame = index;
      this.actionHooks?.onFrame?.(index);
    });
    this.sprite.on("animationcomplete", (animation: Phaser.Animations.Animation) => {
      if (!this.toolAnimationActive || (this.activeActionKey && animation.key !== this.activeActionKey)) return;
      this.actionHooks?.onComplete?.();
      this.finishToolAnimation();
    });
  }

  playMovement(facing: Facing, moving: boolean) {
    this.lastFacing = facing;
    if (this.toolAnimationActive) return;
    this.sprite.play(playerAnimationName(moving ? "walk" : "idle", facing), true);
  }

  playTool(facing: Facing) {
    this.playAction("swing", facing);
  }

  playAction(style: ToolActionStyle, facing: Facing, hooks: { onFrame?: (frame: number) => void; onComplete?: () => void } = {}) {
    this.lastFacing = facing;
    this.toolAnimationActive = true;
    this.activeActionKey = playerActionAnimationName(style, facing);
    this.actionHooks = hooks;
    this.lastActionFrame = 0;
    this.sprite.play(this.activeActionKey, true);
    hooks.onFrame?.(0);
    // The generated fallback has one frame, so it cannot emit a useful visible
    // sequence. Release it immediately and preserve normal movement controls.
    if ((this.sprite.anims.currentAnim?.frames.length ?? 0) <= 1) {
      hooks.onComplete?.();
      this.finishToolAnimation();
    }
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
    this.activeActionKey = undefined;
    this.actionHooks = undefined;
    this.lastActionFrame = -1;
    this.sprite.play(playerAnimationName("idle", this.lastFacing), true);
  }
}
