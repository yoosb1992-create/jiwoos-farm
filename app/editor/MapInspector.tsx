"use client";

import { WORLD_OBJECT_ASSETS, type Facing, type WorldObjectAssetId } from "@/game/assets/definitions";
import type { MapDefinition, PixelRect, TileRect } from "@/game/maps/types";
import type { Selection } from "@/game/editor/types";

const directions: Facing[] = ["up", "down", "left", "right"];
const directionLabels: Record<Facing, string> = { up: "위", down: "아래", left: "왼쪽", right: "오른쪽" };
const actionLabels = { sleep: "잠자기", open_shop: "상점 열기", sell: "판매" } as const;
const numberValue = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return <label><span>{label}</span><input type="number" value={value} step={step} onChange={(event) => onChange(numberValue(event.target.value, value))} /></label>;
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function RectFields({ rect, onChange }: { rect: TileRect; onChange: (rect: TileRect) => void }) {
  return <div className="inspector-grid"><NumberField label="시작 X" value={rect.startX} onChange={(startX) => onChange({ ...rect, startX })} /><NumberField label="시작 Y" value={rect.startY} onChange={(startY) => onChange({ ...rect, startY })} /><NumberField label="끝 X" value={rect.endX} onChange={(endX) => onChange({ ...rect, endX })} /><NumberField label="끝 Y" value={rect.endY} onChange={(endY) => onChange({ ...rect, endY })} /></div>;
}
function PixelRectFields({ rect, onChange }: { rect: PixelRect; onChange: (rect: PixelRect) => void }) {
  return <div className="inspector-grid"><NumberField label="오프셋 X" value={rect.x} onChange={(x) => onChange({ ...rect, x })} /><NumberField label="오프셋 Y" value={rect.y} onChange={(y) => onChange({ ...rect, y })} /><NumberField label="너비" value={rect.width} onChange={(width) => onChange({ ...rect, width })} /><NumberField label="높이" value={rect.height} onChange={(height) => onChange({ ...rect, height })} /></div>;
}

