import { TERRAIN } from "./world2.js";
import { validateProperties, validateWorld2 } from "./world2-validation.js";
import { MAPS, ASSETS, TILE, type MapData, type MapObject } from "./content.js";
import { dressing } from "./dressing.js";
export type WorldLayout = {
  version: 1 | 2;
  worldVersion?: number;
  blueprintId?: string;
  maps: Record<string, MapData>;
};
export const FIXTURE_KINDS = [
  "tree",
  "well",
  "chest",
  "craft",
  "barn",
  "trough",
  "board",
  "animal",
  "machine",
] as const;
export const GENERATED_ASSETS = [
  "bridge",
  "bridge_wide",
  "reed",
  "water_lily",
  "mushroom",
  "decor_board",
  "decor_scarecrow",
  "icon_cow",
  "icon_sheep",
];
export function defaultLayout(): WorldLayout {
  const maps = Object.fromEntries(
    Object.entries(MAPS).map(([id, map]) => [id, structuredClone(map)]),
  );
  for (const map of Object.values(maps)) {
    for (const o of map.objects)
      if (map.id === "farm" && o.assetId.startsWith("tree")) o.kind = "tree";
    for (const [i, o] of dressing(map.id).entries())
      map.objects.push({
        id: `dressing-${i}`,
        assetId: o.asset,
        position: { tileX: o.x / TILE, tileY: o.y / TILE },
        label: o.label,
        scale: o.scale,
        decorative: true,
      });
  }
  // Existing authored spawn IDs remain available for return warps.
  maps.farm!.spawns.unshift({
    id: "farm_entry",
    tileX: 7,
    tileY: 9,
    facing: "down",
  });
  for (const [id, area, kind, x, y, asset] of [
    ["starter-pine", "farm", "tree", 7, 12, "tree"],
    ["family-chest", "farm", "chest", 8, 9.5, "storage_chest"],
    ["crafting-table", "farm", "craft", 6, 10.5, "crafting_table"],
    ["water-well", "farm", "well", 12, 5.3, "stone_well"],
    ["animal-starter", "farm", "animal", 39, 12, "chicken"],
    ["animal-home", "farm", "barn", 41, 8, "chicken_coop"],
    ["feeding-trough", "farm", "trough", 40, 12, "feed_trough"],
    ["town-board", "town", "board", 18, 9, "decor_board"],
    ["workshop-table", "workshop", "craft", 10, 6, "crafting_table"],
    ["cafe-kitchen", "cafe", "craft", 12, 5, "crafting_table"],
  ] as const)
    maps[area]!.objects.push({
      id,
      assetId: asset,
      kind,
      position: { tileX: x, tileY: y },
    });
  // The old well is replaced by its authoritative interactive counterpart.
  maps.farm!.objects = maps.farm!.objects.filter((o) => o.id !== "yard_well");
  return { version: 1, maps };
}
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("설계도 형식이 올바르지 않습니다");
  return v as Record<string, unknown>;
};
const num = (v: unknown, min: number, max: number) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error(`숫자 범위 ${min}~${max}를 확인하세요`);
  return v;
};
const str = (v: unknown, max = 64) => {
  if (
    typeof v !== "string" ||
    !v.length ||
    v.length > max ||
    /[\x00-\x1f]/.test(v)
  )
    throw Error("이름/ID를 확인하세요");
  return v;
};
const id = (v: unknown) => {
  const s = str(v);
  if (
    !/^[\w-]+$/.test(s) ||
    ["__proto__", "constructor", "prototype"].includes(s)
  )
    throw Error("ID는 영문/숫자/_/-만 사용하세요");
  return s;
};
const list = (v: unknown, max: number) => {
  if (!Array.isArray(v) || v.length > max)
    throw Error("설계도 오브젝트 수 제한을 확인하세요");
  return v as unknown[];
};
export function validateLayout(value: unknown): WorldLayout {
  const root = record(value),
    raw = record(root.maps),
    maps: Record<string, MapData> = {};
  if (
    ![1, 2].includes(root.version as number) ||
    Object.keys(raw).length > 32 ||
    !Object.keys(MAPS).every((k) => raw[k])
  )
    throw Error("기본 지역 목록을 유지하세요");
  let cells = 0;
  for (const key of Object.keys(raw)) {
    id(key);
    const m = record(raw[key]),
      width = num(m.width, 12, 1024),
      height = num(m.height, 12, 1024);
    if (!Number.isInteger(width) || !Number.isInteger(height))
      throw Error("맵 크기는 정수입니다");
    cells += width * height;
    if (width * height > 262144 || cells > 1048576)
      throw Error("맵별 262,144 / 전체 1,048,576타일 이하입니다");
    const rect = (v: unknown) => {
      const r = record(v);
      const q = {
        startX: num(r.startX, 0, width - 1),
        endX: num(r.endX, 0, width - 1),
        startY: num(r.startY, 0, height - 1),
        endY: num(r.endY, 0, height - 1),
      };
      if (q.startX > q.endX || q.startY > q.endY)
        throw Error("영역의 시작/끝을 확인하세요");
      return q;
    };
    const point = (v: unknown) => {
      const p = record(v);
      return {
        tileX: num(p.tileX, 0, width - 0.01),
        tileY: num(p.tileY, 0, height - 0.01),
      };
    };
    const tile = (v: unknown) => {
      const s = str(v);
      if (
        ![
          ...TERRAIN,
          "grass",
          "path",
          "dirt",
          "water",
          "mine_floor",
          "wood_floor",
          "stone_floor",
          "floor",
          "wood",
          "stone",
          "sand",
        ].includes(s)
      )
        throw Error("지원하지 않는 바닥 타일");
      return s;
    };
    const objects = list(m.objects, 12000).map((v) => {
      const o = record(v),
        assetId = str(o.assetId);
      if (!ASSETS[assetId] && !GENERATED_ASSETS.includes(assetId))
        throw Error("알 수 없는 에셋: " + assetId);
      const out: MapObject = {
        id: id(o.id),
        assetId,
        position: point(o.position),
        ...validateProperties(o),
      };
      if (o.kind !== undefined) {
        const k = str(o.kind);
        if (!(FIXTURE_KINDS as readonly string[]).includes(k))
          throw Error("상호작용 종류 오류");
        out.kind = k;
      }
      if (o.label) out.label = str(o.label, 60);
      if (o.scale !== undefined) out.scale = num(o.scale, 0.2, 3);
      if (o.decorative === true) out.decorative = true;
      if (o.collision) {
        const c = record(o.collision);
        out.collision = {
          x: num(c.x, -512, 512),
          y: num(c.y, -512, 512),
          width: num(c.width, 1, 512),
          height: num(c.height, 1, 512),
        };
      }
      return out;
    });
    if (new Set(objects.map((o) => o.id)).size !== objects.length)
      throw Error(key + " 오브젝트 ID 중복");
    const spawns = list(m.spawns, 30).map((v) => {
      const s = record(v);
      const facing = str(s.facing);
      if (!["up", "down", "left", "right"].includes(facing))
        throw Error("방향 오류");
      return { id: id(s.id), ...point(s), facing };
    });
    if (
      !spawns.length ||
      new Set(spawns.map((s) => s.id)).size !== spawns.length
    )
      throw Error("지역별 고유 spawn이 필요합니다");
    const warps = list(m.warps, 40).map((v) => {
      const w = record(v);
      return {
        id: id(w.id),
        area: rect(w.area),
        targetMapId: id(w.targetMapId),
        targetSpawnId: id(w.targetSpawnId),
        ...(w.facing
          ? {
              facing: ["up", "down", "left", "right"].includes(String(w.facing))
                ? str(w.facing)
                : (() => {
                    throw Error("출입구 방향 오류");
                  })(),
            }
          : {}),
        ...(w.effect
          ? {
              effect: ["fade", "instant"].includes(String(w.effect))
                ? str(w.effect)
                : (() => {
                    throw Error("전환 효과 오류");
                  })(),
            }
          : {}),
      };
    });
    if (new Set(warps.map((w) => w.id)).size !== warps.length)
      throw Error("출입구 ID 중복");
    maps[key] = {
      ...(m.world2 ? { world2: validateWorld2(m.world2, width, height) } : {}),
      id: key,
      name: str(m.name, 60),
      width,
      height,
      baseTileType: tile(m.baseTileType),
      objects,
      spawns,
      warps,
      terrainRegions: list(m.terrainRegions, 500).map((v) => ({
        ...rect(v),
        tileType: tile(record(v).tileType),
      })),
      farmAreas: list(m.farmAreas, 100).map(rect),
      collisionRegions: list(m.collisionRegions, 300).map(rect),
    };
  }
  const ids = new Set<string>();
  for (const map of Object.values(maps)) {
    for (const o of map.objects.filter((o) => o.kind)) {
      if (ids.has(o.id))
        throw Error("상호작용 오브젝트 ID는 전체 맵에서 고유해야 합니다");
      ids.add(o.id);
    }
    for (const w of map.warps)
      if (!maps[w.targetMapId]?.spawns.some((s) => s.id === w.targetSpawnId))
        throw Error(`${map.name}: 출입구 목적지 spawn이 없습니다`);
  }
  for (const m of Object.values(maps))
    for (const e of m.world2?.events ?? [])
      if (
        e.action === "warp" &&
        !maps[e.destination ?? ""]?.spawns.some((s) => s.id === e.spawn)
      )
        throw Error("이벤트 출입구 목적지 오류");
  return {
    version: root.version as 1 | 2,
    maps,
    ...(root.worldVersion !== undefined
      ? { worldVersion: num(root.worldVersion, 0, 1000000000) }
      : {}),
    ...(root.blueprintId ? { blueprintId: id(root.blueprintId) } : {}),
  };
}
