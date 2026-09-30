import * as Phaser from "phaser";
import type { ToolKey } from "../events";
import type { Facing } from "../assets/definitions";
import type { ToolAnimationPort } from "../actions/ToolActionSystem";
import { TOOL_OVERLAY_ASSET, type ToolActionDefinition, type ToolActionStyle } from "../actions/toolActionDefinitions";
import type { ToolUseContext } from "../actions/ToolTargetResolver";
import { PlayerAnimationController } from "./PlayerAnimationController";

type ActionState = { tool: ToolKey; style: ToolActionStyle; facing: Facing; frame: number; definition: ToolActionDefinition };

const direction = (facing: Facing) => facing === "up" ? { x: 0, y: -1 } : facing === "down" ? { x: 0, y: 1 } : facing === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };

const actionAngle = (style: ToolActionStyle, frame: number) => {
  const values = style === "swing" ? [-68, -34, 28, 2]
    : style === "pour" ? [-8, 4, 25, 2]
      : style === "cast" ? [-76, -42, 35, 6]
        : style === "refill" ? [42, 55, 68, 38]
        : [-10, -4, 2, 0];
  return values[Math.max(0, Math.min(values.length - 1, frame))];
};

/** Keeps the reusable body sheet independent from tool level/art. Tool upgrades
 * only need to select another overlay frame or atlas, never rebuild the body. */
export class PlayerActionVisuals implements ToolAnimationPort {
  private readonly overlay?: Phaser.GameObjects.Sprite;
  private action?: ActionState;
  private cuePlayed = false;
  private readonly updateHandler = () => this.syncOverlay();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Sprite,
    private readonly animations: PlayerAnimationController,
  ) {
    if (scene.textures.exists(TOOL_OVERLAY_ASSET.textureKey)) {
      this.overlay = scene.add.sprite(player.x, player.y, TOOL_OVERLAY_ASSET.textureKey, 0).setVisible(false).setScale(.72);
    }
    scene.events.on("update", this.updateHandler);
  }

  playAction(request: {
    tool: ToolKey;
    style: ToolActionStyle;
    facing: Facing;
    definition: ToolActionDefinition;
    context?: ToolUseContext;
    onFrame: (frame: number) => void;
    onComplete: () => void;
  }) {
    this.action = { tool: request.tool, style: request.style, facing: request.facing, frame: 0, definition: request.definition };
    this.cuePlayed = false;
    if (this.overlay && request.definition.overlayFrame !== undefined) {
      this.overlay.setFrame(request.definition.overlayFrame).setVisible(true);
    } else this.overlay?.setVisible(false);
    this.animations.playAction(request.style, request.facing, {
      onFrame: (frame) => {
        if (!this.action) return;
        this.action.frame = frame;
        this.syncOverlay();
        if (!this.cuePlayed && frame === request.definition.visualCue.frame) {
          this.cuePlayed = true;
          this.playVfx(request.definition.vfx, request.facing, request.context);
        }
        request.onFrame(frame);
      },
      onComplete: () => {
        this.overlay?.setVisible(false);
        this.action = undefined;
        request.onComplete();
      },
    });
  }

  destroy() {
    this.scene.events.off("update", this.updateHandler);
    this.overlay?.destroy();
    this.action = undefined;
  }

  private syncOverlay() {
    if (!this.action || !this.overlay?.visible) return;
    const { tool, style, facing, frame } = this.action;
    const horizontal = facing === "left" ? -1 : facing === "right" ? 1 : 0;
    const vertical = facing === "up" ? -1 : facing === "down" ? 1 : 0;
    const isCan = tool === "water";
    const isRefill = style === "refill";
    this.overlay.setOrigin(isCan ? .5 : .24, isCan ? .5 : .78)
      .setPosition(this.player.x + horizontal * (isRefill ? 12 : 7), this.player.y - (isRefill ? 9 : 18) + vertical * (isRefill ? 8 : 3))
      .setFlipX(facing === "left")
      .setRotation(Phaser.Math.DegToRad((facing === "left" ? -1 : 1) * actionAngle(style, frame)))
      .setDepth(this.player.depth + (facing === "up" ? -.1 : .1));
  }

  private playVfx(vfx: ToolActionDefinition["vfx"], facing: Facing, context?: ToolUseContext) {
    const d = direction(facing);
    const target = context?.targetWorld;
    const useTarget = target && Math.hypot(target.x - context.player.x, target.y - context.player.y) <= 64;
    const x = useTarget ? target.x : this.player.x + d.x * 25;
    const y = useTarget ? target.y : this.player.y + d.y * 20 + 7;
    const graphics = this.scene.add.graphics().setPosition(x, y).setDepth(this.player.depth + .2);
    if (vfx === "soil") graphics.fillStyle(0x9b6844, .9).fillCircle(-6, 2, 3).fillCircle(2, -1, 2).fillCircle(7, 3, 2);
    else if (vfx === "seed") graphics.fillStyle(0x6f492d, .95).fillCircle(-4, 1, 2).fillCircle(1, 3, 2).fillStyle(0x8fbd57, .9).fillCircle(5, -1, 2);
    else if (vfx === "water" || vfx === "refill-water") graphics.fillStyle(0x72d7e7, .9).fillCircle(-5, -2, 2).fillCircle(0, 3, 2).fillCircle(6, 0, 2);
    else if (vfx === "empty-water") graphics.lineStyle(2, 0xb7aa91, .75).lineBetween(-4, 1, 4, 1);
    else if (vfx === "sparkle") graphics.lineStyle(2, 0xffef9a, .95).lineBetween(-5, 0, 5, 0).lineBetween(0, -5, 0, 5).fillStyle(0xffef9a, .9).fillCircle(0, 0, 2);
    else if (vfx === "wood-hit") graphics.fillStyle(0xd9b173, .95).fillTriangle(-6, 4, -1, -5, 2, 3).fillTriangle(3, 4, 6, -3, 8, 3);
    else if (vfx === "stone-hit") graphics.fillStyle(0xc8ced2, .95).fillTriangle(-7, 3, -2, -5, 1, 3).fillTriangle(3, 4, 6, -2, 9, 4);
    else graphics.lineStyle(2, 0xb9e9ef, .85).strokeCircle(0, 0, 7);
    this.scene.tweens.add({ targets: graphics, alpha: 0, y: y + (vfx === "refill-water" ? -13 : -7), duration: 260, ease: "Quad.easeOut", onComplete: () => graphics.destroy() });
  }
}
