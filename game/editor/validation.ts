import { WORLD_OBJECT_ASSETS } from "../assets/definitions";
import { TILE_TYPE_DEFINITIONS } from "../maps/definitions";
import type { MapDefinition, PixelRect, TileRect } from "../maps/types";
import { EDITOR_DOCUMENT_VERSION, type MapEditorDocument, type ValidationIssue } from "./types";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const facing = (value: unknown) => value === "up" || value === "down" || value === "left" || value === "right";
const tileType = (value: unknown): value is keyof typeof TILE_TYPE_DEFINITIONS => typeof value === "string" && Object.hasOwn(TILE_TYPE_DEFINITIONS, value);
const asset = (value: unknown): value is keyof typeof WORLD_OBJECT_ASSETS => typeof value === "string" && Object.hasOwn(WORLD_OBJECT_ASSETS, value);

const rectShape = (value: unknown): value is TileRect => record(value) && number(value.startX) && number(value.endX) && number(value.startY) && number(value.endY);
const pixelRectShape = (value: unknown): value is PixelRect => record(value) && number(value.x) && number(value.y) && number(value.width) && number(value.height);
const rectValid = (rect: TileRect, map: { width: number; height: number }) => rect.startX >= 0 && rect.startY >= 0 && rect.endX >= rect.startX && rect.endY >= rect.startY && rect.endX < map.width && rect.endY < map.height;

