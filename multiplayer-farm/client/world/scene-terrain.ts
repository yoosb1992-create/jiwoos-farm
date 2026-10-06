import type Phaser from "phaser";
import type { MapData } from "../../shared/content.js";
import type { SeasonKey } from "../../shared/world2.js";
import { paintChunk } from "./terrain.js";
/** Only visible 512px chunks have GPU textures. No giant full-map texture. */
export class SceneTerrain {
  private images = new Map<string, Phaser.GameObjects.Image>();
  constructor(
    private scene: Phaser.Scene,
    private map: MapData,
    private season: SeasonKey,
  ) {}
  update() {
    const r = this.scene.cameras.main.worldView,
      visible = new Set<string>();
    for (
      let cy = Math.max(0, Math.floor(r.y / 512) - 1);
      cy <=
      Math.min(
        Math.ceil(this.map.height / 16) - 1,
        Math.floor(r.bottom / 512) + 1,
      );
      cy++
    )
      for (
        let cx = Math.max(0, Math.floor(r.x / 512) - 1);
        cx <=
        Math.min(
          Math.ceil(this.map.width / 16) - 1,
          Math.floor(r.right / 512) + 1,
        );
        cx++
      ) {
        const key = `world2-${this.map.id}-${cx}-${cy}-${this.season}`;
        visible.add(key);
        if (this.images.has(key)) continue;
        const t = this.scene.textures.createCanvas(key, 512, 512);
        if (!t) continue;
        paintChunk(t.context, this.map, cx, cy, 32, this.season);
        t.refresh();
        this.images.set(
          key,
          this.scene.add
            .image(cx * 512, cy * 512, key)
            .setOrigin(0)
            .setDepth(-20),
        );
      }
    for (const [k, i] of this.images)
      if (!visible.has(k)) {
        i.destroy();
        this.images.delete(k);
        this.scene.textures.remove(k);
      }
  }
  destroy() {
    for (const [k, i] of this.images) {
      i.destroy();
      this.scene.textures.remove(k);
    }
    this.images.clear();
  }
}
