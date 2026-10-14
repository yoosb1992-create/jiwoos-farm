import Phaser from "phaser";
import { CROPS } from "../shared/content.js";
import { cropVisual, CROP_TEXTURE, type SeedForm } from "../shared/crop-visuals.js";

// Original code-native pixel artwork. Tiny, immutable 40x52 textures are baked
// once; animation only changes a separate glow sprite's opacity.
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  for (let py = Math.floor(y - ry); py <= y + ry; py++)
    for (let px = Math.floor(x - rx); px <= x + rx; px++)
      if (((px + .5 - x) / rx) ** 2 + ((py + .5 - y) / ry) ** 2 <= 1) c.fillRect(px, py, 1, 1);
}
function line(c: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, color: string, width = 1) {
  const n = Math.max(Math.abs(tx - x), Math.abs(ty - y), 1);
  c.fillStyle = color;
  for (let i = 0; i <= n; i++) c.fillRect(Math.round(x + (tx - x) * i / n), Math.round(y + (ty - y) * i / n), width, width);
}
function leaf(c: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, slim = false) {
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = Math.sin(t * Math.PI) * (slim ? 1.6 : 3.5) + .6;
    oval(c, x + dx * t, y + dy * t, r, r * .62, "#4a703b");
    oval(c, x + dx * t, y + dy * t - 1, r * .8, r * .45, "#84aa50");
  }
  line(c, x, y, x + dx, y + dy, "#b6c975");
}
export function paintSeed(c: CanvasRenderingContext2D, form: SeedForm, glow = false): void {
  const positions: Array<[number, number]> = form === "bulb" || form === "tuber" ? [[20, 40]] : [[14, 41], [21, 38], [27, 42]];
  if (glow) {
    // Warm sunlight, not a neon magic orb. All emissive pixels live here so
    // the physical seed itself can never keep glowing after sunset.
    for (const [x, y] of positions) {
      oval(c, x, y, 7, 4, "#ffdc7720"); oval(c, x, y, 4, 2.5, "#ffe79a38");
      line(c, x - 1, y - 1, x + 1, y - 1, "#fff4ba");
    }
    line(c, 26, 35, 26, 39, "#fff7d5b0"); line(c, 24, 37, 28, 37, "#fff7d5b0");
    return;
  }
  oval(c, 20, 44, 14, 3, "#44332255");
  oval(c, 20, 42, 13, 4, "#68452e"); oval(c, 19, 40, 11, 3, "#9e7148");
  for (const [x, y] of positions) {
    const rx = form === "fine" ? 2 : form === "bulb" ? 4 : form === "tuber" ? 5 : 3;
    const ry = form === "grain" ? 3 : form === "bulb" ? 4 : form === "fine" ? 1.5 : 2.5;
    oval(c, x, y, rx + 1, ry + 1, "#543b2b");
    oval(c, x, y - 1, rx, ry, form === "bean" ? "#b88967" : form === "bulb" ? "#d0a47d" : form === "tuber" ? "#c19b65" : "#c9b481");
    line(c, x - 1, y - 2, x + (form === "flat" ? 1 : 0), y - 2, "#e7d5a5");
    if (form === "grain" || form === "bean" || form === "bulb") line(c, x, y, x + 1, y + 1, "#846044");
    if (form === "tuber") { oval(c, x + 2, y, 1, 1, "#806044"); oval(c, x - 2, y + 1, 1, 1, "#806044"); }
  }
  // A little soil in front seats the seed in the furrow. Never any green leaf.
  line(c, 10, 44, 14, 44, "#b28652"); line(c, 23, 45, 30, 43, "#835635");
}
export function paintYoungCrop(c: CanvasRenderingContext2D, id: string, sprout: boolean): void {
  const { plant } = cropVisual(id);
  oval(c, 20, 44, sprout ? 9 : 14, 3, "#44332244");
  if (sprout) {
    line(c, 20, 44, 20, 36, "#527641", 2);
    leaf(c, 21, 38, -6, -4, plant === "stalk" || plant === "bulb");
    leaf(c, 21, 38, 5, -6, plant === "stalk" || plant === "bulb");
    return;
  }
  if (plant === "stalk" || plant === "bulb" || plant === "spike") {
    for (const dx of [-7, 0, 7]) {
      line(c, 20, 43, 20 + dx, 18 + Math.abs(dx), "#618142", 2);
      leaf(c, 20, 41, dx - 5, -17, true); leaf(c, 20, 39, dx + 4, -22, true);
    }
    if (plant === "stalk") { leaf(c, 20, 31, -12, -7, true); leaf(c, 20, 27, 12, -8, true); }
    if (plant === "spike") for (const x of [14, 20, 26]) oval(c, x, 23, 2, 4, "#839c66");
    if (id === "pinktulip") oval(c, 20, 19, 3, 5, "#9dac5e");
  } else if (plant === "leaf") {
    for (const [dx, dy] of [[-13, -7], [13, -7], [-10, -16], [10, -16], [0, -21]]) leaf(c, 20, 42, dx!, dy!);
    oval(c, 20, 36, 7, 6, "#618948"); oval(c, 19, 34, 5, 4, "#9db85f");
  } else if (plant === "root") {
    for (let i = -2; i <= 2; i++) {
      const x = 20 + i * 4, y = 21 + Math.abs(i) * 4;
      line(c, 20, 44, x, y, "#557b40", 2);
      leaf(c, x, y + 9, -4, -5, id === "morningcarrot"); leaf(c, x, y + 5, 4, -5, id === "morningcarrot");
    }
    oval(c, 20, 42, 4, 2, "#74934c");
  } else if (plant === "vine") {
    const climber = ["duskgrape", "sweetpea", "scarletbean", "snowpea", "coolcucumber"].includes(id);
    line(c, 8, 42, 30, 36, "#658344", 2);
    if (climber) line(c, 20, 42, 22, 20, "#5e8041", 2);
    for (const [x, y, dx, dy] of [[13, 41, -7, -8], [21, 39, 9, -7], [19, 36, -5, -10], [25, 36, 6, -11]])
      leaf(c, x!, y! - (climber ? 5 : 0), dx!, dy!);
    if (climber) { line(c, 22, 22, 27, 19, "#96af60"); line(c, 27, 19, 28, 22, "#96af60"); }
  } else {
    const flower = plant === "flower", height = flower ? 25 : plant === "bush" ? 23 : 14;
    line(c, 20, 44, 20, 44 - height, "#537a3f", 2);
    for (const [dx, dy] of [[-10, -8], [10, -12], [-8, -18], [7, -22]]) leaf(c, 20, 43 + dy! / 3, dx!, dy! / 2);
    if (flower) { oval(c, 21, 44 - height, 4, 5, "#6c8a49"); oval(c, 20, 43 - height, 2, 3, "#b0b96d"); }
    else if (plant === "berry") { leaf(c, 20, 42, -12, -5); leaf(c, 20, 42, 12, -5); }
  }
}
export function createCropTextures(scene: Phaser.Scene): void {
  for (const crop of Object.values(CROPS))
    for (const stage of ["seed", "sprout", "growing", "glow"] as const) {
      const key = `crop_${crop.id}_${stage}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const texture = scene.textures.createCanvas(key, CROP_TEXTURE.width, CROP_TEXTURE.height)!;
      const c = texture.context;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, 40, 52);
      if (stage === "seed" || stage === "glow") paintSeed(c, cropVisual(crop.id).seed, stage === "glow");
      else paintYoungCrop(c, crop.id, stage === "sprout");
      texture.refresh(); texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
}
