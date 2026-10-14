import {
  collidesWithObstacle,
  isFarmable,
  prepareDynamicObstacles,
} from "./applyMovement.js";
import { cell, terrainAt, blockedTile } from "./world2.js";
import { findPath } from "./pathfinding.js";
import { TILE, type MapData } from "./content.js";
import { legacyLayout, type WorldLayout } from "./layout.js";
import {
  prepareLayout,
  type LayoutConflict,
  type LayoutReview,
} from "./world-templates.js";
import { seedFixtures, type World } from "./world.js";

/** Layout-only patch: world progression and every existing live entity stay intact.
 * Existing stateful fixtures must be moved with gameplay tools, not a map rewrite. */
export function reviewLayout(
  world: World,
  value: unknown,
): { review: LayoutReview; world: World } {
  const layout = prepareLayout(value),
    before = prepareLayout(world.layout ?? legacyLayout());
  const conflicts: LayoutConflict[] = [];
  const conflict = (
    area: string,
    id: string,
    x: number,
    y: number,
    reason: string,
  ) => {
    conflicts.push({ area, id, x: x / TILE, y: y / TILE, reason });
  };
  const oldObjects = new Map(
    Object.values(before.maps).flatMap((m) =>
      m.objects
        .filter((o) => o.kind)
        .map((o) => [o.id, { map: m.id, object: o }] as const),
    ),
  );
  const newObjects = new Map(
    Object.values(layout.maps).flatMap((m) =>
      m.objects
        .filter((o) => o.kind)
        .map((o) => [o.id, { map: m.id, object: o }] as const),
    ),
  );
  const stable = (v: unknown): string => {
    if (!v || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) + ":" + stable((v as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  };
  for (const [id, old] of oldObjects)
    if (old.object.kind) {
      const next = newObjects.get(id);
      if (
        !next ||
        next.map !== old.map ||
        stable(next.object) !== stable(old.object)
      )
        conflict(
          old.map,
          id,
          old.object.position.tileX * TILE,
          old.object.position.tileY * TILE,
          "기존 상호작용 배치물은 게임에서 이동·회수하세요",
        );
    }
  // Ignore authored entity collision at its own anchor; terrain + static buildings
  // are checked below, while their own physical collision remains entity-owned.
  const staticMaps = Object.fromEntries(
    Object.entries(layout.maps).map(([id, m]) => [
      id,
      { ...m, objects: m.objects.filter((o) => !o.kind) },
    ]),
  ) as Record<string, MapData>;
  const priorStatic = Object.fromEntries(
    Object.entries(before.maps).map(([id, m]) => [
      id,
      { ...m, objects: m.objects.filter((o) => !o.kind) },
    ]),
  ) as Record<string, MapData>;
  const checkPoint = (
    area: string,
    id: string,
    x: number,
    y: number,
    kind: string,
  ) => {
    const map = staticMaps[area],
      oldMap = priorStatic[area];
    const tx = Math.floor(x / TILE),
      ty = Math.floor(y / TILE);
    const newlyChangedBlock =
      map &&
      oldMap &&
      blockedTile(map, tx, ty) &&
      (terrainAt(map, tx, ty) !== terrainAt(oldMap, tx, ty) ||
        cell(map, "collision", tx, ty) !== cell(oldMap, "collision", tx, ty) ||
        cell(map, "elevation", tx, ty) !== cell(oldMap, "elevation", tx, ty));
    if (
      !map ||
      newlyChangedBlock ||
      x < 0 ||
      y < 0 ||
      x >= map.width * TILE ||
      y >= map.height * TILE ||
      (collidesWithObstacle(x, y, area, staticMaps) &&
        (!priorStatic[area] || !collidesWithObstacle(x, y, area, priorStatic)))
    )
      conflict(area, id, x, y, `${kind}: 변경된 지형·건물과 충돌`);
    if (
      ["soil", "crop", "withered"].includes(kind) &&
      (!map ||
        !isFarmable(
          area,
          Math.floor(x / TILE),
          Math.floor(y / TILE),
          layout.maps,
        ))
    )
      conflict(area, id, x, y, "경작지·작물의 농사 가능 영역을 유지하세요");
  };
  for (const e of [
    ...Object.values(world.entities),
    ...Object.values(world.treeRegrowth ?? {}),
  ])
    checkPoint(e.area, e.id, e.x, e.y, e.kind);
  for (const member of Object.values(world.members)) {
    const p = member.carried?.position ?? member.position;
    if (p) {
      checkPoint(p.area, member.nickname, p.x, p.y, "플레이어");
      const previous = priorStatic[p.area],
        next = staticMaps[p.area];
      if (previous && next && stable(previous) !== stable(next)) {
        const reaches = (m: MapData) => (q: { x: number; y: number }) =>
          m.spawns.some(
            (s) =>
              Math.hypot(q.x - s.tileX * TILE, q.y - s.tileY * TILE) < TILE,
          );
        if (
          !findPath(p.area, p, reaches(next), staticMaps) &&
          findPath(p.area, p, reaches(previous), priorStatic)
        )
          conflict(
            p.area,
            member.nickname,
            p.x,
            p.y,
            "플레이어에서 시작점으로 이어지는 이동 경로가 막힙니다",
          );
      }
    }
  }
  const additions = new Set<string>();
  const obstacles = prepareDynamicObstacles(Object.values(world.entities));
  for (const [id, next] of newObjects)
    if (next.object.kind && !oldObjects.has(id)) {
      const p = next.object.position;
      const physicalOverlap =
        Object.values(world.entities).some(
          (e) =>
            e.area === next.map &&
            Math.abs(e.x - p.tileX * TILE) < TILE &&
            Math.abs(e.y - p.tileY * TILE) < TILE,
        ) ||
        Object.values(world.members).some((m) => {
          const pos = m.carried?.position ?? m.position;
          return (
            pos?.area === next.map &&
            Math.hypot(pos.x - p.tileX * TILE, pos.y - p.tileY * TILE) < TILE
          );
        });
      if (
        physicalOverlap ||
        world.entities[id] ||
        world.retiredFixtures?.[id] ||
        Object.values(world.members).some((m) =>
          m.carried?.entities.some((e) => e.id === id),
        ) ||
        collidesWithObstacle(
          p.tileX * TILE,
          p.tileY * TILE,
          next.map,
          staticMaps,
          obstacles,
        )
      )
        conflict(
          next.map,
          id,
          p.tileX * TILE,
          p.tileY * TILE,
          "새 배치물이 기존 오브젝트와 겹칩니다",
        );
      additions.add(id);
    }
  const proposed = structuredClone(world);
  proposed.layout = layout;
  proposed.layoutRevision = (world.layoutRevision ?? 0) + 1;
  if (!conflicts.length) {
    seedFixtures(proposed, false, additions);
    seedFixtures(proposed, true, additions);
  }
  return {
    world: proposed,
    review: {
      revision: world.revision,
      layoutRevision: proposed.layoutRevision,
      changedMaps: [
        ...new Set([...Object.keys(before.maps), ...Object.keys(layout.maps)]),
      ].filter((id) => stable(before.maps[id]) !== stable(layout.maps[id])),
      conflicts,
      protectedEntities: Object.keys(world.entities).length,
      protectedMembers: Object.keys(world.members).length,
    },
  };
}
