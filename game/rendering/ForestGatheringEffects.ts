import * as Phaser from "phaser";
import { WORLD_OBJECT_ASSETS, displayedSize } from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import type { ForestFeedback } from "../forest/feedback";
import type { MapObjectDefinition } from "../maps/types";

/** Short lived visuals; resource ownership and collision change before these tweens run. */
export class ForestGatheringEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  play(object: MapObjectDefinition, feedback: ForestFeedback) {
    const asset = WORLD_OBJECT_ASSETS[object.assetId];
    const x = object.position.tileX * GAME_CONFIG.tileSize, y = object.position.tileY * GAME_CONFIG.tileSize;
    const size = object.displaySizeOverride ?? displayedSize(asset);
    const image = this.scene.add.image(x, y, asset.textureKey).setOrigin(asset.origin.x, asset.origin.y)
      .setDisplaySize(size.width, size.height).setDepth((object.depth ?? 3) + 1);
    if (feedback.kind === "hit") {
      this.scene.tweens.add({ targets: image, x: x + 3, duration: 55, yoyo: true, repeat: 2, onComplete: () => image.destroy() });
      if (feedback.progress) this.floatText(x, y - size.height / 2 - 12, feedback.progress, "#fff0a9");
    } else if (feedback.kind === "felled") {
      this.scene.tweens.add({ targets: image, angle: 22, x: x + 12, alpha: 0, duration: 360, ease: "Quad.easeIn", onComplete: () => image.destroy() });
    } else {
      this.scene.tweens.add({ targets: image, y: y - 10, alpha: 0, duration: 240, onComplete: () => image.destroy() });
    }
    if (feedback.pickup) this.floatText(x, y - size.height / 2 - 22, feedback.pickup, "#dfffc0");
  }

  private floatText(x: number, y: number, value: string, color: string) {
    const label = this.scene.add.text(x, y, value, { fontFamily: "sans-serif", fontSize: "12px", fontStyle: "bold",
      color, backgroundColor: "#233827cc", padding: { x: 3, y: 1 } }).setOrigin(.5).setDepth(32);
    this.scene.tweens.add({ targets: label, y: y - 17, alpha: 0, duration: 650, onComplete: () => label.destroy() });
  }
}