export function validateEditorDocument(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record(value)) return [{ path: "document", message: "편집기 문서는 객체여야 합니다." }];
  if (value.editorVersion !== EDITOR_DOCUMENT_VERSION) issues.push({ path: "editorVersion", message: `지원 버전은 ${EDITOR_DOCUMENT_VERSION}입니다.` });
  if (!Array.isArray(value.maps)) return [...issues, { path: "maps", message: "maps 배열이 필요합니다." }];
  const maps = value.maps;
  const mapIds = new Set<string>();
  for (let index = 0; index < maps.length; index += 1) {
    const raw = maps[index];
    if (!record(raw) || !text(raw.id)) { issues.push({ path: `maps[${index}]`, message: "map id가 필요합니다." }); continue; }
    const mapId = raw.id;
    if (mapIds.has(mapId)) issues.push({ mapId, path: "id", message: "중복된 map id입니다." });
    mapIds.add(mapId);
    if (!text(raw.name)) issues.push({ mapId, path: "name", message: "맵 이름이 필요합니다." });
    if (!number(raw.width) || !Number.isInteger(raw.width) || raw.width < 4 || raw.width > 200) issues.push({ mapId, path: "width", message: "width는 4~200 정수여야 합니다." });
    if (!number(raw.height) || !Number.isInteger(raw.height) || raw.height < 4 || raw.height > 200) issues.push({ mapId, path: "height", message: "height는 4~200 정수여야 합니다." });
    if (!tileType(raw.baseTileType)) issues.push({ mapId, path: "baseTileType", message: "존재하지 않는 tile type입니다." });
    for (const field of ["terrainRegions", "farmAreas", "collisionRegions", "objects", "spawns", "warps"] as const) if (!Array.isArray(raw[field])) issues.push({ mapId, path: field, message: "배열이어야 합니다." });
    if (!record(raw.boundary) || typeof raw.boundary.enabled !== "boolean" || (raw.boundary.openings !== undefined && !Array.isArray(raw.boundary.openings))) issues.push({ mapId, path: "boundary", message: "boundary 정의가 올바르지 않습니다." });
    if (issues.some((issue) => issue.mapId === mapId && (issue.path === "width" || issue.path === "height"))) continue;
    const map = raw as unknown as MapDefinition;
    const validateRects = (values: unknown, path: string, withTile = false) => {
      if (!Array.isArray(values)) return;
      values.forEach((entry, i) => {
        if (!rectShape(entry) || !rectValid(entry, map)) issues.push({ mapId, path: `${path}[${i}]`, message: "영역이 맵 범위 안의 정상 사각형이어야 합니다." });
        if (withTile && (!record(entry) || !tileType(entry.tileType))) issues.push({ mapId, path: `${path}[${i}].tileType`, message: "존재하지 않는 tile type입니다." });
      });
    };
    validateRects(raw.terrainRegions, "terrainRegions", true);
    validateRects(raw.farmAreas, "farmAreas");
    validateRects(raw.collisionRegions, "collisionRegions");
    if (record(raw.boundary)) validateRects(raw.boundary.openings, "boundary.openings");
    const objectIds = new Set<string>();
    if (Array.isArray(raw.objects)) raw.objects.forEach((entry, i) => {
      if (!record(entry) || !text(entry.id)) { issues.push({ mapId, path: `objects[${i}]`, message: "object id가 필요합니다." }); return; }
      if (objectIds.has(entry.id)) issues.push({ mapId, path: `objects.${entry.id}`, message: "중복된 object id입니다." });
      objectIds.add(entry.id);
      if (!asset(entry.assetId)) issues.push({ mapId, path: `objects.${entry.id}.assetId`, message: "등록되지 않은 asset입니다." });
      if (!record(entry.position) || !number(entry.position.tileX) || !number(entry.position.tileY) || entry.position.tileX < -2 || entry.position.tileY < -2 || entry.position.tileX > map.width + 2 || entry.position.tileY > map.height + 2) issues.push({ mapId, path: `objects.${entry.id}.position`, message: "오브젝트 위치가 맵 범위를 벗어났습니다." });
      if (entry.displaySizeOverride !== undefined && (!record(entry.displaySizeOverride) || !number(entry.displaySizeOverride.width) || !number(entry.displaySizeOverride.height) || entry.displaySizeOverride.width <= 0 || entry.displaySizeOverride.height <= 0)) issues.push({ mapId, path: `objects.${entry.id}.displaySizeOverride`, message: "표시 크기는 양수여야 합니다." });
      if (entry.collision !== undefined && (!pixelRectShape(entry.collision) || entry.collision.width <= 0 || entry.collision.height <= 0)) issues.push({ mapId, path: `objects.${entry.id}.collision`, message: "collision은 top-left offset과 양수 크기를 가져야 합니다." });
      if (entry.interaction !== undefined && (!record(entry.interaction) || !["sleep", "open_shop", "sell"].includes(String(entry.interaction.action)) || !rectShape(entry.interaction.area) || !rectValid(entry.interaction.area, map))) issues.push({ mapId, path: `objects.${entry.id}.interaction`, message: "interaction 정의가 올바르지 않습니다." });
    });
    const spawnIds = new Set<string>();
    if (Array.isArray(raw.spawns) && raw.spawns.length === 0) issues.push({ mapId, path: "spawns", message: "테스트 플레이를 위해 spawn이 하나 이상 필요합니다." });
    if (Array.isArray(raw.spawns)) raw.spawns.forEach((entry, i) => {
      if (!record(entry) || !text(entry.id)) { issues.push({ mapId, path: `spawns[${i}]`, message: "spawn id가 필요합니다." }); return; }
      if (spawnIds.has(entry.id)) issues.push({ mapId, path: `spawns.${entry.id}`, message: "중복된 spawn id입니다." });
      spawnIds.add(entry.id);
      if (!number(entry.tileX) || !number(entry.tileY) || entry.tileX < 0 || entry.tileY < 0 || entry.tileX >= map.width || entry.tileY >= map.height || !facing(entry.facing)) issues.push({ mapId, path: `spawns.${entry.id}`, message: "spawn 위치 또는 방향이 올바르지 않습니다." });
    });
    const warpIds = new Set<string>();
    if (Array.isArray(raw.warps)) raw.warps.forEach((entry, i) => {
      if (!record(entry) || !text(entry.id)) { issues.push({ mapId, path: `warps[${i}]`, message: "warp id가 필요합니다." }); return; }
      if (warpIds.has(entry.id)) issues.push({ mapId, path: `warps.${entry.id}`, message: "중복된 warp id입니다." });
      warpIds.add(entry.id);
      if (!rectShape(entry.area) || !rectValid(entry.area, map)) issues.push({ mapId, path: `warps.${entry.id}.area`, message: "warp 영역이 올바르지 않습니다." });
      if (!text(entry.targetMapId) || !text(entry.targetSpawnId)) issues.push({ mapId, path: `warps.${entry.id}.target`, message: "warp 목적지가 필요합니다." });
    });
  }
  const typedMaps = maps.filter((map) => record(map) && text(map.id)) as unknown as MapDefinition[];
  for (const map of typedMaps) for (const warp of (Array.isArray(map.warps) ? map.warps : []).filter((entry) => record(entry))) {
    const target = typedMaps.find((entry) => entry.id === warp.targetMapId);
    if (!target) issues.push({ mapId: map.id, path: `warps.${warp.id}.targetMapId`, message: "목적지 맵이 존재하지 않습니다." });
    else if (!(Array.isArray(target.spawns) ? target.spawns : []).some((spawn) => record(spawn) && spawn.id === warp.targetSpawnId)) issues.push({ mapId: map.id, path: `warps.${warp.id}.targetSpawnId`, message: "목적지 spawn이 존재하지 않습니다." });
  }
  if (!mapIds.has("farm")) issues.push({ path: "maps", message: "핵심 farm 맵은 삭제할 수 없습니다." });
  return issues;
}

export const referencedSpawnCount = (document: MapEditorDocument, mapId: string, spawnId: string) =>
  document.maps.reduce((count, map) => count + map.warps.filter((warp) => warp.targetMapId === mapId && warp.targetSpawnId === spawnId).length, 0);
