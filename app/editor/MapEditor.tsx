"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORLD_OBJECT_ASSETS, type WorldObjectAssetId } from "@/game/assets/definitions";
import { cloneEditorDocument, createBuiltInEditorDocument, LocalMapEditorRepository, parseEditorDocument, touchEditorDocument } from "@/game/editor/document";
import { EditorHistory } from "@/game/editor/history";
import type { EditorLayer, EditorTool, MapEditorDocument, Selection, SnapMode, ValidationIssue } from "@/game/editor/types";
import { referencedSpawnCount, validateEditorDocument } from "@/game/editor/validation";
import { TILE_TYPE_DEFINITIONS } from "@/game/maps/definitions";
import type { MapDefinition, TileTypeId } from "@/game/maps/types";
import { EditorCanvas } from "./EditorCanvas";
import { MapInspector } from "./MapInspector";
import { CloudMapEditorRepository, type CloudEditorDraft } from "@/game/editor/cloud";
import { shouldAdoptCloudDraft } from "@/game/editor/sync";

const tools: { id: EditorTool; label: string; hint: string }[] = [
  { id: "select", label: "선택 / 이동", hint: "오브젝트를 선택하고 드래그" }, { id: "terrain", label: "지형 타일", hint: "드래그하여 연속 칠하기" },
  { id: "object", label: "오브젝트", hint: "클릭하여 배치" }, { id: "collision", label: "충돌 영역", hint: "드래그하여 충돌 영역 생성" },
  { id: "farm", label: "농사 영역", hint: "드래그하여 농사 영역 생성" }, { id: "spawn", label: "시작 위치", hint: "클릭하여 시작 위치 추가" },
  { id: "warp", label: "맵 이동 구역", hint: "드래그하여 맵 이동 구역 생성" },
];
const layerLabels: Record<EditorLayer, string> = { terrain: "지형", objects: "오브젝트", collision: "충돌 영역", farm: "농사 영역", spawn: "시작 위치", warp: "맵 이동", grid: "격자" };
const tileLabels: Record<TileTypeId, string> = { grass: "잔디", path: "길", water: "물", farm: "농경지", wood_floor: "나무 바닥", stone_floor: "돌 바닥" };
const objectLabels: Record<WorldObjectAssetId, string> = { house: "집", tree: "나무", sell_basket: "판매 바구니", store: "상점", bed: "침대", shop_counter: "상점 계산대" };
const initialLayers: Record<EditorLayer, boolean> = { terrain: true, objects: true, collision: false, farm: false, spawn: true, warp: true, grid: true };
const repository = new LocalMapEditorRepository();
const cloudRepository = new CloudMapEditorRepository();