export function MapInspector({ map, maps, selection, update, renameId, remove, spawnReferences, onClose }: {
  map: MapDefinition;
  maps: MapDefinition[];
  selection: Selection;
  update: (mutate: (map: MapDefinition) => void) => void;
  renameId: (kind: "object" | "spawn" | "warp", previous: string, next: string) => void;
  remove: () => void;
  spawnReferences: (spawnId: string) => number;
  onClose?: () => void;
}) {
  if (!selection) return <aside className="editor-inspector"><div className="panel-title"><span>속성</span><small>선택한 항목의 데이터</small></div><p className="empty-inspector">맵에서 오브젝트나 편집 레이어를 선택하세요.</p></aside>;
  const closeButton = <button className="inspector-close" onClick={onClose} aria-label="속성창 닫기">×</button>;
  const deleteButton = <button className="danger-button" onClick={remove}>선택 항목 삭제</button>;
  if (selection.kind === "object") {
    const object = map.objects.find((entry) => entry.id === selection.id);
    if (!object) return null;
    return <aside className="editor-inspector mobile-open">{closeButton}<div className="panel-title"><span>오브젝트</span><small>{object.id}</small></div><div className="inspector-form">
      <TextField label="식별자(ID)" value={object.id} onChange={(id) => renameId("object", object.id, id)} />
      <label><span>에셋 종류</span><select value={object.assetId} onChange={(event) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.assetId = event.target.value as WorldObjectAssetId; })}>{Object.keys(WORLD_OBJECT_ASSETS).map((id) => <option key={id}>{id}</option>)}</select></label>
      <div className="inspector-grid"><NumberField label="타일 X" step={.5} value={object.position.tileX} onChange={(tileX) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.position.tileX = tileX; })} /><NumberField label="타일 Y" step={.5} value={object.position.tileY} onChange={(tileY) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.position.tileY = tileY; })} /></div>
      <NumberField label="표시 우선순위" value={object.depth ?? 3} onChange={(depth) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.depth = depth; })} />
      <TextField label="표시 이름" value={object.label ?? ""} onChange={(label) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.label = label || undefined; })} />
      <details><summary>표시 크기 직접 지정</summary>{object.displaySizeOverride ? <div className="inspector-grid"><NumberField label="너비" value={object.displaySizeOverride.width} onChange={(width) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.displaySizeOverride!.width = width; })} /><NumberField label="높이" value={object.displaySizeOverride.height} onChange={(height) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.displaySizeOverride!.height = height; })} /><button onClick={() => update((target) => { delete target.objects.find((entry) => entry.id === object.id)!.displaySizeOverride; })}>직접 지정 제거</button></div> : <button onClick={() => update((target) => { target.objects.find((entry) => entry.id === object.id)!.displaySizeOverride = { width: 64, height: 64 }; })}>직접 지정 추가</button>}</details>
      <details open><summary>충돌 영역 · 좌상단 기준 오프셋</summary>{object.collision ? <><PixelRectFields rect={object.collision} onChange={(collision) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.collision = collision; })} /><button onClick={() => update((target) => { delete target.objects.find((entry) => entry.id === object.id)!.collision; })}>충돌 영역 제거</button></> : <button onClick={() => update((target) => { target.objects.find((entry) => entry.id === object.id)!.collision = { x: -16, y: -16, width: 32, height: 32 }; })}>충돌 영역 추가</button>}</details>
      <details><summary>상호작용</summary>{object.interaction ? <><label><span>동작</span><select value={object.interaction.action} onChange={(event) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.interaction!.action = event.target.value as "sleep" | "open_shop" | "sell"; })}><option value="sleep">{actionLabels.sleep}</option><option value="open_shop">{actionLabels.open_shop}</option><option value="sell">{actionLabels.sell}</option></select></label><RectFields rect={object.interaction.area} onChange={(area) => update((target) => { target.objects.find((entry) => entry.id === object.id)!.interaction!.area = area; })} /><button onClick={() => update((target) => { delete target.objects.find((entry) => entry.id === object.id)!.interaction; })}>상호작용 제거</button></> : <button onClick={() => update((target) => { target.objects.find((entry) => entry.id === object.id)!.interaction = { action: "sell", area: { startX: 0, endX: 1, startY: 0, endY: 1 } }; })}>상호작용 추가</button>}</details>
      {deleteButton}
    </div></aside>;
  }
  if (selection.kind === "spawn") {
    const spawn = map.spawns.find((entry) => entry.id === selection.id); if (!spawn) return null;
    const refs = spawnReferences(spawn.id);
    return <aside className="editor-inspector mobile-open">{closeButton}<div className="panel-title"><span>시작 위치</span><small>{refs ? `${refs}개 맵 이동 구역이 참조 중` : "참조 없음"}</small></div><div className="inspector-form">
      <TextField label="식별자(ID)" value={spawn.id} onChange={(id) => renameId("spawn", spawn.id, id)} />
      <div className="inspector-grid"><NumberField label="타일 X" step={.5} value={spawn.tileX} onChange={(tileX) => update((target) => { target.spawns.find((entry) => entry.id === spawn.id)!.tileX = tileX; })} /><NumberField label="타일 Y" step={.5} value={spawn.tileY} onChange={(tileY) => update((target) => { target.spawns.find((entry) => entry.id === spawn.id)!.tileY = tileY; })} /></div>
      <label><span>바라보는 방향</span><select value={spawn.facing} onChange={(event) => update((target) => { target.spawns.find((entry) => entry.id === spawn.id)!.facing = event.target.value as Facing; })}>{directions.map((direction) => <option key={direction} value={direction}>{directionLabels[direction]}</option>)}</select></label>
      {refs > 0 && <p className="inspector-warning">삭제하면 참조 중인 맵 이동 구역이 무효가 됩니다.</p>}{deleteButton}
    </div></aside>;
  }
  if (selection.kind === "warp") {
    const warp = map.warps.find((entry) => entry.id === selection.id); if (!warp) return null;
    const target = maps.find((entry) => entry.id === warp.targetMapId) ?? maps[0];
    return <aside className="editor-inspector mobile-open">{closeButton}<div className="panel-title"><span>맵 이동 구역</span><small>{warp.id}</small></div><div className="inspector-form">
      <TextField label="식별자(ID)" value={warp.id} onChange={(id) => renameId("warp", warp.id, id)} />
      <RectFields rect={warp.area} onChange={(area) => update((targetMap) => { targetMap.warps.find((entry) => entry.id === warp.id)!.area = area; })} />
      <label><span>목적지 맵</span><select value={warp.targetMapId} onChange={(event) => update((targetMap) => { const item = targetMap.warps.find((entry) => entry.id === warp.id)!; item.targetMapId = event.target.value; item.targetSpawnId = maps.find((entry) => entry.id === event.target.value)?.spawns[0]?.id ?? ""; })}>{maps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.id})</option>)}</select></label>
      <label><span>목적지 시작 위치</span><select value={warp.targetSpawnId} onChange={(event) => update((targetMap) => { targetMap.warps.find((entry) => entry.id === warp.id)!.targetSpawnId = event.target.value; })}>{target?.spawns.map((spawn) => <option key={spawn.id}>{spawn.id}</option>)}</select></label>
      {deleteButton}
    </div></aside>;
  }
  const rect = selection.kind === "collision" ? map.collisionRegions[selection.index] : map.farmAreas[selection.index];
  if (!rect) return null;
  return <aside className="editor-inspector mobile-open">{closeButton}<div className="panel-title"><span>{selection.kind === "collision" ? "충돌 영역" : "농사 영역"}</span><small>타일 단위 영역</small></div><div className="inspector-form"><RectFields rect={rect} onChange={(next) => update((target) => { (selection.kind === "collision" ? target.collisionRegions : target.farmAreas)[selection.index] = next; })} />{deleteButton}</div></aside>;
}
