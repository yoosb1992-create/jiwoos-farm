import { defaultLayout, type WorldLayout } from "../../shared/layout.js";
import type { MapData, MapObject, Rect } from "../../shared/content.js";
import {
  cell,
  setCell,
  migrateMap,
  invalidateObjectIndex,
  CELL_LAYERS,
  type CellLayer,
} from "../../shared/world2.js";
export type Change =
  | {
      type: "cell";
      area: string;
      layer: CellLayer;
      x: number;
      y: number;
      before: number;
      after: number;
    }
  | {
      type: "object";
      area: string;
      id: string;
      before: MapObject | undefined;
      after: MapObject | undefined;
    }
  | { type: "field"; path: string[]; before: unknown; after: unknown };
export interface PackedCells {
  type: "packed";
  area: string;
  layer: CellLayer;
  cx: number;
  cy: number;
  data: Uint8Array;
}
export interface Command {
  name: string;
  changes: Array<Change | PackedCells>;
}
export function editorLayout(): WorldLayout {
  const l = defaultLayout();
  l.version = 2;
  for (const m of Object.values(l.maps)) migrateMap(m);
  return l;
}
export class Journal {
  undoStack: Command[] = [];
  redoStack: Command[] = [];
  pending = new Map<string, Change>();
  name = "수정";
  constructor(public layout: WorldLayout) {}
  begin(name: string) {
    this.pending.clear();
    this.name = name;
  }
  tile(area: string, layer: CellLayer, x: number, y: number, value: number) {
    const m = this.layout.maps[area]!;
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return;
    const k = `c:${area}:${layer}:${x}:${y}`;
    const prior = this.pending.get(k);
    const c: Change = {
      type: "cell",
      area,
      layer,
      x,
      y,
      before: prior?.type === "cell" ? prior.before : cell(m, layer, x, y),
      after: value,
    };
    if (c.before === c.after) this.pending.delete(k);
    else this.pending.set(k, c);
    setCell(m, layer, x, y, value);
  }
  object(area: string, id: string, after: MapObject | undefined) {
    const m = this.layout.maps[area]!,
      k = `o:${area}:${id}`,
      prior = this.pending.get(k),
      before =
        prior?.type === "object"
          ? prior.before
          : structuredClone(m.objects.find((o) => o.id === id));
    const c: Change = {
      type: "object",
      area,
      id,
      before,
      after: structuredClone(after),
    };
    this.pending.set(k, c);
    this.apply(c, true);
  }
  field(path: string[], after: unknown) {
    const k = `f:${path.join("/")}`,
      prior = this.pending.get(k);
    let parent: unknown = this.layout;
    for (const p of path.slice(0, -1))
      parent = (parent as Record<string, unknown>)[p];
    const c: Change = {
      type: "field",
      path,
      before:
        prior?.type === "field"
          ? prior.before
          : structuredClone((parent as Record<string, unknown>)[path.at(-1)!]),
      after: structuredClone(after),
    };
    this.pending.set(k, c);
    this.apply(c, true);
  }
  commit() {
    if (this.pending.size) {
      const chunks = new Map<
          string,
          {
            area: string;
            layer: CellLayer;
            cx: number;
            cy: number;
            data: number[];
          }
        >(),
        changes: Array<Change | PackedCells> = [];
      for (const c of this.pending.values()) {
        if (c.type !== "cell") {
          changes.push(c);
          continue;
        }
        const cx = Math.floor(c.x / 16),
          cy = Math.floor(c.y / 16),
          key = `${c.area}:${c.layer}:${cx},${cy}`;
        let p = chunks.get(key);
        if (!p)
          chunks.set(
            key,
            (p = { area: c.area, layer: c.layer, cx, cy, data: [] }),
          );
        p.data.push((c.y % 16) * 16 + (c.x % 16), c.before, c.after);
      }
      const packed = [...chunks.values()].map((c) => ({
        ...c,
        type: "packed" as const,
        data: Uint8Array.from(c.data),
      }));
      this.undoStack.push({
        name: this.name,
        changes: [...packed, ...changes],
      });
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack = [];
    }
    this.pending.clear();
  }
  cancel() {
    for (const c of [...this.pending.values()].reverse()) this.apply(c, false);
    this.pending.clear();
  }
  undo() {
    const c = this.undoStack.pop();
    if (!c) return;
    for (const p of [...c.changes].reverse()) this.apply(p, false);
    this.redoStack.push(c);
  }
  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    for (const p of c.changes) this.apply(p, true);
    this.undoStack.push(c);
  }
  private apply(c: Change | PackedCells, forward: boolean) {
    if (c.type === "packed") {
      const m = this.layout.maps[c.area]!;
      for (let i = 0; i < c.data.length; i += 3) {
        const n = c.data[i]!;
        setCell(
          m,
          c.layer,
          c.cx * 16 + (n % 16),
          c.cy * 16 + Math.floor(n / 16),
          c.data[i + (forward ? 2 : 1)]!,
        );
      }
      return;
    }
    const v = forward ? c.after : c.before;
    if (c.type === "cell") {
      setCell(this.layout.maps[c.area]!, c.layer, c.x, c.y, v as number);
      return;
    }
    if (c.type === "object") {
      const m = this.layout.maps[c.area]!,
        i = m.objects.findIndex((o) => o.id === c.id);
      if (v) {
        if (i >= 0) m.objects[i] = structuredClone(v as MapObject);
        else m.objects.push(structuredClone(v as MapObject));
      } else if (i >= 0) m.objects.splice(i, 1);
      invalidateObjectIndex(m);
      return;
    }
    let parent: unknown = this.layout;
    for (const p of c.path.slice(0, -1))
      parent = (parent as Record<string, unknown>)[p];
    if (v === undefined)
      delete (parent as Record<string, unknown>)[c.path.at(-1)!];
    else
      (parent as Record<string, unknown>)[c.path.at(-1)!] = structuredClone(v);
  }
}
export interface Stamp {
  name: string;
  width: number;
  height: number;
  tiles: Array<[CellLayer, number, number, number]>;
  objects: MapObject[];
}
export function capture(m: MapData, r: Rect): Stamp {
  const out: Stamp = {
    name: "선택 영역",
    width: r.endX - r.startX + 1,
    height: r.endY - r.startY + 1,
    tiles: [],
    objects: [],
  };
  for (let y = r.startY; y <= r.endY; y++)
    for (let x = r.startX; x <= r.endX; x++)
      for (const l of CELL_LAYERS) {
        const n = cell(m, l, x, y);
        if (n) out.tiles.push([l, x - r.startX, y - r.startY, n]);
      }
  out.objects = m.objects
    .filter(
      (o) =>
        o.position.tileX >= r.startX &&
        o.position.tileX <= r.endX + 1 &&
        o.position.tileY >= r.startY &&
        o.position.tileY <= r.endY + 1,
    )
    .map((o) => ({
      ...structuredClone(o),
      position: {
        tileX: o.position.tileX - r.startX,
        tileY: o.position.tileY - r.startY,
      },
    }));
  return out;
}
export function line(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fn: (x: number, y: number) => void,
) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let i = 0; i <= steps; i++)
    fn(
      Math.round(a.x + ((b.x - a.x) * i) / steps),
      Math.round(a.y + ((b.y - a.y) * i) / steps),
    );
}
/** Iterative, once-per-cell flood; bounded allocation at 4 bytes per map cell. */
export function flood(
  m: MapData,
  layer: CellLayer,
  x: number,
  y: number,
  apply: (x: number, y: number) => void,
) {
  const target = cell(m, layer, x, y),
    seen = new Uint8Array(m.width * m.height),
    q = new Int32Array(m.width * m.height);
  q[0] = y * m.width + x;
  seen[q[0]!] = 1;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const i = q[head]!,
      xx = i % m.width,
      yy = Math.floor(i / m.width);
    apply(xx, yy);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = xx + dx!,
        ny = yy + dy!,
        j = ny * m.width + nx;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= m.width ||
        ny >= m.height ||
        seen[j] ||
        cell(m, layer, nx, ny) !== target
      )
        continue;
      seen[j] = 1;
      q[tail++] = j;
    }
  }
}
