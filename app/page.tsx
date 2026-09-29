"use client";
import { CROP_DEFINITIONS, DEFAULT_CROP_ID } from "@/game/data/crops";
import { SEASON_NAMES } from "@/game/world/calendar";
import { WEATHER_DEFINITIONS } from "@/game/weather/definitions";
import { weatherFor } from "@/game/weather/system";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as Phaser from "phaser";
import { gameEvents, type HudState, initialHud, type ToolKey } from "@/game/events";
import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS } from "@/game/data/items";
import { GENERAL_STORE_LISTINGS } from "@/game/data/shop";
import { VillageJournal } from "./components/VillageJournal";
import { NpcQuests } from "./components/NpcQuests";
import { NpcDialogue } from "./components/NpcDialogue";
import { ItemIcon } from "./components/ItemIcon";
import { CraftingPanel } from "./components/CraftingPanel";
import { InventoryPanel } from "./components/InventoryPanel";
import { StoragePanel } from "./components/StoragePanel";
import { MachinePanel } from "./components/MachinePanel";
import { BuildingPanel } from "./components/BuildingPanel";
import { RanchPanel } from "./components/RanchPanel";
import { BUILDING_DEFINITIONS } from "@/game/buildings/definitions";
import { NpcRelationshipActions } from "./components/NpcRelationshipActions";
import { FamilyLobby } from "./family/FamilyLobby";
import { FamilyStatus } from "./family/FamilyStatus";
import type { FamilySession } from "@/game/family/types";
import { MapEditor } from "./editor/MapEditor";
import { documentToRegistry } from "@/game/editor/document";
import type { MapEditorDocument } from "@/game/editor/types";
import type { MapDefinition } from "@/game/maps/types";

const toolKeys: ToolKey[] = ["hoe", "seed", "water", "hand", "axe", "pickaxe", "fishing_rod"];
const tools = toolKeys.map((key) => {
  const item = ITEM_DEFINITIONS[key];
  return { key, ...item, visual: ITEM_ASSETS[item.assetId] };
});

function VirtualJoystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const update = useCallback((clientX: number, clientY: number) => {
    const box = baseRef.current?.getBoundingClientRect();
    if (!box) return;
    const radius = Math.max(1, Math.min(box.width, box.height) * .34);
    let x = clientX - (box.left + box.width / 2), y = clientY - (box.top + box.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > radius) { x = x / distance * radius; y = y / distance * radius; }
    setThumb({ x, y }); onMove(x / radius, y / radius);
  }, [onMove]);
  const release = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && activePointer.current !== pointerId) return;
    activePointer.current = null; setThumb({ x: 0, y: 0 }); onMove(0, 0);
  }, [onMove]);
  return <div ref={baseRef} className="virtual-joystick" aria-label="이동 조이스틱"
    onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); if (activePointer.current !== null) return; activePointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event.clientX, event.clientY); }}
    onPointerMove={(event) => { if (activePointer.current === event.pointerId) { event.preventDefault(); event.stopPropagation(); update(event.clientX, event.clientY); } }}
    onPointerUp={(event) => release(event.pointerId)} onPointerCancel={(event) => release(event.pointerId)} onLostPointerCapture={() => release()}>
    <span className="joystick-arrows">↖ ↑ ↗<br />← · →<br />↙ ↓ ↘</span><i style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }} />
  </div>;
}

