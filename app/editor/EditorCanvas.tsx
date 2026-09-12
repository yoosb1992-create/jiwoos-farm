"use client";

import { useRef, useState } from "react";
import { displayedSize, WORLD_OBJECT_ASSETS, type WorldObjectAssetId } from "@/game/assets/definitions";
import { GAME_CONFIG } from "@/game/config";
import { TILE_TYPE_DEFINITIONS } from "@/game/maps/definitions";
import type { MapDefinition, TileRect, TileTypeId } from "@/game/maps/types";
import type { EditorLayer, EditorTool, Selection, SnapMode } from "@/game/editor/types";

const tileColors: Record<TileTypeId, string> = {
  grass: "#83b85e", path: "#c9aa71", water: "#66a8ca", farm: "#9b7049", wood_floor: "#b77b4c", stone_floor: "#c8bd9f",
};
const objectColors: Record<string, string> = { house: "#d18b54", tree: "#3f7e4a", sell_basket: "#ad6545", store: "#d5a65c", bed: "#efd99d", shop_counter: "#9c6543" };
const snap = (value: number, mode: SnapMode) => mode === "tile" ? Math.round(value) : mode === "half" ? Math.round(value * 2) / 2 : Math.round(value * 20) / 20;
const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }): TileRect => ({
  startX: Math.floor(Math.min(a.x, b.x)), endX: Math.floor(Math.max(a.x, b.x)),
  startY: Math.floor(Math.min(a.y, b.y)), endY: Math.floor(Math.max(a.y, b.y)),
});

interface Props {
  map: MapDefinition;
  tool: EditorTool;
  terrain: TileTypeId;
  objectAssetId: WorldObjectAssetId;
  layers: Record<EditorLayer, boolean>;
  snapMode: SnapMode;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCommit: (mutate: (map: MapDefinition) => void) => void;
  onBeginContinuous: () => void;
  onContinuous: (mutate: (map: MapDefinition) => void) => void;
}

