import { inferSpecies } from "./nature.js";
import {
  CELL_LAYERS,
  LAYERS,
  SEASONS,
  TERRAIN,
  newWorld2,
  type World2Map,
  type ObjectProperties,
  type EventZone,
} from "./world2.js";
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("월드 데이터 형식 오류");
  return v as Record<string, unknown>;
};
const number = (v: unknown, min: number, max: number) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error(`월드 숫자 범위 ${min}~${max}`);
  return v;
};
const integer = (v: unknown, min: number, max: number) => {
  const n = number(v, min, max);
  if (!Number.isInteger(n)) throw Error("정수가 필요합니다");
  return n;
};
const text = (v: unknown, max = 120) => {
  if (typeof v !== "string" || v.length > max || /[\x00-\x1f]/.test(v))
    throw Error("문자열 오류");
  return v;
};
const choice = <T extends string>(v: unknown, choices: readonly T[]): T => {
  if (!choices.includes(v as T)) throw Error("지원하지 않는 월드 설정");
  return v as T;
};
const array = (v: unknown, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw Error("월드 항목 제한 초과");
  return v;
};
const ident = (v: unknown) => {
  const s = text(v, 64);
  if (
    !/^[\w-]+$/.test(s) ||
    ["__proto__", "prototype", "constructor"].includes(s)
  )
    throw Error("ID 오류");
  return s;
};
export function validateProperties(v: unknown): ObjectProperties {
  const o = obj(v),
    p: ObjectProperties = {};
  for (const k of ["width", "height"] as const)
    if (o[k] !== undefined) p[k] = number(o[k], 0.25, 32);
  if (o.rotation !== undefined) p.rotation = number(o.rotation, -360, 360);
  if (o.depth !== undefined) p.depth = number(o.depth, -1000, 1000);
  if (o.layer !== undefined)
    p.layer = choice(o.layer, [
      "Ground Decoration",
      "Objects",
      "Buildings",
      "Upper Decoration",
      "Seasonal",
    ] as const);
  if (o.visible !== undefined) {
    if (typeof o.visible !== "boolean") throw Error("표시 설정 오류");
    p.visible = o.visible;
  }
  if (o.bridge !== undefined) {
    if (typeof o.bridge !== "boolean") throw Error("다리 설정 오류");
    p.bridge = o.bridge;
  }
  if (o.group) p.group = ident(o.group);
  if (o.seasons) p.seasons = array(o.seasons, 4).map((s) => choice(s, SEASONS));
  if (o.tree) {
    const t = obj(o.tree);
    p.tree = {
      species: inferSpecies(text(t.species ?? "tree_oak", 40)),
      planted: t.planted === true,
      stage: integer(t.stage ?? 2, 0, 4),
      chop: t.chop === true,
      stump: t.stump === true,
      regrow: t.regrow === true,
      drop: text(t.drop ?? "", 64),
    };
  }
  if (o.building) {
    const b = obj(o.building);
    p.building = { home: text(b.home, 64), shadow: b.shadow === true };
  }
  return p;
}
export function validateWorld2(
  v: unknown,
  width: number,
  height: number,
): World2Map {
  const o = obj(v);
  if (o.chunkSize !== 16) throw Error("16×16 청크만 지원합니다");
  const w = newWorld2(integer(o.seed, 0, 4294967295)),
    chunks = obj(o.chunks);
  if (
    Object.keys(chunks).length >
    Math.ceil(width / 16) * Math.ceil(height / 16)
  )
    throw Error("청크 수 초과");
  for (const [key, value] of Object.entries(chunks)) {
    if (!/^\d+,\d+$/.test(key)) throw Error("청크 좌표 오류");
    const [cx, cy] = key.split(",").map(Number) as [number, number];
    if (cx * 16 >= width || cy * 16 >= height)
      throw Error("청크가 맵 밖에 있습니다");
    const layers = obj(obj(value).layers),
      out: World2Map["chunks"][string] = { layers: {} };
    for (const [layer, values] of Object.entries(layers)) {
      const l = choice(layer, CELL_LAYERS),
        entries = obj(values),
        data: Record<string, number> = {};
      if (Object.keys(entries).length > 256) throw Error("청크 용량 초과");
      for (const [k, val] of Object.entries(entries)) {
        if (!/^(0|[1-9]\d{0,2})$/.test(k)) throw Error("타일 번호 오류");
        const i = integer(Number(k), 0, 255);
        if (
          cx * 16 + (i % 16) >= width ||
          cy * 16 + Math.floor(i / 16) >= height
        )
          throw Error("타일이 맵 밖에 있습니다");
        const max =
          l === "collision"
            ? 2
            : l === "elevation"
              ? 4
              : l === "zones"
                ? 127
                : TERRAIN.length;
        const n = integer(val, 0, max);
        if (l === "water" && n !== 0 && ![13, 14, 15].includes(n))
          throw Error("물 레이어 오류");
        if (n) data[k] = n;
      }
      if (Object.keys(data).length) out.layers[l] = data;
    }
    if (Object.keys(out.layers).length) w.chunks[key] = out;
  }
  if (o.fishing) {
    const f = obj(o.fishing);
    w.fishing = {
      waterType: choice(f.waterType, [
        "pond",
        "river",
        "forest",
        "sea",
        "cave",
      ]),
      table: choice(f.table, ["seasonal", "common", "rare"]),
      seasonOverride: choice(f.seasonOverride, ["", ...SEASONS]),
      rareFishBonus: number(f.rareFishBonus, 0, 1),
    };
  }
  const ids = new Set<string>();
  w.npcRoutes = array(o.npcRoutes ?? [], 40).map((v) => {
    const r = obj(v),
      id = ident(r.id);
    if (ids.has(id)) throw Error("NPC 경로 ID 중복");
    ids.add(id);
    return {
      id,
      points: array(r.points, 48)
        .map((v) => {
          const p = obj(v);
          return {
            minute: integer(p.minute, 0, 1439),
            x: number(p.x, 0, width - 0.01),
            y: number(p.y, 0, height - 0.01),
            facing: choice(p.facing, ["up", "down", "left", "right"]),
            animation: text(p.animation ?? "", 40),
            dialogue: text(p.dialogue ?? "", 240),
          };
        })
        .sort((a, b) => a.minute - b.minute),
    };
  });
  ids.clear();
  w.events = array(o.events ?? [], 200).map((v) => {
    const e = obj(v),
      a = obj(e.area),
      id = ident(e.id);
    if (ids.has(id)) throw Error("이벤트 ID 중복");
    ids.add(id);
    const area = {
      startX: integer(a.startX, 0, width - 1),
      endX: integer(a.endX, 0, width - 1),
      startY: integer(a.startY, 0, height - 1),
      endY: integer(a.endY, 0, height - 1),
    };
    if (area.startX > area.endX || area.startY > area.endY)
      throw Error("이벤트 영역 오류");
    return {
      id,
      name: text(e.name, 60),
      area,
      trigger: choice(e.trigger, [
        "enter",
        "interact",
        "date",
        "time",
        "weather",
        "season",
        "quest",
      ]),
      condition: text(e.condition ?? "", 100),
      once: e.once === true,
      action: choice(e.action, ["dialogue", "item", "warp", "quest", "effect"]),
      value: text(e.value ?? "", 240),
      quantity: integer(e.quantity ?? 1, 1, 99),
      ...(e.destination
        ? { destination: ident(e.destination), spawn: ident(e.spawn) }
        : {}),
    } satisfies EventZone;
  });
  return w;
}
