import type Phaser from "phaser";
import { CHEST_COLORS, validChestColor, type ChestColor } from "../shared/chest-storage.js";

/** Original front-facing pixel woodwork. One continuous lid, planks, end bands
 * and central lock are painted at each width, then sliced at tile boundaries. */
export function paintChest(c: CanvasRenderingContext2D, size: number, color: ChestColor): void {
  const w = 32 * size, p = CHEST_COLORS[color];
  const rect = (x: number, y: number, width: number, height: number, ink: string) => {
    c.fillStyle = ink; c.fillRect(x, y, width, height);
  };
  c.fillStyle = "#30432d2e"; c.beginPath(); c.ellipse(w / 2, 35, w / 2 - 1, 4, 0, 0, Math.PI * 2); c.fill();
  rect(3, 31, 5, 5, "#634832"); rect(w - 8, 31, 5, 5, "#634832");
  rect(2, 12, w - 4, 22, p.dark);
  rect(3, 14, w - 6, 17, p.main);
  rect(4, 16, w - 8, 2, p.light);
  rect(3, 23, w - 6, 1, p.dark);
  rect(4, 24, w - 8, 1, p.light);
  rect(3, 30, w - 6, 2, p.dark);
  // Subtle grain stays in the dyed wood; fittings keep their own metal palette.
  for (let x = 9; x < w - 6; x += 12) {
    rect(x, 18, 1, 5, p.dark); rect(x + 2, 26, Math.min(6, w - 6 - x), 1, p.light);
    rect(x - 2, 20, 4, 1, p.main);
  }
  rect(4, 5, w - 8, 2, p.dark); rect(2, 7, w - 4, 3, p.dark);
  rect(1, 10, w - 2, 6, p.dark);
  rect(5, 6, w - 10, 2, p.light); rect(3, 8, w - 6, 5, p.main);
  rect(3, 8, w - 6, 1, p.light); rect(2, 12, w - 4, 2, p.light);
  rect(2, 15, w - 4, 2, "#573f30");
  for (let x = 10; x < w - 6; x += 13) rect(x, 10, Math.min(7, w - x - 5), 1, p.dark);
  for (const x of [4, w - 7]) {
    rect(x, 7, 3, 25, "#636b60"); rect(x, 8, 1, 23, "#bdc3a5");
    rect(x + 1, 10, 1, 1, "#efe4bc"); rect(x + 1, 28, 1, 1, "#efe4bc");
  }
  const lock = w / 2 - 3;
  rect(lock - 1, 13, 8, 10, "#645341"); rect(lock, 13, 6, 8, "#d0b16c");
  rect(lock + 1, 14, 4, 1, "#f8dfa0"); rect(lock + 2, 16, 2, 2, "#5e5647");
  rect(lock + 2, 18, 1, 2, "#5e5647");
}

export function chestTextureKey(color: string, size: number, index: number): string {
  return `chest-front-${validChestColor(color) ? color : "wood"}-${Math.max(1, Math.min(3, size))}-${index}`;
}

let icon: string | undefined;
export function chestIconSource(): string {
  if (icon) return icon;
  const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 80;
  const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); paintChest(ctx, 1, "wood");
  return icon = canvas.toDataURL("image/png");
}

export function createChestTextures(scene: Phaser.Scene): void {
  for (const color of Object.keys(CHEST_COLORS) as ChestColor[]) for (const size of [1, 2, 3]) {
    const canvas = document.createElement("canvas"); canvas.width = size * 64; canvas.height = 80;
    const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); paintChest(ctx, size, color);
    for (let index = 0; index < size; index++) {
      const key = chestTextureKey(color, size, index);
      if (scene.textures.exists(key)) continue;
      const texture = scene.textures.createCanvas(key, 64, 80)!;
      texture.context.drawImage(canvas, index * 64, 0, 64, 80, 0, 0, 64, 80); texture.refresh();
    }
    if (color === "wood" && size === 1) {
      if (scene.textures.exists("storage_chest")) scene.textures.remove("storage_chest");
      const texture = scene.textures.createCanvas("storage_chest", 64, 80)!;
      texture.context.drawImage(canvas, 0, 0); texture.refresh();
    }
  }
}