export function EditorCanvas({ map, tool, terrain, objectAssetId, layers, snapMode, selection, onSelect, onCommit, onBeginContinuous, onContinuous }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragObject = useRef<string | null>(null);
  const painting = useRef(false);
  const [draft, setDraft] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const point = (event: React.PointerEvent) => {
    const box = svgRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(map.width - 0.001, (event.clientX - box.left) / box.width * map.width)), y: Math.max(0, Math.min(map.height - 0.001, (event.clientY - box.top) / box.height * map.height)) };
  };
  const paint = (p: { x: number; y: number }) => {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    onContinuous((target) => {
      const previous = target.terrainRegions.at(-1);
      if (previous?.startX === x && previous.startY === y && previous.endX === x && previous.endY === y && previous.tileType === terrain) return;
      target.terrainRegions = target.terrainRegions.filter((entry) => !(entry.startX === x && entry.endX === x && entry.startY === y && entry.endY === y));
      target.terrainRegions.push({ startX: x, endX: x, startY: y, endY: y, tileType: terrain });
    });
  };
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-editor-item]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    if (tool === "terrain") { painting.current = true; onBeginContinuous(); paint(p); return; }
    if (tool === "object") {
      onCommit((target) => {
        const base = objectAssetId.replace(/[^a-z0-9_]/gi, "_");
        let id = base, suffix = 2;
        while (target.objects.some((entry) => entry.id === id)) id = `${base}_${suffix++}`;
        target.objects.push({ id, assetId: objectAssetId, position: { tileX: snap(p.x, snapMode), tileY: snap(p.y, snapMode) }, depth: 3 });
      });
      return;
    }
    if (tool === "spawn") {
      onCommit((target) => {
        let id = "spawn", suffix = 2;
        while (target.spawns.some((entry) => entry.id === id)) id = `spawn_${suffix++}`;
        target.spawns.push({ id, tileX: snap(p.x, snapMode), tileY: snap(p.y, snapMode), facing: "down" });
      });
      return;
    }
    if (tool === "collision" || tool === "farm" || tool === "warp") setDraft({ start: p, end: p });
    else onSelect(null);
  };
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const p = point(event);
    if (painting.current) paint(p);
    if (draft) setDraft({ ...draft, end: p });
    if (dragObject.current) onContinuous((target) => {
      const object = target.objects.find((entry) => entry.id === dragObject.current);
      if (object) object.position = { tileX: snap(p.x, snapMode), tileY: snap(p.y, snapMode) };
    });
  };
  const pointerUp = () => {
    painting.current = false;
    dragObject.current = null;
    if (!draft) return;
    const rect = normalizeRect(draft.start, draft.end);
    onCommit((target) => {
      if (tool === "collision") target.collisionRegions.push(rect);
      if (tool === "farm") target.farmAreas.push(rect);
      if (tool === "warp") {
        const destination = target.spawns[0];
        let id = "warp", suffix = 2;
        while (target.warps.some((entry) => entry.id === id)) id = `warp_${suffix++}`;
        target.warps.push({ id, area: rect, targetMapId: target.id, targetSpawnId: destination?.id ?? "spawn" });
      }
    });
    setDraft(null);
  };
  const startObjectDrag = (event: React.PointerEvent, id: string) => {
    event.stopPropagation(); onSelect({ kind: "object", id });
    if (tool !== "select") return;
    dragObject.current = id; onBeginContinuous();
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const draftRect = draft ? normalizeRect(draft.start, draft.end) : null;

  return <div className="editor-stage-scroll"><svg ref={svgRef} className="editor-stage" style={{ aspectRatio: `${map.width}/${map.height}` }} viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    <rect width={map.width} height={map.height} fill={tileColors[map.baseTileType]} />
    {layers.terrain && map.terrainRegions.map((region, index) => <rect key={`terrain-${index}`} x={region.startX} y={region.startY} width={region.endX - region.startX + 1} height={region.endY - region.startY + 1} fill={tileColors[region.tileType]} />)}
    {layers.farm && map.farmAreas.map((region, index) => <rect data-editor-item key={`farm-${index}`} x={region.startX + .06} y={region.startY + .06} width={region.endX - region.startX + .88} height={region.endY - region.startY + .88} fill="#d98c4855" stroke="#f0b25d" strokeWidth=".09" onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: "farm", index }); }} />)}
    {layers.objects && map.objects.map((object) => {
      const asset = WORLD_OBJECT_ASSETS[object.assetId];
      const size = object.displaySizeOverride ?? displayedSize(asset);
      const width = size.width / GAME_CONFIG.tileSize, height = size.height / GAME_CONFIG.tileSize;
      return <g data-editor-item key={object.id} transform={`translate(${object.position.tileX} ${object.position.tileY})`} onPointerDown={(event) => startObjectDrag(event, object.id)}>
        <rect x={-width * asset.origin.x} y={-height * asset.origin.y} width={width} height={height} rx=".14" fill={objectColors[object.assetId] ?? "#8d765c"} stroke={selection?.kind === "object" && selection.id === object.id ? "#fff36a" : "#533928"} strokeWidth={selection?.kind === "object" && selection.id === object.id ? ".15" : ".07"} />
        <text x="0" y=".08" textAnchor="middle" fontSize=".36" fill="#fff" fontWeight="700">{object.label ?? object.id}</text>
      </g>;
    })}
    {layers.collision && map.collisionRegions.map((region, index) => <rect data-editor-item key={`collision-${index}`} x={region.startX} y={region.startY} width={region.endX - region.startX + 1} height={region.endY - region.startY + 1} fill="#e84b4b45" stroke="#ff5d5d" strokeWidth=".11" onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: "collision", index }); }} />)}
    {layers.collision && map.objects.flatMap((object) => object.collision ? [<rect key={`object-collision-${object.id}`} x={object.position.tileX + object.collision.x / GAME_CONFIG.tileSize} y={object.position.tileY + object.collision.y / GAME_CONFIG.tileSize} width={object.collision.width / GAME_CONFIG.tileSize} height={object.collision.height / GAME_CONFIG.tileSize} fill="#ff336633" stroke="#ff6688" strokeWidth=".08" pointerEvents="none" />] : [])}
    {layers.warp && map.warps.map((warp) => <g data-editor-item key={warp.id} onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: "warp", id: warp.id }); }}><rect x={warp.area.startX} y={warp.area.startY} width={warp.area.endX - warp.area.startX + 1} height={warp.area.endY - warp.area.startY + 1} fill="#994cff55" stroke="#c78aff" strokeWidth=".11" /><text x={(warp.area.startX + warp.area.endX + 1) / 2} y={(warp.area.startY + warp.area.endY + 1) / 2} textAnchor="middle" fontSize=".4" fill="#fff">⇢ {warp.id}</text></g>)}
    {layers.spawn && map.spawns.map((spawn) => <g data-editor-item key={spawn.id} transform={`translate(${spawn.tileX} ${spawn.tileY})`} onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: "spawn", id: spawn.id }); }}><circle r=".34" fill="#32d6d0" stroke="#eaffff" strokeWidth=".08" /><text y="-.48" textAnchor="middle" fontSize=".36" fill="#fff">{spawn.id}</text><text y=".13" textAnchor="middle" fontSize=".35">{spawn.facing === "up" ? "↑" : spawn.facing === "down" ? "↓" : spawn.facing === "left" ? "←" : "→"}</text></g>)}
    {draftRect && <rect x={draftRect.startX} y={draftRect.startY} width={draftRect.endX - draftRect.startX + 1} height={draftRect.endY - draftRect.startY + 1} fill="#fff4" stroke="#fff" strokeWidth=".12" pointerEvents="none" />}
    {layers.grid && <g className="editor-grid" pointerEvents="none">{Array.from({ length: map.width + 1 }, (_, x) => <line key={`x${x}`} x1={x} y1={0} x2={x} y2={map.height} />)}{Array.from({ length: map.height + 1 }, (_, y) => <line key={`y${y}`} x1={0} y1={y} x2={map.width} y2={y} />)}</g>}
  </svg><span className="editor-scale-note">Grid {GAME_CONFIG.tileSize}px · {map.width}×{map.height}</span></div>;
}