function FarmGameView({ editorMaps, initialMapId, testMode = false, onOpenEditor, onHome, family }: { editorMaps?: Record<string, MapDefinition>; initialMapId?: string; testMode?: boolean; onOpenEditor: () => void; onHome: () => void; family?: FamilySession }) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [hud, setHud] = useState<HudState>(() => family ? { ...initialHud, weather: weatherFor(family.room.id, 1).id } : initialHud);
  const [showHelp, setShowHelp] = useState(true);
  const [questOpen, setQuestOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const update = (event: Event) => setHud((event as CustomEvent<HudState>).detail);
    gameEvents.addEventListener("hud", update);
    let cancelled = false;
    import("@/game/createGame").then(({ createGame }) => {
      if (!cancelled && !gameRef.current) gameRef.current = createGame("game-canvas", { maps: editorMaps, initialMapId, testMode, family });
    });
    return () => {
      cancelled = true;
      gameEvents.removeEventListener("hud", update);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [editorMaps, initialMapId, testMode, family]);

  const command = useCallback((type: string, value?: unknown) => {
    gameEvents.dispatchEvent(new CustomEvent("command", { detail: { type, value } }));
  }, []);

  const toggleHelp = () => {
    const next = !showHelp;
    setShowHelp(next);
    command("help", next ? "open" : "close");
  };

  return (
    <main className={`game-shell${family ? " family-playing" : ""}`}>
      <section className="game-frame" aria-label="지우네 농장 게임">
        <div id="game-canvas" className="game-canvas" />
        <div className="mode-switch">{!family && <button onClick={onOpenEditor}>{testMode ? "← 편집기로 돌아가기" : "🛠 맵 편집"}</button>}<button onClick={onHome}>{family ? "농장 나가기" : "처음으로"}</button>{testMode && <span>테스트 플레이 · 저장 비활성</span>}</div>
        {family && <FamilyStatus session={family} mapId={hud.mapId} />}
        <header className="top-hud">
          <div className="brand-plate"><span className="brand-leaf">✦</span><div><strong>지우네 농장</strong><small>우리 가족의 봄날</small></div></div>
          <div className="status-plate"><span>{WEATHER_DEFINITIONS[hud.weather].icon} {hud.mapName}</span><b>{hud.year}년차 · {SEASON_NAMES[hud.season]} {hud.day}일 · {WEATHER_DEFINITIONS[hud.weather].name}</b><strong>{hud.timeText}</strong><em>{hud.money.toLocaleString()} G <small>체력 {hud.stats.stamina} / {hud.stats.maxStamina}</small></em></div>
        </header>
        <aside className={`quest-card ${questOpen ? "expanded" : ""}`} onClick={() => setQuestOpen((open) => !open)}>
          <span className="quest-kicker">오늘 할 일 <i>▾</i></span><strong>{hud.objective}</strong>
          <div className="quest-details"><div className="growth-track"><i style={{ width: `${hud.progress}%` }} /></div><small>{hud.message}</small></div>
        </aside>
        <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="게임 메뉴">☰</button>
        <div className={`save-row ${mobileMenuOpen ? "open" : ""}`}><button onClick={() => { command("save"); setMobileMenuOpen(false); }}>{family ? "동기화" : "저장"}</button><button onClick={() => { command("load"); setMobileMenuOpen(false); }}>{family ? "새로고침" : "불러오기"}</button><button onClick={() => { command("inventory-open"); setMobileMenuOpen(false); }}>🎒 가방</button>{(hud.craftingItems?.wood_processor || hud.placing) && <button onClick={() => { command("place-mode"); setMobileMenuOpen(false); }}>{hud.placing ? "배치 취소" : `⚙ 배치 ×${hud.craftingItems?.wood_processor ?? 0}`}</button>}<button onClick={() => { command(hud.buildingMode ? "building-mode" : "building-open"); setMobileMenuOpen(false); }}>{hud.buildingMode ? "건설 취소" : "🏠 건설·확장"}</button><button onClick={()=>{command("village-open",true);setMobileMenuOpen(false);}}>주민·의뢰</button><button onClick={toggleHelp}>?</button></div>
        {showHelp && <div className="modal-shade"><div className="help-card"><button aria-label="도움말 닫기" onClick={toggleHelp}>×</button><b>농사와 마을 생활</b><p><kbd>WASD</kbd> / 방향키로 이동 · 가까운 밭을 클릭하거나 <kbd>Space</kbd>로 행동</p><p>괭이 → 씨앗 → 물 → 잠자기 → 다음 날 물 주기 순서로 키워 보세요.</p><p>집 안 침대에서 잠들고, 농장 남쪽 길을 따라 마을 상점에 갈 수 있어요. 주민 가까이에서 행동하면 대화합니다. 메뉴의 주민·의뢰에서 개인 기록을 확인하세요.</p></div></div>}
        {hud.villageOpen && <VillageJournal hud={hud} onClose={()=>command("village-open",false)} />}
        {hud.dialogue && <NpcDialogue dialogue={hud.dialogue} onNext={()=>command("dialogue-next")} onClose={()=>command("dialogue-close")}>{!hud.dialogue.eventId && <><NpcRelationshipActions items={hud.craftingItems??{}} eventOptions={hud.relationshipEvents??[]} busy={hud.npcBusy??false} onGift={itemId=>command("npc-gift",itemId)} onEvent={eventId=>command("relationship-event-start",eventId)} /><NpcQuests quests={(hud.quests??[]).filter(q=>q.giver===hud.dialogue!.npcId)} busy={hud.npcBusy} onAction={action=>command("quest-action",action)} /></>}</NpcDialogue>}
        {hud.sleepPrompt && <div className="modal-shade"><div className="sleep-card" role="dialog" aria-modal="true" aria-label="잠자기 확인"><span>🌙</span><b>{family ? "잠자기에 동의할까요? 접속한 가족 모두 동의하면 다음 날이 됩니다." : "오늘 하루를 마치고 잠드시겠습니까?"}</b><p>물을 준 작물은 잠든 사이 한 단계 자랍니다.</p><div><button onClick={() => command("sleep-confirm")}>확인</button><button onClick={() => command("sleep-cancel")}>취소</button></div></div></div>}
        {hud.shopOpen && <div className="modal-shade"><div className="sleep-card" role="dialog" aria-modal="true" aria-label="새봄 상점"><span>🌱</span><b>새봄 상점</b><p>농사에 필요한 씨앗을 준비했어요.</p>{GENERAL_STORE_LISTINGS.map((listing) => <div key={listing.id}><button onClick={() => command("shop-buy", listing.id)}>{listing.name} · {listing.price} G</button></div>)}<div><button onClick={() => command("shop-close")}>상점 나가기</button></div></div></div>}
        {hud.craftingOpen && <CraftingPanel items={hud.craftingItems ?? {}} progression={hud.toolProgression} notice={hud.toolNotice} busy={hud.craftingBusy ?? false} onCraft={id => command("craft", id)} onUpgrade={id => command("tool-upgrade", id)} onClose={() => command("craft-close")} />}
        {hud.toolNotice && !hud.craftingOpen && <div className="tool-toast" role="status">{hud.toolNotice}</div>}
        {hud.inventoryOpen && <InventoryPanel items={hud.craftingItems ?? {}} stats={hud.stats} onClose={() => command("inventory-close")} />}
        {hud.storageOpen && hud.storage && <StoragePanel containerId={hud.storageOpen} storage={hud.storage} items={hud.craftingItems ?? {}} busy={hud.storageBusy ?? false} notice={hud.message} onTransfer={(direction, itemId, quantity) => command("storage-transfer", { direction, itemId, quantity })} onClose={() => command("storage-close")} />}
        {hud.machineOpen && hud.placeables?.instances.find(p => p.id === hud.machineOpen) && <MachinePanel instance={hud.placeables.instances.find(p => p.id === hud.machineOpen)!} now={hud.worldTimeMinute ?? 0} items={hud.craftingItems ?? {}} busy={hud.machineBusy ?? false} notice={hud.message} onStart={() => command("machine-start")} onCollect={() => command("machine-collect")} onRemove={() => command("machine-remove")} onClose={() => command("machine-close")} />}
        {hud.buildingOpen && <BuildingPanel money={hud.money} items={hud.craftingItems ?? {}} progress={hud.farmProgress ?? { unlocked: [] }} counts={hud.buildings?.instances.reduce<Record<string, number>>((counts, b) => { counts[b.definitionId] = (counts[b.definitionId] ?? 0) + 1; return counts; }, {}) ?? {}} busy={hud.buildingBusy ?? false} notice={hud.message} onBuild={id => command("building-mode", id)} onExpand={() => command("farm-expand")} onClose={() => command("building-close")} />}
        {hud.ranchOpen && hud.ranchState && <RanchPanel homeBuildingId={hud.ranchOpen} ranch={hud.ranchState} daySerial={hud.daySerial ?? hud.day} money={hud.money} items={hud.craftingItems ?? {}} busy={hud.ranchBusy ?? false} notice={hud.message} onBuy={() => command("animal-buy")} onFeed={() => command("animal-feed")} onPet={id => command("animal-pet", id)} onCollect={id => command("animal-collect", id)} onClose={() => command("ranch-close")} />}
        {hud.buildingMode && <div className="place-hint" role="status">🏠 {BUILDING_DEFINITIONS[hud.buildingDefinitionId ?? "work_shed"].name}의 왼쪽 위 칸을 누르거나 행동 버튼으로 건설 · {hud.message}</div>}
        {hud.placing && <div className="place-hint" role="status">⚙ 가까운 빈 땅을 누르거나 행동 버튼으로 배치 · {hud.message}</div>}
        {hud.selectedTool === "fishing_rod" && !hud.placing && !hud.buildingMode && <div className="place-hint" role="status">🎣 {hud.fishingStage === "waiting" ? "기다리는 중… 입질이 오면 행동 버튼" : hud.fishingStage === "bite" ? "입질! 지금 행동 버튼으로 당기세요" : hud.fishingStage === "missed" ? "입질을 놓쳤어요. 행동 버튼으로 정리하세요" : "농장 연못 북쪽 물가에서 물을 향해 행동 버튼"}</div>}
        {hud.transitioning && <div className="night-fade"><span>하루를 마무리합니다…</span></div>}
        <div className="inventory-chip" aria-live="polite"><label>씨앗 <select aria-label="심을 씨앗 종류" value={hud.selectedCrop ?? DEFAULT_CROP_ID} onChange={e => command("seed-select", e.target.value)}>{Object.values(CROP_DEFINITIONS).map(c => <option key={c.id} value={c.id}>{c.name} · {hud.seedCounts?.[c.id] ?? (c.id === DEFAULT_CROP_ID ? hud.seeds : 0)}개</option>)}</select></label><span>수확물 <b>{hud.harvest}</b></span>{hud.mapId === "fairy_forest" && <span>나무 {hud.resources?.wood ?? 0} · 돌 {hud.resources?.stone ?? 0} · 들풀 {hud.resources?.wild_herb ?? 0} · 달빛버섯 {hud.resources?.moon_mushroom ?? 0} · 요정꽃 {hud.resources?.fairy_bloom ?? 0}</span>}</div>
        <nav className="quickbar" aria-label="도구 선택">
          {tools.map((tool, index) => {
            const locked = tool.key === "pickaxe" && !hud.toolProgression?.pickaxe;
            return <button key={tool.key} className={hud.selectedTool === tool.key ? "selected" : ""} disabled={locked} aria-label={locked ? "곡괭이 잠김 · 제작대에서 해금" : tool.name} onClick={() => command("tool", tool.key)} title={`${index + 1} · ${locked ? "제작대에서 해금" : tool.toolbarHint}`}><em>{index + 1}</em><ItemIcon asset={tool.visual} /><small>{locked ? "🔒 잠김" : tool.name}{tool.key === "axe" && hud.toolProgression?.axe === 2 ? " Lv2" : ""}</small></button>;
          })}
          <button className="sell-slot" onClick={() => command("sell")} disabled={!hud.marketCount}><span>🧺</span><small>전부 판매</small></button>
        </nav>
        <button className="action-button" onClick={() => command("action")}>행동</button>
        <VirtualJoystick onMove={(x, y) => command("move", { x, y })} />
      </section>
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"start" | "play" | "editor" | "test" | "family">("start");
  const [family, setFamily] = useState<FamilySession | undefined>();
  const [testSession, setTestSession] = useState<{ maps: Record<string, MapDefinition>; mapId: string } | null>(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("family") === "1") setMode("family"); }, []);
  const home = () => { setFamily(undefined); setMode("start"); };
  if (mode === "start") return <main className="family-screen"><section className="family-card family-welcome">
    <span className="family-leaf" aria-hidden="true">✦</span><h1>지우네 농장</h1><p>오늘은 누구와 농장을 가꿀까요?</p>
    <button onClick={() => { setFamily(undefined); setMode("play"); }}>혼자 하기<small>이 브라우저에 저장한 농장 이어하기</small></button>
    <button onClick={() => setMode("family")}>가족 농장<small>초대 코드로 같은 농장에서 만나기</small></button>
    <button className="family-secondary" onClick={() => setMode("editor")}>맵 편집기</button>
    <p className="family-note">Family Beta · 가족 농장은 로그인과 서버 연결이 필요합니다.</p>
  </section></main>;
  if (mode === "family") return <FamilyLobby onBack={home} onEnter={(session) => { setFamily(session); setMode("play"); }} />;
  if (mode === "editor") return <MapEditor onExit={home} onPlay={(document: MapEditorDocument, mapId: string) => { setTestSession({ maps: documentToRegistry(document), mapId }); setMode("test"); }} />;
  return <FarmGameView editorMaps={mode === "test" ? testSession?.maps : undefined} initialMapId={mode === "test" ? testSession?.mapId : undefined} testMode={mode === "test"} family={mode === "play" ? family : undefined} onHome={home} onOpenEditor={() => { setFamily(undefined); setMode("editor"); }} />;
}