export function MapEditor({ onPlay, onExit }: { onPlay: (document: MapEditorDocument, mapId: string) => void; onExit: () => void }) {
  const initialDraft = useRef<{ document: MapEditorDocument; fromLocal: boolean } | null>(null);
  if (!initialDraft.current) {
    const local = repository.load();
    initialDraft.current = { document: local ?? createBuiltInEditorDocument(), fromLocal: Boolean(local) };
  }
  const [document, setDocument] = useState<MapEditorDocument>(initialDraft.current.document);
  const hasLocalDraft = useRef(initialDraft.current.fromLocal);
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
  const [cloudStatus, setCloudStatus] = useState<"checking" | "ready" | "saving" | "offline" | "signed-out">("checking");
  const [cloudConflict, setCloudConflict] = useState<CloudEditorDraft | null>(null);
  const cloudRevision = useRef(0);
  const cloudSyncedAt = useRef(0);
  const importRef = useRef<HTMLInputElement>(null);
  const history = useRef(new EditorHistory<MapEditorDocument>(cloneEditorDocument, 75));
  const documentRef = useRef(document);
  documentRef.current = document;
  const map = document.maps.find((entry) => entry.id === mapId) ?? document.maps[0];

  useEffect(() => {
    if (cloudStatus === "checking" && !hasLocalDraft.current) return;
    const timer = window.setTimeout(() => { repository.save(document); hasLocalDraft.current = true; }, 450);
    return () => window.clearTimeout(timer);
  }, [cloudStatus, document]);

  useEffect(() => {
    const preserveLocal = () => { if (hasLocalDraft.current) repository.save(documentRef.current); };
    const visibility = () => { if (window.document.visibilityState === "hidden") preserveLocal(); };
    window.addEventListener("pagehide", preserveLocal);
    window.document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("pagehide", preserveLocal); window.document.removeEventListener("visibilitychange", visibility); };
  }, []);

  const replaceDocument = useCallback((next: MapEditorDocument) => { documentRef.current = next; hasLocalDraft.current = true; setDocument(next); }, []);

  useEffect(() => {
    let cancelled = false;
    cloudRepository.load().then((result) => {
      if (cancelled) return;
      if (result.status !== "ok") { setCloudStatus(result.status === "unauthorized" ? "signed-out" : "offline"); setNotice(result.message); return; }
      if (!result.draft) { cloudRevision.current = 0; setCloudStatus("ready"); return; }
      cloudRevision.current = result.draft.revision;
      cloudSyncedAt.current = result.draft.updatedAt;
      if (!hasLocalDraft.current) {
        const cloudDocument = cloneEditorDocument(result.draft.document);
        documentRef.current = cloudDocument; setDocument(cloudDocument); repository.save(cloudDocument); hasLocalDraft.current = true;
        setCloudStatus("ready"); setNotice("이 기기에 서버의 최신 편집 초안을 불러왔습니다."); return;
      }
      setCloudStatus("ready");
      if (shouldAdoptCloudDraft(true, documentRef.current.updatedAt, result.draft.updatedAt)) {
        setCloudConflict(result.draft);
        setNotice("다른 기기에 더 최신 편집 내용이 있습니다.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const saveCloud = useCallback(async (source = documentRef.current) => {
    if (validateEditorDocument(source).length) return;
    setCloudStatus("saving");
    const result = await cloudRepository.save(cloneEditorDocument(source), cloudRevision.current);
    if (result.status === "ok") {
      const syncedDocument = cloneEditorDocument(result.draft.document);
      cloudRevision.current = result.draft.revision; cloudSyncedAt.current = result.draft.updatedAt;
      documentRef.current = syncedDocument; setDocument(syncedDocument); repository.save(syncedDocument); hasLocalDraft.current = true;
      setCloudStatus("ready"); setNotice("로컬과 클라우드 초안을 동기화했습니다.");
    } else if (result.status === "conflict") {
      cloudRevision.current = result.draft.revision; setCloudConflict(result.draft); setCloudStatus("ready"); setNotice("다른 기기의 최신 초안을 확인해 주세요.");
    } else {
      setCloudStatus(result.status === "unauthorized" ? "signed-out" : "offline"); setNotice(result.message);
    }
  }, []);

  useEffect(() => {
    if (cloudStatus !== "ready" || cloudConflict || document.updatedAt <= cloudSyncedAt.current || validateEditorDocument(document).length) return;
    const timer = window.setTimeout(() => saveCloud(document), 2800);
    return () => window.clearTimeout(timer);
  }, [cloudConflict, cloudStatus, document, saveCloud]);
  const pushHistory = useCallback(() => history.current.push(documentRef.current), []);
  const mutateMap = useCallback((mutate: (map: MapDefinition) => void, recordHistory = true) => {
    if (recordHistory) pushHistory();
    const next = cloneEditorDocument(documentRef.current);
    const target = next.maps.find((entry) => entry.id === mapId);
    if (!target) return;
    mutate(target); replaceDocument(touchEditorDocument(next));
  }, [mapId, pushHistory, replaceDocument]);
  const undo = useCallback(() => { const next = history.current.undo(documentRef.current); if (next) { replaceDocument(touchEditorDocument(next)); setSelection(null); setNotice("실행 취소했습니다."); } }, [replaceDocument]);
  const redo = useCallback(() => { const next = history.current.redo(documentRef.current); if (next) { replaceDocument(touchEditorDocument(next)); setSelection(null); setNotice("다시 실행했습니다."); } }, [replaceDocument]);

  const removeSelection = useCallback(() => {
    if (!selection || !map) return;
    if (selection.kind === "spawn") {
      const refs = referencedSpawnCount(documentRef.current, map.id, selection.id);
      if (refs) { setNotice(`${selection.id} 시작 위치를 ${refs}개 맵 이동 구역이 참조 중입니다. 먼저 맵 이동 목적지를 변경하세요.`); return; }
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
    replaceDocument(touchEditorDocument(next)); setSelection({ kind, id: nextId });
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

  const validate = () => { const next = validateEditorDocument(documentRef.current); setIssues(next); setNotice(next.length ? `${next.length}개 검증 오류를 수정해 주세요.` : "검증을 통과했습니다."); return next; };
  const save = async () => {
    if (validate().length) return;
    repository.save(documentRef.current); setNotice("로컬 편집 작업을 저장했습니다.");
    if (cloudStatus !== "signed-out") await saveCloud(documentRef.current);
  };
  const load = () => { const loaded = repository.load(); if (!loaded) { setNotice("불러올 정상 편집 문서가 없습니다."); return; } pushHistory(); replaceDocument(loaded); setMapId(loaded.maps[0].id); setSelection(null); setIssues([]); setNotice("저장된 편집 문서를 불러왔습니다."); };
  const exportJson = async () => {
    if (validate().length) return;
    const file = new File([JSON.stringify(documentRef.current, null, 2)], "jiwoos-farm-map-editor-v1.json", { type: "application/json" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title: "지우네 농장 맵 편집 문서", files: [file] }); setNotice("JSON 파일을 공유했습니다."); return; }
      catch (error) { if ((error as DOMException).name === "AbortError") return; }
    }
    const url = URL.createObjectURL(file); const link = window.document.createElement("a");
    link.href = url; link.download = file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500); setNotice("JSON을 내보냈습니다.");
  };
  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseEditorDocument(JSON.parse(await file.text()));
      if (!parsed.document) { setIssues(parsed.issues); setNotice(`가져오기 거부: ${parsed.issues.length}개 오류가 있습니다.`); return; }
      pushHistory(); replaceDocument(touchEditorDocument(parsed.document)); setMapId(parsed.document.maps[0].id); setSelection(null); setIssues([]); setNotice("검증된 JSON 문서를 가져왔습니다.");
    } catch { setNotice("가져오기 거부: 올바른 JSON 파일이 아닙니다."); }
    if (importRef.current) importRef.current.value = "";
  };
  const reset = () => { const next = createBuiltInEditorDocument(); pushHistory(); replaceDocument(next); setMapId("farm"); setSelection(null); setIssues([]); setConfirmReset(false); setNotice("기본 내장 맵으로 초기화했습니다."); };
  const testPlay = () => { if (validate().length) return; repository.save(documentRef.current); onPlay(cloneEditorDocument(documentRef.current), map.id); };

  const createBlank = () => {
    pushHistory(); const next = cloneEditorDocument(documentRef.current); let id = "new_map", suffix = 2;
    while (next.maps.some((entry) => entry.id === id)) id = `new_map_${suffix++}`;
    next.maps.push({ id, name: "새 맵", width: 20, height: 14, baseTileType: "grass", terrainRegions: [], farmAreas: [], collisionRegions: [], objects: [], spawns: [{ id: "entry", tileX: 10, tileY: 7, facing: "down" }], warps: [], boundary: { enabled: true } });
    replaceDocument(touchEditorDocument(next)); setMapId(id); setSelection(null);
  };
  const duplicateMap = () => {
    if (!map) return; pushHistory(); const next = cloneEditorDocument(documentRef.current); let id = `${map.id}_copy`, suffix = 2;
    while (next.maps.some((entry) => entry.id === id)) id = `${map.id}_copy_${suffix++}`;
    const copy = structuredClone(map); copy.id = id; copy.name = `${map.name} 복사본`; copy.warps.forEach((warp) => { if (warp.targetMapId === map.id) warp.targetMapId = id; });
    next.maps.push(copy); replaceDocument(touchEditorDocument(next)); setMapId(id); setSelection(null);
  };
  const deleteMap = () => {
    if (!map || map.id === "farm") { setNotice("핵심 농장 맵은 삭제할 수 없습니다."); return; }
    const refs = document.maps.reduce((sum, entry) => sum + entry.warps.filter((warp) => warp.targetMapId === map.id).length, 0);
    if (refs) { setNotice(`${map.name}을 ${refs}개 맵 이동 구역이 참조 중이라 삭제할 수 없습니다.`); return; }
    pushHistory(); const next = cloneEditorDocument(documentRef.current); next.maps = next.maps.filter((entry) => entry.id !== map.id); replaceDocument(touchEditorDocument(next)); setMapId("farm"); setSelection(null);
  };

  const refreshCloud = async () => {
    setCloudStatus("checking");
    const result = await cloudRepository.load();
    if (result.status !== "ok") { setCloudStatus(result.status === "unauthorized" ? "signed-out" : "offline"); setNotice(result.message); return; }
    setCloudStatus("ready");
    if (!result.draft) { cloudRevision.current = 0; setNotice("아직 저장된 클라우드 초안이 없습니다."); return; }
    cloudRevision.current = result.draft.revision; cloudSyncedAt.current = result.draft.updatedAt; setCloudConflict(result.draft); setNotice("클라우드 초안을 확인했습니다.");
  };
  const useCloudDraft = () => {
    if (!cloudConflict) return;
    pushHistory(); replaceDocument(cloneEditorDocument(cloudConflict.document)); setMapId(cloudConflict.document.maps[0]?.id ?? "farm"); setSelection(null);
    cloudRevision.current = cloudConflict.revision; cloudSyncedAt.current = cloudConflict.updatedAt; repository.save(cloudConflict.document); setCloudConflict(null); setNotice("서버의 최신 초안을 불러왔습니다.");
  };
  const keepLocalDraft = () => {
    if (!cloudConflict) return;
    cloudRevision.current = cloudConflict.revision; cloudSyncedAt.current = 0; setCloudConflict(null); setNotice("현재 로컬 내용을 유지하고 클라우드에 반영합니다."); void saveCloud(documentRef.current);
  };

  const selectTool = (nextTool: EditorTool) => {
    setTool(nextTool); setSelection(null);
    if (["collision", "farm", "spawn", "warp"].includes(nextTool)) setLayers((current) => ({ ...current, [nextTool]: true }));
  };

  const mapIssues = useMemo(() => issues.filter((issue) => !issue.mapId || issue.mapId === map?.id), [issues, map?.id]);
  const cloudLabel = cloudStatus === "checking" ? "클라우드 확인 중" : cloudStatus === "saving" ? "클라우드 저장 중" : cloudStatus === "ready" ? "클라우드 연결됨" : cloudStatus === "signed-out" ? "클라우드 로그인 필요" : "오프라인 · 로컬 보관";
  if (!map) return null;
  return <main className="editor-shell">
    <header className="editor-header"><div><b>지우네 농장 · 맵 편집기 0.4</b><span>맵 편집 문서 v1 · {cloudLabel}</span></div><nav><button onClick={onExit}>플레이</button><button className="primary" onClick={testPlay}>▶ 테스트 플레이</button></nav></header>
    <section className="editor-actions"><button onClick={undo} disabled={!history.current.canUndo}>↶ 실행 취소</button><button onClick={redo} disabled={!history.current.canRedo}>↷ 다시 실행</button><i /><button onClick={() => void save()}>저장</button><button onClick={load}>로컬 불러오기</button><button onClick={() => void refreshCloud()}>클라우드 불러오기</button>{cloudStatus === "signed-out" && <a className="editor-signin" href="/editor-login" target="_top">클라우드 로그인</a>}<button onClick={() => void exportJson()}>JSON 내보내기 / 공유</button><button onClick={() => importRef.current?.click()}>JSON 가져오기</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => importJson(event.target.files?.[0])} /><button className="danger-text" onClick={() => setConfirmReset(true)}>기본값 초기화</button></section>
    <section className="mobile-editor-top"><button onClick={onExit}>플레이</button><select value={map.id} onChange={(event) => { setMapId(event.target.value); setSelection(null); }}>{document.maps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><button onClick={() => void save()}>저장</button><button className="primary" onClick={testPlay}>테스트</button></section>
    <div className="editor-workspace">
      <aside className="editor-sidebar">
        <div className="panel-title"><span>맵</span><small>{document.maps.length}개</small></div>
        <select className="map-select" value={map.id} onChange={(event) => { setMapId(event.target.value); setSelection(null); }}>{document.maps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.id}</option>)}</select>
        <label className="map-name-field"><span>맵 이름</span><input value={map.name} onChange={(event) => mutateMap((target) => { target.name = event.target.value; })} /></label>
        <div className="compact-buttons"><button onClick={createBlank}>빈 맵</button><button onClick={duplicateMap}>복제</button><button onClick={deleteMap} disabled={map.id === "farm"}>삭제</button></div>
        <div className="panel-title"><span>도구</span><small>{tools.find((entry) => entry.id === tool)?.hint}</small></div>
        <div className="tool-list">{tools.map((entry) => <button key={entry.id} className={tool === entry.id ? "active" : ""} onClick={() => selectTool(entry.id)}>{entry.label}</button>)}</div>
        {tool === "terrain" && <div className="palette">{Object.keys(TILE_TYPE_DEFINITIONS).map((id) => <button key={id} className={terrain === id ? "active" : ""} onClick={() => setTerrain(id as TileTypeId)}>{tileLabels[id as TileTypeId]}</button>)}</div>}
        {tool === "object" && <div className="palette">{Object.keys(WORLD_OBJECT_ASSETS).map((id) => <button key={id} className={objectAssetId === id ? "active" : ""} onClick={() => setObjectAssetId(id as WorldObjectAssetId)}>{objectLabels[id as WorldObjectAssetId]}</button>)}</div>}
        <label className="map-name-field"><span>맞춤 단위</span><select value={snapMode} onChange={(event) => setSnapMode(event.target.value as SnapMode)}><option value="tile">1타일</option><option value="half">0.5타일</option><option value="free">자유</option></select></label>
        <div className="panel-title"><span>레이어</span><small>표시 / 숨김</small></div>
        <div className="layer-list">{(Object.keys(layerLabels) as EditorLayer[]).map((id) => <label key={id}><input type="checkbox" checked={layers[id]} onChange={() => setLayers((current) => ({ ...current, [id]: !current[id] }))} />{layerLabels[id]}</label>)}</div>
      </aside>
      <section className="editor-center"><EditorCanvas map={map} tool={tool} terrain={terrain} objectAssetId={objectAssetId} layers={layers} snapMode={snapMode} selection={selection} onSelect={setSelection} onCommit={(mutate) => mutateMap(mutate)} onBeginContinuous={pushHistory} onContinuous={(mutate) => mutateMap(mutate, false)} /><footer className="editor-status"><span>{notice}</span><b>{mapIssues.length ? `${mapIssues.length}개 오류` : "준비됨"}</b></footer>{mapIssues.length > 0 && <div className="validation-panel">{mapIssues.slice(0, 8).map((issue, index) => <p key={`${issue.path}-${index}`}><b>{issue.mapId ?? "문서"}.{issue.path}</b> {issue.message}</p>)}</div>}</section>
      <MapInspector map={map} maps={document.maps} selection={selection} update={(mutate) => mutateMap(mutate)} renameId={renameSelectedId} remove={removeSelection} spawnReferences={(spawnId) => referencedSpawnCount(document, map.id, spawnId)} onClose={() => setSelection(null)} />
    </div>
    <section className="mobile-tool-dock">
      <div className="mobile-tools">{tools.map((entry) => <button key={entry.id} className={tool === entry.id ? "active" : ""} onClick={() => selectTool(entry.id)}>{entry.label.replace(" / 이동", "")}</button>)}</div>
      <div className="mobile-edit-actions"><button onClick={undo} disabled={!history.current.canUndo}>↶ 실행 취소</button><button onClick={redo} disabled={!history.current.canRedo}>↷ 다시 실행</button><button onClick={removeSelection} disabled={!selection}>삭제</button><details><summary>옵션</summary><div>
        {tool === "terrain" && <div className="palette">{Object.keys(TILE_TYPE_DEFINITIONS).map((id) => <button key={id} className={terrain === id ? "active" : ""} onClick={() => setTerrain(id as TileTypeId)}>{tileLabels[id as TileTypeId]}</button>)}</div>}
        {tool === "object" && <div className="palette">{Object.keys(WORLD_OBJECT_ASSETS).map((id) => <button key={id} className={objectAssetId === id ? "active" : ""} onClick={() => setObjectAssetId(id as WorldObjectAssetId)}>{objectLabels[id as WorldObjectAssetId]}</button>)}</div>}
        <label>맞춤 단위 <select value={snapMode} onChange={(event) => setSnapMode(event.target.value as SnapMode)}><option value="tile">1타일</option><option value="half">0.5타일</option><option value="free">자유</option></select></label>
        <div className="layer-list">{(Object.keys(layerLabels) as EditorLayer[]).map((id) => <label key={id}><input type="checkbox" checked={layers[id]} onChange={() => setLayers((current) => ({ ...current, [id]: !current[id] }))} />{layerLabels[id]}</label>)}</div>
        <button onClick={() => importRef.current?.click()}>JSON 가져오기</button><button onClick={() => void exportJson()}>JSON 공유</button><button onClick={() => void refreshCloud()}>클라우드 불러오기</button>{cloudStatus === "signed-out" && <a className="editor-signin" href="/editor-login" target="_top">클라우드 로그인</a>}
      </div></details></div>
    </section>
    {confirmReset && <div className="editor-modal" role="dialog" aria-modal="true"><div><b>기본 맵으로 초기화할까요?</b><p>현재 편집 문서는 내장 맵 데이터로 교체됩니다. 필요하면 먼저 JSON으로 내보내세요.</p><nav><button className="danger-button" onClick={reset}>초기화</button><button onClick={() => setConfirmReset(false)}>취소</button></nav></div></div>}
    {cloudConflict && <div className="editor-modal" role="dialog" aria-modal="true"><div><b>다른 기기에 더 최신 편집 내용이 있습니다.</b><p>서버 초안: {new Date(cloudConflict.updatedAt).toLocaleString("ko-KR")} · 버전 {cloudConflict.revision}</p><nav><button className="primary" onClick={useCloudDraft}>서버 버전 불러오기</button><button onClick={keepLocalDraft}>현재 로컬 유지</button></nav></div></div>}
  </main>;
}
