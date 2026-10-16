import type Phaser from "phaser";

/** A friendly, square wooden shipping box with a little open lid and a leaf
 * delivery seal. The silhouette is deliberately boxy, unlike the locked chest. */
export function paintShipping(c: CanvasRenderingContext2D): void {
  const box = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath(); c.fill();
  };
  const poly = (points: readonly (readonly [number, number])[], fill: string) => {
    c.fillStyle = fill; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fill();
  };
  const stroke = (points: readonly (readonly [number, number])[], ink: string, width = 1) => {
    c.strokeStyle = ink; c.lineWidth = width; c.lineCap = "round"; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
  };
  c.save(); c.lineJoin = "round";
  // Short feet and soft grounding keep the prop readable in top-down farm view.
  c.fillStyle = "#293f2e39"; c.beginPath(); c.ellipse(40, 65, 35, 5, 0, 0, Math.PI * 2); c.fill();
  box(13, 59, 8, 7, 2, "#704629"); box(59, 59, 8, 7, 2, "#704629");
  // Upright lid: a rounded rectangle rather than the old narrow triangle.
  box(10, 6, 62, 24, 5, "#734c31");
  box(13, 8, 56, 19, 4, "#ecc78e");
  box(16, 11, 50, 3, 1, "#f8dfaf");
  stroke([[17, 17], [65, 17]], "#c18b5b", 1.5);
  stroke([[17, 22], [65, 22]], "#d5a16a", 1.3);
  // Tiny hinges link the lid to a clearly open top.
  box(18, 26, 6, 6, 1, "#9b6440"); box(59, 26, 6, 6, 1, "#9b6440");
  poly([[10, 30], [16, 26], [70, 26], [75, 31], [67, 39], [8, 38]], "#66432d");
  poly([[14, 30], [18, 28], [67, 28], [71, 31], [65, 35], [13, 35]], "#977047");
  // A few harvest colours peek over the rim, not a tall open basket.
  c.fillStyle = "#93b35e"; c.beginPath(); c.ellipse(27, 31, 7, 3.5, -.35, 0, Math.PI*2); c.fill();
  c.fillStyle = "#b4ca72"; c.beginPath(); c.ellipse(39, 31, 6, 4, .2, 0, Math.PI*2); c.fill();
  c.fillStyle = "#dc865d"; c.beginPath(); c.arc(51, 31, 4, 0, Math.PI*2); c.fill();
  stroke([[51, 27], [49, 25], [46, 26]], "#6c8e4e", 1.5);
  // Cuboid body: broad, nearly square front and one short right side.
  poly([[66, 34], [75, 31], [75, 57], [67, 64], [65, 61]], "#845335");
  poly([[69, 38], [73, 36], [73, 56], [69, 59]], "#aa7042");
  box(7, 32, 62, 32, 5, "#70462e");
  box(9, 34, 57, 27, 4, "#d8a06b");
  box(10, 35, 55, 7, 3, "#efd1a0");
  // Horizontal planks and snug corner reinforcements say 'shipping box'.
  stroke([[11, 44], [64, 44]], "#ae784f", 1.6);
  stroke([[11, 53], [64, 53]], "#b58355", 1.6);
  stroke([[14, 47], [58, 47]], "#f1c18d", 1);
  stroke([[15, 57], [60, 57]], "#eab984", 1);
  box(12, 34, 5, 27, 1, "#e9b77c"); box(59, 34, 5, 27, 1, "#e9b77c");
  stroke([[15, 37], [15, 58]], "#f7d8a4"); stroke([[61, 37], [61, 58]], "#f7d8a4");
  // Small cream shipping label with a friendly sprout mark.
  box(29, 41, 19, 16, 3, "#977046");
  box(30, 42, 17, 14, 2, "#fff1c8");
  stroke([[38, 53], [38, 46]], "#6d8a4e", 1.5);
  c.fillStyle = "#7c9e53"; c.beginPath(); c.ellipse(35.5, 47, 3, 1.7, -.5, 0, Math.PI*2); c.fill();
  c.fillStyle = "#a4bb63"; c.beginPath(); c.ellipse(40.5, 46.5, 3, 1.7, .5, 0, Math.PI*2); c.fill();
  c.fillStyle = "#d9876a"; c.beginPath(); c.arc(38, 50.5, 1.5, 0, Math.PI*2); c.fill();
  // Friendly polished corners, without chest-style iron locks.
  c.fillStyle = "#fff0c3";
  for (const [x,y] of [[13,39],[61,39],[13,58],[61,58]] as const) {
    c.beginPath(); c.arc(x,y,1.1,0,Math.PI*2); c.fill();
  }
  c.restore();
}

let icon: string | undefined;
export function shippingIconSource(): string {
  if (icon) return icon;
  const c = document.createElement("canvas"); c.width = 160; c.height = 144;
  const context = c.getContext("2d")!; context.scale(2, 2); paintShipping(context);
  return icon = c.toDataURL("image/png");
}
export function createShippingTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("shipping_crate")) return;
  const t = scene.textures.createCanvas("shipping_crate", 160, 144)!;
  t.context.scale(2, 2); paintShipping(t.context); t.refresh();
}
