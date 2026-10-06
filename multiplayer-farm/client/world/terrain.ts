import type { MapData } from "../../shared/content.js";
import {
  CHUNK,
  TERRAIN,
  terrainCode,
  type Terrain,
  terrainAt,
  neighborMask,
  tileHash,
  waterTerrain,
  cell,
  type SeasonKey,
} from "../../shared/world2.js";
export const COLORS: Record<string, string> = {
  grass: "#92b969",
  dark_grass: "#668f53",
  soil: "#b58b60",
  tilled_soil: "#91683f",
  sand: "#ded09c",
  beach_sand: "#ead9a6",
  stone: "#a6a79b",
  gravel: "#aaa48e",
  stone_path: "#b9b5a2",
  dirt_path: "#c9ae7b",
  wood_floor: "#b98b5d",
  snow: "#e4eee9",
  water: "#69aeb6",
  shallow_water: "#96c7bd",
  deep_water: "#487f9c",
  cliff: "#9a8a6b",
  hill: "#81a75e",
  stairs: "#b5a184",
  ramp: "#c2ae87",
  mine_floor: "#7d817e",
};
export interface PaintOptions {
  terrain?: boolean;
  water?: boolean;
  elevation?: boolean;
  seasonal?: boolean;
}
function previewTerrain(
  m: MapData,
  x: number,
  y: number,
  season: SeasonKey,
  options: PaintOptions,
): Terrain {
  let t = terrainAt(m, x, y, options.seasonal === false ? undefined : season);
  if (options.water === false && waterTerrain(t))
    t = TERRAIN[(cell(m, "terrain", x, y) || terrainCode(m.baseTileType)) - 1]!;
  if (options.elevation === false && cell(m, "elevation", x, y) > 0)
    t = TERRAIN[terrainCode(m.baseTileType) - 1]!;
  return t;
}
function previewVisible(
  m: MapData,
  x: number,
  y: number,
  t: Terrain,
  options: PaintOptions,
) {
  return (
    options.terrain !== false ||
    (options.water !== false && waterTerrain(t)) ||
    (options.elevation !== false && cell(m, "elevation", x, y) > 0)
  );
}
export function paintChunk(
  ctx: CanvasRenderingContext2D,
  m: MapData,
  cx: number,
  cy: number,
  size: number,
  season: SeasonKey,
  options: PaintOptions = {},
): void {
  const ox = cx * CHUNK,
    oy = cy * CHUNK;
  for (let y = 0; y < CHUNK && oy + y < m.height; y++)
    for (let x = 0; x < CHUNK && ox + x < m.width; x++) {
      const xx = ox + x,
        yy = oy + y,
        t = previewTerrain(m, xx, yy, season, options),
        wet = waterTerrain(t),
        mask =
          options.water === false || options.elevation === false
            ? 255
            : neighborMask(
                m,
                xx,
                yy,
                options.seasonal === false ? undefined : season,
              ),
        h = tileHash(m.world2?.seed ?? 173, xx, yy);
      if (!previewVisible(m, xx, yy, t, options)) continue;
      let color = COLORS[t] ?? COLORS.grass!;
      if (t === "grass" || t === "dark_grass" || t === "hill")
        color =
          season === "winter"
            ? "#d5e2ca"
            : season === "autumn"
              ? "#aab56b"
              : color;
      ctx.save();
      ctx.translate(x * size, y * size);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size + 0.2, size + 0.2);
      const r = (h % 1000) / 1000;
      ctx.fillStyle = h % 3 === 0 ? "#fff6db18" : "#375b3610";
      ctx.fillRect(0, 0, size, size);
      for (let j = 0; j < 3; j++) {
        const q = tileHash(h, j, 3);
        ctx.fillStyle = wet
          ? "#dcf6e655"
          : t === "snow"
            ? "#ffffff66"
            : "#fff7d932";
        ctx.fillRect(
          ((q % 23) / 32) * size,
          (((q >>> 6) % 24) / 32) * size,
          wet ? size * 0.2 : size * 0.055,
          size * 0.025,
        );
      }
      if (t === "stone_path" || t === "stone" || t === "gravel") {
        ctx.strokeStyle = "#746f5b33";
        ctx.lineWidth = Math.max(0.5, size * 0.025);
        ctx.strokeRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86);
        ctx.beginPath();
        ctx.moveTo(size * (0.3 + r * 0.4), size * 0.1);
        ctx.lineTo(size * 0.48, size * 0.8);
        ctx.stroke();
      }
      if (t === "wood_floor" || t === "tilled_soil") {
        ctx.strokeStyle = t === "wood_floor" ? "#684d3544" : "#49382044";
        ctx.lineWidth = size * 0.05;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (i * size) / 4);
          ctx.lineTo(size, (i * size) / 4);
          ctx.stroke();
        }
      }
      // Connected edges + rounded outer corners and concave inner corners.
      if (mask !== 255) {
        ctx.strokeStyle = wet
          ? "#e9deb5"
          : t === "cliff"
            ? "#635c46"
            : "#ede1b444";
        ctx.lineWidth = wet ? size * 0.11 : size * 0.065;
        ctx.lineCap = "round";
        const pad = size * 0.06;
        const edges = [
          [pad, pad, size - pad, pad],
          [size - pad, pad, size - pad, size - pad],
          [pad, size - pad, size - pad, size - pad],
          [pad, pad, pad, size - pad],
        ];
        edges.forEach((v, i) => {
          if (!(mask & (1 << i))) {
            ctx.beginPath();
            ctx.moveTo(v[0]!, v[1]!);
            ctx.lineTo(v[2]!, v[3]!);
            ctx.stroke();
          }
        });
        for (let i = 0; i < 4; i++) {
          const a = 1 << i,
            b = 1 << (i + 1) % 4;
          if (mask & a && mask & b && !(mask & (1 << (i + 4)))) {
            const px = i === 0 || i === 1 ? size : 0,
              py = i === 1 || i === 2 ? size : 0;
            ctx.beginPath();
            ctx.arc(px, py, size * 0.18, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      const elevation = cell(m, "elevation", xx, yy);
      if (options.elevation !== false && (elevation === 2 || t === "cliff")) {
        ctx.fillStyle = "#5b564455";
        ctx.fillRect(0, size * 0.55, size, size * 0.45);
        ctx.strokeStyle = "#e6d8aa66";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo((size * (i + 0.3)) / 3, size * 0.6);
          ctx.lineTo((size * (i + 0.55)) / 3, size);
          ctx.stroke();
        }
      }
      if (options.elevation !== false && (elevation === 3 || t === "stairs")) {
        ctx.strokeStyle = "#5c584c99";
        ctx.lineWidth = size * 0.06;
        for (let i = 1; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (i * size) / 5);
          ctx.lineTo(size, (i * size) / 5);
          ctx.stroke();
        }
      }
      if (options.elevation !== false && elevation === 1) {
        ctx.fillStyle = "#eef2a81a";
        ctx.fillRect(0, 0, size, size);
      }
      ctx.restore();
    }
}
/** Small LRU. Memory depends on visible chunks, never map dimensions. */
export class ChunkPainter {
  private cache = new Map<string, HTMLCanvasElement>();
  constructor(
    readonly resolution = 16,
    readonly limit = 32,
  ) {}
  clear() {
    this.cache.clear();
  }
  invalidate(x: number, y: number) {
    const cx = Math.floor(x / 16),
      cy = Math.floor(y / 16);
    for (const k of this.cache.keys()) {
      const parts = k.split(":");
      if (
        Math.abs(Number(parts[1]) - cx) <= 1 &&
        Math.abs(Number(parts[2]) - cy) <= 1
      )
        this.cache.delete(k);
    }
  }
  get(
    m: MapData,
    cx: number,
    cy: number,
    season: SeasonKey,
    options: PaintOptions = {},
  ) {
    const key = `${m.id}:${cx}:${cy}:${season}:${JSON.stringify(options)}`;
    let c = this.cache.get(key);
    if (c) {
      this.cache.delete(key);
      this.cache.set(key, c);
      return c;
    }
    c = document.createElement("canvas");
    c.width = c.height = this.resolution * 16;
    paintChunk(
      c.getContext("2d")!,
      m,
      cx,
      cy,
      this.resolution,
      season,
      options,
    );
    this.cache.set(key, c);
    while (this.cache.size > this.limit)
      this.cache.delete(this.cache.keys().next().value!);
    return c;
  }
  draw(
    ctx: CanvasRenderingContext2D,
    m: MapData,
    zoom: number,
    ox: number,
    oy: number,
    w: number,
    h: number,
    season: SeasonKey,
    options: PaintOptions = {},
  ) {
    if (zoom < 4) {
      const step = Math.ceil(4 / zoom),
        x0 = Math.max(0, Math.floor(-ox / zoom)),
        y0 = Math.max(0, Math.floor(-oy / zoom));
      for (
        let y = y0;
        y < Math.min(m.height, (h - oy) / zoom + step);
        y += step
      )
        for (
          let x = x0;
          x < Math.min(m.width, (w - ox) / zoom + step);
          x += step
        ) {
          const t = previewTerrain(m, x, y, season, options);
          if (!previewVisible(m, x, y, t, options)) continue;
          ctx.fillStyle = COLORS[t]!;
          ctx.fillRect(
            ox + x * zoom,
            oy + y * zoom,
            step * zoom + 0.1,
            step * zoom + 0.1,
          );
        }
      return;
    }
    const startX = Math.max(0, Math.floor(-ox / zoom / 16)),
      endX = Math.min(
        Math.ceil(m.width / 16) - 1,
        Math.floor((w - ox) / zoom / 16),
      ),
      startY = Math.max(0, Math.floor(-oy / zoom / 16)),
      endY = Math.min(
        Math.ceil(m.height / 16) - 1,
        Math.floor((h - oy) / zoom / 16),
      );
    for (let cy = startY; cy <= endY; cy++)
      for (let cx = startX; cx <= endX; cx++)
        ctx.drawImage(
          this.get(m, cx, cy, season, options),
          ox + cx * 16 * zoom,
          oy + cy * 16 * zoom,
          16 * zoom,
          16 * zoom,
        );
  }
  get cachedChunks() {
    return this.cache.size;
  }
}
