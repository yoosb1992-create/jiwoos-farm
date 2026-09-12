"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORLD_OBJECT_ASSETS, type WorldObjectAssetId } from "@/game/assets/definitions";
import { cloneEditorDocument, createBuiltInEditorDocument, LocalMapEditorRepository, parseEditorDocument } from "@/game/editor/document";
import { EditorHistory } from "@/game/editor/history";
import type { EditorLayer, EditorTool, MapEditorDocument, Selection, SnapMode, ValidationIssue } from "@/game/editor/types";
import { referencedSpawnCount, validateEditorDocument } from "@/game/editor/validation";
import { TILE_TYPE_DEFINITIONS } from "@/game/maps/definitions";
import type { MapDefinition, TileTypeId } from "@/game/maps/types";
import { EditorCanvas } from "./EditorCanvas";
import { MapInspector } from "./MapInspector";

const tools: { id: EditorTool; label: string; hint: string }[] = [
  { id: "select", label: "선택 / 이동", hint: "오브젝트를 선택하고 드래그" }, { id: "terrain", label: "지형 타일", hint: "드래그하여 연속 칠하기" },
  { id: "object", label: "오브젝트", hint: "클릭하여 배치" }, { id: "collision", label: "Collision", hint: "드래그하여 영역 생성" },
  { id: "farm", label: "Farm area", hint: "드래그하여 농사 영역 생성" }, { id: "spawn", label: "Spawn", hint: "클릭하여 spawn 추가" },
  { id: "warp", label: "Warp", hint: "드래그하여 warp 생성" },
];
const layerLabels: Record<EditorLayer, string> = { terrain: "Terrain", objects: "Objects", collision: "Collision", farm: "Farm area", spawn: "Spawn", warp: "Warp", grid: "Grid" };
const initialLayers: Record<EditorLayer, boolean> = { terrain: true, objects: true, collision: false, farm: false, spawn: true, warp: true, grid: true };
const repository = new LocalMapEditorRepository();

