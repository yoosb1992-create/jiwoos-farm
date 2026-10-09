import { TERRAIN_ART } from "../../shared/art-assets.js";
import type { SeasonKey, Terrain } from "../../shared/world2.js";

const materials = new Map<string, CanvasImageSource>();
let revision = 0;
export const materialRevision = () => revision;
export function installMaterial(id: string, image: CanvasImageSource) {
  materials.set(id, image);
  revision++;
}
/** Editor only. Runtime uses the same files through Phaser's blocking preload. */
export async function loadMaterials(): Promise<void> {
  await Promise.all(Object.entries(TERRAIN_ART).map(([id, src]) => new Promise<void>(resolve => {
    const img = new Image();
    img.onload = () => { installMaterial(id, img); resolve(); };
    img.onerror = () => resolve(); // The semantic color painter is the fallback.
    img.src = src;
  })));
}
export const materialFor: Partial<Record<Terrain, string>> = {
  grass: "grass", dark_grass: "grass", hill: "grass", dirt_path: "dirt",
  sand: "dirt", beach_sand: "dirt", stone_path: "stone", stone: "gravel",
  gravel: "gravel", soil: "soil", tilled_soil: "soil", water: "water",
  shallow_water: "water", deep_water: "water",
};
/** Sample continuous world coordinates, never randomize individual tile brightness.
 * Mirrored repeat eliminates hard image seams, including at chunk boundaries. */
export function paintMaterial(ctx: CanvasRenderingContext2D, t: Terrain,
  x: number, y: number, size: number, season: SeasonKey, seed: number): boolean {
  const source = materials.get(materialFor[t] ?? "");
  if (!source) return false;
  const image = source as HTMLImageElement;
  const period = t === "tilled_soil" || t === "soil" ? 4 : 8;
  const px = x + (seed & 7), py = y + ((seed >>> 3) & 7);
  const ix = ((px % period) + period) % period, iy = ((py % period) + period) % period;
  const flipX = Math.floor(px / period) % 2 !== 0;
  const flipY = Math.floor(py / period) % 2 !== 0;
  const sw = (image.naturalWidth || image.width) / period;
  const sh = (image.naturalHeight || image.height) / period;
  ctx.save();
  ctx.translate(flipX ? size : 0, flipY ? size : 0);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(source, (flipX ? period - 1 - ix : ix) * sw,
    (flipY ? period - 1 - iy : iy) * sh, sw, sh, 0, 0, size, size);
  ctx.restore();
  let glaze = "";
  if (["grass", "dark_grass", "hill"].includes(t)) {
    glaze = season === "winter" ? "#e6eee2dc" : season === "autumn" ? "#d3ac6552"
      : season === "summer" ? "#397c5023" : "";
    if (t === "dark_grass") {
      ctx.fillStyle = "#2d62474a"; ctx.fillRect(0, 0, size, size);
    }
  } else if (t === "shallow_water") glaze = "#c3e2b54f";
  else if (t === "deep_water") glaze = "#17456968";
  else if (t === "sand" || t === "beach_sand") glaze = "#ffefc87a";
  else if (t === "soil") glaze = "#b69c7160";
  if (glaze) { ctx.fillStyle = glaze; ctx.fillRect(0, 0, size, size); }
  return true;
}