export function MapEditor({ onPlay, onExit }: { onPlay: (document: MapEditorDocument, mapId: string) => void; onExit: () => void }) {
  const [document, setDocument] = useState<MapEditorDocument>(() => repository.load() ?? createBuiltInEditorDocument());
  const [mapId, setMapId] = useState(() => document.maps[0]?.id ?? "farm");
  const [tool, setTool] = useState<EditorTool>("select");
  const [terrain, setTerrain] = useState<TileTypeId>("path");
  const [objectAssetId, setObjectAssetId] = useState<WorldObjectAssetId>("tree");
  const [snapMode, setSnapMode] = useState<SnapMode>("tile");
  const [layers, setLayers] = useState(initialLayers);
  const [selection, setSelection] = useState<Selection>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [notice, setNotice] = useState("편집 문서는 게임 저장과 별도로 자동 보관됩니다.");
  const [confirmReset, setConfirmReset] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const history = useRef(new EditorHistory<MapEditorDocument>(cloneEditorDocument, 75));
  const documentRef = useRef(document);
  documentRef.current = document;
  const map = document.maps.find((entry) => entry.id === mapId) ?? document.maps[0];

  useEffect(() => {
    const timer = window.setTimeout(() => repository.save(document), 450);
    return () => window.clearTimeout(timer);
  }, [document]);

  const replaceDocument = useCallback((next: MapEditorDocument) => { documentRef.current = next; setDocument(next); }, []);
  const pushHistory = useCallback(() => history.current.push(documentRef.current), []);
  const mutateMap = useCallback((mutate: (map: MapDefinition) => void, recordHistory = true) => {
    if (recordHistory) pushHistory();
    const next = cloneEditorDocument(documentRef.current);
    const target = next.maps.find((entry) => entry.id === mapId);
    if (!target) return;
    mutate(target); next.updatedAt = Date.now(); replaceDocument(next);
  }, [mapId, pushHistory, replaceDocument]);
  const undo = useCallback(() => { const next = history.current.undo(documentRef.current); if (next) { replaceDocument(next); setSelection(null); setNotice("실행 취소했습니다."); } }, [replaceDocument]);
  const redo = useCallback(() => { const next = history.current.redo(documentRef.current); if (next) { replaceDocument(next); setSelection(null); setNotice("다시 실행했습니다."); } }, [replaceDocument]);

  const removeSelection = useCallback(() => {
    if (!selection || !map) return;
    if (selection.kind === "spawn") {
      const refs = referencedSpawnCount(documentRef.current, map.id, selection.id);
      if (refs) { setNotice(`${selection.id} spawn을 ${refs}개 warp가 참조 중입니다. 먼저 warp 목적지를 변경하세요.`); return; }
    }
    mutateMap((target) => {
      if (selection.kind === "object") target.objects = target.objects.filter((entry) => entry.id !== selection.id);
      else if (selection.kind === "spawn") target.spawns = target.spawns.filter((entry) => entry.id !== selection.id);
      else if (selection.kind === "warp") target.warps = target.warps.filter((entry) => entry.id !== selection.id);
      else if (selection.kind === "collision") target.collisionRegions.splice(selection.index, 1);
      else target.farmAreas.splice(selection.index, 1);
    });
    setSelection(null); setNotice("선택 항목을 삭제했습니다.");
  }, [map, mutateMap, selection]);
  const renameSelectedId = (kind: "object" | "spawn" | "warp", previous: string, nextId: string) => {
    pushHistory();
    const next = cloneEditorDocument(documentRef.current);
    const target = next.maps.find((entry) => entry.id === mapId);
    if (!target) return;
    if (kind === "object") target.objects.find((entry) => entry.id === previous)!.id = nextId;
    if (kind === "warp") target.warps.find((entry) => entry.id === previous)!.id = nextId;
    if (kind === "spawn") {
      target.spawns.find((entry) => entry.id === previous)!.id = nextId;
      for (const entry of next.maps) for (const warp of entry.warps) if (warp.targetMapId === target.id && warp.targetSpawnId === previous) warp.targetSpawnId = nextId;
    }
    replaceDocument(next); setSelection({ kind, id: nextId });
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const editing = ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if (!editing && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); removeSelection(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [redo, removeSelection, undo]);

  const validate = () => { const next = validateEditorDocument(documentRef.current); setIssues(next); setNotice(next.length ? `${next.length}개 validation 오류를 수정해 주세요.` : "Validation을 통과했습니다."); return next; };
  const save = () => { if (validate().length) return; repository.save(documentRef.current); setNotice("편집 작업을 저장했습니다."); };
  const load = () => { const loaded = repository.load(); if (!loaded) { setNotice("불러올 정상 편집 문서가 없습니다."); return; } pushHistory(); replaceDocument(loaded); setMapId(loaded.maps[0].id); setSelection(null); setIssues([]); setNotice("저장된 편집 문서를 불러왔습니다."); };
  const exportJson = () => {
    if (validate().length) return;
    const blob = new Blob([JSON.stringify(documentRef.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = window.document.createElement("a");
    link.href = url; link.download = "jiwoos-farm-map-editor-v1.json"; link.click(); URL.revokeObjectURL(url); setNotice("JSON을 내보냈습니다.");
  };
  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseEditorDocument(JSON.parse(await file.text()));
      if (!parsed.document) { setIssues(parsed.issues); setNotice(`Import 거부: ${parsed.issues.length}개 오류가 있습니다.`); return; }
      pushHistory(); replaceDocument(parsed.document); setMapId(parsed.document.maps[0].id); setSelection(null); setIssues([]); setNotice("검증된 JSON 문서를 가져왔습니다.");
    } catch { setNotice("Import 거부: 올바른 JSON 파일이 아닙니다."); }
    if (importRef.current) importRef.current.value = "";
  };
  const reset = () => { const next = createBuiltInEditorDocument(); pushHistory(); replaceDocument(next); setMapId("farm"); setSelection(null); setIssues([]); setConfirmReset(false); setNotice("기본 내장 맵으로 초기화했습니다."); };
  const testPlay = () => { if (validate().length) return; repository.save(documentRef.current); onPlay(cloneEditorDocument(documentRef.current), map.id); };

  const createBlank = () => {
    pushHistory(); const next = cloneEditorDocument(documentRef.current); let id = "new_map", suffix = 2;
    while (next.maps.some((entry) => entry.id === id)) id = `new_map_${suffix++}`;
    next.maps.push({ id, name: "새 맵", width: 20, height: 14, baseTileType: "grass", terrainRegions: [], farmAreas: [], collisionRegions: [], objects: [], spawns: [{ id: "entry", tileX: 10, tileY: 7, facing: "down" }], warps: [], boundary: { enabled: true } });
    replaceDocument(next); setMapId(id); setSelection(null);
  };
  const duplicateMap = () => {
    if (!map) return; pushHistory(); const next = cloneEditorDocument(documentRef.current); let id = `${map.id}_copy`, suffix = 2;
    while (next.maps.some((entry) => entry.id === id)) id = `${map.id}_copy_${suffix++}`;
    const copy = structuredClone(map); copy.id = id; copy.name = `${map.name} 복사본`; copy.warps.forEach((warp) => { if (warp.targetMapId === map.id) warp.targetMapId = id; });
    next.maps.push(copy); replaceDocument(next); setMapId(id); setSelection(null);
  };
  const deleteMap = () => {
    if (!map || map.id === "farm") { setNotice("핵심 farm 맵은 삭제할 수 없습니다."); return; }
    const refs = document.maps.reduce((sum, entry) => sum + entry.warps.filter((warp) => warp.targetMapId === map.id).length, 0);
    if (refs) { setNotice(`${map.name}을 ${refs}개 warp가 참조 중이라 삭제할 수 없습니다.`); return; }
    pushHistory(); const next = cloneEditorDocument(documentRef.current); next.maps = next.maps.filter((entry) => entry.id !== map.id); replaceDocument(next); setMapId("farm"); setSelection(null);
  };

  const mapIssues = useMemo(() => issues.filter((issue) => !issue.mapId || issue.mapId === map?.id), [issues, map?.id]);
  if (!map) return null;
  return <main className="editor-shell">
    <header className="editor-header"><div><b>지우네 농장 · 개발용 맵 편집기</b><span>Map Editor Document v1</span></div><nav><button onClick={onExit}>플레이</button><button className="primary" onClick={testPlay}>▶ 테스트 플레이</button></nav></header>
    <section className="editor-actions"><button onClick={undo} disabled={!history.current.canUndo}>↶ Undo</button><button onClick={redo} disabled={!history.current.canRedo}>↷ Redo</button><i /><button onClick={save}>저장</button><button onClick={load}>불러오기</button><button onClick={exportJson}>JSON Export</button><button onClick={() => importRef.current?.click()}>JSON Import</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => importJson(event.target.files?.[0])} /><button className="danger-text" onClick={() => setConfirmReset(true)}>기본값 초기화</button></section>
    <div className="editor-workspace">
      <aside className="editor-sidebar">
        <div className="panel-title"><span>Maps</span><small>{document.maps.length}개</small></div>
        <select className="map-select" value={map.id} onChange={(event) => { setMapId(event.target.value); setSelection(null); }}>{document.maps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.id}</option>)}</select>
        <label className="map-name-field"><span>맵 이름</span><input value={map.name} onChange={(event) => mutateMap((target) => { target.name = event.target.value; })} /></label>
        <div className="compact-buttons"><button onClick={createBlank}>빈 맵</button><button onClick={duplicateMap}>복제</button><button onClick={deleteMap} disabled={map.id === "farm"}>삭제</button></div>
        <div className="panel-title"><span>Tools</span><small>{tools.find((entry) => entry.id === tool)?.hint}</small></div>
        <div className="tool-list">{tools.map((entry) => <button key={entry.id} className={tool === entry.id ? "active" : ""} onClick={() => { setTool(entry.id); setSelection(null); if (["collision", "farm", "spawn", "warp"].includes(entry.id)) setLayers((current) => ({ ...current, [entry.id]: true })); }}>{entry.label}</button>)}</div>
        {tool === "terrain" && <div className="palette">{Object.keys(TILE_TYPE_DEFINITIONS).map((id) => <button key={id} className={terrain === id ? "active" : ""} onClick={() => setTerrain(id as TileTypeId)}>{id}</button>)}</div>}
        {tool === "object" && <div className="palette">{Object.keys(WORLD_OBJECT_ASSETS).map((id) => <button key={id} className={objectAssetId === id ? "active" : ""} onClick={() => setObjectAssetId(id as WorldObjectAssetId)}>{id}</button>)}</div>}
        <label className="map-name-field"><span>Snap</span><select value={snapMode} onChange={(event) => setSnapMode(event.target.value as SnapMode)}><option value="tile">1 tile</option><option value="half">0.5 tile</option><option value="free">free</option></select></label>
        <div className="panel-title"><span>Layers</span><small>표시 / 숨김</small></div>
        <div className="layer-list">{(Object.keys(layerLabels) as EditorLayer[]).map((id) => <label key={id}><input type="checkbox" checked={layers[id]} onChange={() => setLayers((current) => ({ ...current, [id]: !current[id] }))} />{layerLabels[id]}</label>)}</div>
      </aside>
      <section className="editor-center"><EditorCanvas map={map} tool={tool} terrain={terrain} objectAssetId={objectAssetId} layers={layers} snapMode={snapMode} selection={selection} onSelect={setSelection} onCommit={(mutate) => mutateMap(mutate)} onBeginContinuous={pushHistory} onContinuous={(mutate) => mutateMap(mutate, false)} /><footer className="editor-status"><span>{notice}</span><b>{mapIssues.length ? `${mapIssues.length} errors` : "Ready"}</b></footer>{mapIssues.length > 0 && <div className="validation-panel">{mapIssues.slice(0, 8).map((issue, index) => <p key={`${issue.path}-${index}`}><b>{issue.mapId ?? "document"}.{issue.path}</b> {issue.message}</p>)}</div>}</section>
      <MapInspector map={map} maps={document.maps} selection={selection} update={(mutate) => mutateMap(mutate)} renameId={renameSelectedId} remove={removeSelection} spawnReferences={(spawnId) => referencedSpawnCount(document, map.id, spawnId)} />
    </div>
    {confirmReset && <div className="editor-modal" role="dialog" aria-modal="true"><div><b>기본 맵으로 초기화할까요?</b><p>현재 편집 문서는 내장 맵 데이터로 교체됩니다. 필요하면 먼저 JSON Export 하세요.</p><nav><button className="danger-button" onClick={reset}>초기화</button><button onClick={() => setConfirmReset(false)}>취소</button></nav></div></div>}
  </main>;
}
