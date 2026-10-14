import { mountStartWorld, selectedStartWorld } from "./start-world.js";
import { CharacterEditor } from "./character-editor.js";
import { appearanceOf, type Appearance } from "../shared/appearance.js";
import { DEVELOPER_KEY, verifyDeveloperAccess } from "./developer-access.js";
import { QuickbarUI } from "./quickbar-ui.js";
import { ownedItem } from "../shared/quickbar.js";
import { placementHints, type PlacementHint } from "./placement-preview.js";
import type { UpgradeTool } from "../shared/tool-levels.js";
import { renderHouseholdPanel, type ChestSettingsDraft } from "./household-panels.js";
import { recipesInCategory, type CraftCategory } from "./craft-categories.js";
import { itemIconSource, toolIconImage } from "./item-icons.js";
import { updatePanelContent } from "./panel-view.js";
import { TREE_SPECIES, plantingTree } from "../shared/nature.js";
import { inRect } from "../shared/world2.js";
import { worldNpcSchedule } from "../shared/world2-runtime.js";
import { CLIENT_MAPS as NPC_MAPS } from "./layout.js";
import "./style.css";
import { TouchNavigator, type TouchTarget } from "./navigation.js";
import { ControlLayout } from "./control-layout.js";
import { mapFor } from "./layout.js";
import { ColyseusAdapter, reconnectDelay, terminalConnectionError, type NetworkSnapshot } from "./network.js";
import { InputController } from "./input.js";
import { createRenderer } from "./scene.js";
import { serverUrl, JOIN_TIMEOUT_MS } from "./config.js";
import {
  CROPS,
  ITEMS,
  NPCS,
  npcSchedule,
  TILE,
  itemName,
} from "../shared/content.js";
import { frontTile, type MovementInput } from "../shared/applyMovement.js";
import type { Session } from "../persistence/store.js";
import type { Command, ActionResult, Entity } from "../shared/world.js";
import {
  calendar,
  SEASON_INFO,
  QUESTS,
  DECORATIONS,
  fishingSpot,
  festivalOn,
} from "../shared/expansion.js";
import { FarmAudio } from "./audio.js";
import { isTool } from "../shared/interaction.js";
import { FishingUI } from "./fishing-ui.js";
import { renderLifePanel } from "./life-panels.js";
const audio = new FarmAudio();
const actionKinds = new Map<string, string>();
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div id="arena" aria-label="가족 농장 게임 화면"></div>
<header id="top"><div class="day-block"><span class="brand">JIWOO’S FARM · v2.8</span><strong id="calendar">우리 가족의 작은 세계</strong><span id="place">사계절을 함께 가꾸어요</span></div><div class="top-actions"><span id="wallet">0 G</span><button id="bag" aria-label="가방">가방 <small id="bag-space">0/48</small></button><button id="menu" aria-label="메뉴">☰</button></div><div id="stamina"><i></i><span>기력</span></div></header><button hidden id="today" aria-label="오늘 할 일">✦ 오늘의 작은 한 걸음</button>
<div id="notice" role="status">가족 농장에 오신 것을 환영합니다.</div><div id="connection"></div>
<button id="sleep-status" hidden aria-label="잠자기 투표 현황"></button><div id="context-hint"></div><div id="toolbar"><div id="quickslots"></div><div id="tool-picker"><select id="tool" aria-label="도구와 씨앗 선택"><option value="hand">손 · 줍기/상호작용</option><option value="hoe">괭이</option><option value="sproutberry_seed">새싹열매 씨앗</option><option value="sunpotato_seed">햇살감자 씨앗</option><option value="heartberry_seed">하트딸기 씨앗</option><option value="morningcarrot_seed">아침당근 씨앗</option><option value="water">물뿌리개</option><option value="axe">도끼</option><option value="pickaxe">곡괭이</option><option value="scythe">낫</option><option value="fishing_rod">낚싯대</option></select></div></div>
<button id="furniture-action" hidden type="button"></button><button id="placement-cancel" hidden type="button">설치 취소</button><div id="controls"><div id="joystick" role="group" aria-label="터치 이동 조이스틱"><div id="knob"></div></div><div id="right-controls"><button id="action" aria-label="행동">행동</button><button id="run" aria-label="달리기">RUN</button></div></div>
<pre id="hud" hidden></pre><dialog id="panel"><div id="panel-top"><h2 id="panel-title"></h2><button id="panel-close">닫기</button></div><div id="panel-body"></div></dialog>
<section id="login"><div class="login-card"><span class="eyebrow">FOUR SEASONS, ONE LITTLE HOME</span><h1>지우네 농장</h1><p>꽃 피는 봄부터 눈 내리는 겨울까지.<br>우리 가족의 사계절을 함께 가꾸어요.</p><div class="season-pills"><span>✿ 봄</span><span>☀ 여름</span><span>❧ 가을</span><span>❄ 겨울</span></div><form id="login-form"><label>닉네임<input id="nickname" maxlength="24" autocomplete="nickname" required placeholder="지우"></label><label>새 농장 이름 <small>(선택 · 만들 때만 적용)</small><input id="farm-name" maxlength="30" autocomplete="off" placeholder="예: 지우네 가족 농장"></label><label>가족 코드<input id="farm-code" autocomplete="off" placeholder="새 농장은 비워 두세요"></label><button type="button" id="new-appearance">캐릭터 꾸미기</button><div class="login-buttons"><button type="submit" id="create-farm">새 가족 농장</button><button type="button" id="join-farm">참가</button></div></form><button id="resume" hidden>저장된 농장 이어하기</button><div id="saved-farms"></div><p id="login-error" role="status"></p><button type="button" id="cancel-connect" hidden>연결 취소</button><small>이 버전은 독립된 새 농장입니다. 기존 세이브는 변경되지 않습니다.<br>가족 코드만 공유하면 함께할 수 있어요. 기기마다 다른 닉네임을 사용합니다.</small></div></section>`;
mountStartWorld();
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const abort = new AbortController(),
  opts = { signal: abort.signal };
const network = new ColyseusAdapter(serverUrl());
el("top").append(el("connection"));
const input = new InputController(el("joystick"), el("knob"), el("run"));
let session: Session | undefined,
  selected = "hand",
  latest: NetworkSnapshot = network.snapshot(),
  actionHeld = false,
  nextAction = 0,
  modal = "",
  lastPersonal: unknown,
  lastUi = 0;
let controlStatus = latest.status;
let fishing: ActionResult["fishing"];
let fishingUI: FishingUI | undefined;
let fishingOffset = 0,
  panelTarget: string | undefined,
  dialogue: ActionResult["dialogue"],
  dialoguePage = 0;
let lastStep = 0;
let selectedRecipe = "wood_plank", householdFeedback = "", householdPending: string | undefined;
let chestDraft: ChestSettingsDraft | undefined;
let placementItem: string | undefined, furniturePending: string | undefined;
let candidateHints: PlacementHint[] = [];
let selectedUpgradeTool: UpgradeTool = "axe";
let selectedCraftCategory: CraftCategory = "all";
const categorySelections: Partial<Record<CraftCategory, string>> = {};
let householdReadyAt = 0, observedDay = 0, sleepPanelDay = 1;
const householdActions = new Set(["depositChest", "withdrawChest", "configureChest", "linkChest", "unlinkChest", "craftItem", "upgradeTool", "sleepVote"]);
const characterEditor=new CharacterEditor();
let newAppearance=appearanceOf(),appearanceDraft=appearanceOf(),appearanceForNew=false,appearanceRequest:string|undefined;
let verifiedDeveloper=false;
const developerActive=()=>verifiedDeveloper&&localStorage.getItem(DEVELOPER_KEY)==="true";
function openAppearance(forNew=false):void {
  appearanceForNew=forNew;appearanceDraft=appearanceOf(forNew?newAppearance:network.personal?.member.appearance);
  showPanel("appearance","캐릭터 꾸미기");
}

document.documentElement.style.setProperty(
  "--ui-scale",
  localStorage.getItem("farm-ui-scale") ?? "1",
);
document.addEventListener(
  "pointerdown",
  () => {
    void audio.unlock();
  },
  opts,
);
document.addEventListener(
  "click",
  (e) => {
    if ((e.target as HTMLElement).closest("button")) audio.play("click");
  },
  opts,
);
const panel = el<HTMLDialogElement>("panel"),
  panelBody = el("panel-body");
let noticeUntil = 0;
const notice = (message: string) => {
  noticeUntil = performance.now() + 5500;
  el("notice").textContent = message;
  el("notice").classList.remove("quiet");
};
let bufferedToolAction: {type:string;extra:Partial<Command>;expires:number}|undefined;
const send = (type: string, extra: Partial<Command> = {}):void => {
  if (network.snapshot().status !== "connected") return;
  const actor=latest.players.find(p=>p.local);
  if(actor && ["useTool","gather","harvestCrop","tillTile","waterCrop","refill"].includes(type) && renderer.scene.actionBusy(actor.id)) {
    bufferedToolAction={type,extra,expires:performance.now()+1200};return;
  }
  if (householdActions.has(type)) {
    if (householdPending || performance.now() < householdReadyAt) return;
    if (network.snapshot().status !== "connected") { notice("연결을 복구하고 있어요"); return; }
  }
  if (["placeItem", "liftChest", "lowerChest"].includes(type) && furniturePending) return;
  const actionId = crypto.randomUUID();
  if (["placeItem", "liftChest", "lowerChest"].includes(type)) furniturePending = actionId;
  if (householdActions.has(type)) {
    householdPending = actionId;
    householdFeedback = "";
    renderPanel();
  }
  actionKinds.set(actionId, type);
  if (actionKinds.size > 100)
    actionKinds.delete(actionKinds.keys().next().value!);
  if(type==="updateAppearance")appearanceRequest=actionId;
  network.action({ actionId, type, ...extra });
};
const quickbar = new QuickbarUI({
  member: () => network.personal?.member,
  selected: () => selected,
  select: id => selectTool(id),
  edit: edit => send("updateQuickbar", {quickbarEdit:edit}),
  open: showPanel, close: () => closePanel(),
  pause: () => { input.reset(); actionHeld=false; touchNavigation.cancel(); },
});
function startPlacement(id: string): void {
  if (!ITEMS[id]?.placement || !ownedItem(network.personal?.member,id)) return;
  if (network.personal?.member.carried) { notice("들고 있는 보관함을 먼저 내려놓아 주세요"); return; }
  closePanel(); touchNavigation.cancel(); actionHeld=false; input.reset();
  placementItem=id; candidateHints=[]; notice("상하좌우의 초록색 칸을 눌러 설치하세요");
}
function closePanel(cancelFishing = true): void {
  characterEditor.dispose();
  if (modal === "fishing" && fishing && cancelFishing) send("cancelFishing");
  fishingUI?.dispose();
  fishingUI = undefined;
  fishing = undefined;
  panel.close();
  delete panel.dataset.panel;
  modal = "";
  input.reset();
  actionHeld = false;
}
el("panel-close").addEventListener("click", () => closePanel(), opts);
panel.addEventListener(
  "cancel",
  (e) => {
    e.preventDefault();
    closePanel();
  },
  opts,
);
function showPanel(type: string, title: string, targetId?: string): void {
  if(type==="developer"&&!developerActive())return;
  characterEditor.dispose();
  quickbar.closeFavorites();
  const samePanel = modal === type;
  if (!samePanel || targetId !== panelTarget) chestDraft = undefined;
  panelTarget = targetId;
  householdFeedback = "";
  sleepPanelDay = network.state?.day ?? 1;
  panel.dataset.panel = type;
  if (["chest", "craft", "sleep"].includes(type)) audio.play("clunk");
  modal = type;
  input.reset();
  touchNavigation.cancel();
  actionHeld = false;
  el("panel-title").textContent = title;
  renderPanel();
  if (!samePanel) { panel.scrollTop = 0; panelBody.scrollTop = 0; }
  if (!panel.open) panel.showModal();
}
function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
function row(text: string, buttons: HTMLElement[] = []): void {
  const div = document.createElement("div");
  div.className = "item-row";
  const label = document.createElement("span");
  label.textContent = text;
  div.append(label, ...buttons);
  panelBody.append(div);
}
function nearest(kind?: string): Entity | undefined {
  const me = latest.players.find((p) => p.local);
  if (!me) return;
  return [...(network.state?.entities.values() ?? [])]
    .filter(
      (e) =>
        e.area === me.area &&
        (kind
          ? e.kind === kind
          : [
              "bed",
              "chest",
              "craft",
              "gather",
              "ladder",
              "animal",
              "barn",
              "trough",
              "board",
              "decoration",
              "well",
              "machine",
            ].includes(e.kind)) &&
        Math.hypot(e.x - me.authoritativeX, e.y - me.authoritativeY) <= 64,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y),
    )[0];
}
function renderPanel(): void {
  updatePanelContent(panel, panelBody, renderPanelContent);
}
function renderPanelContent(): void {
  fishingUI?.dispose();
  fishingUI = undefined;
  panelBody.replaceChildren();
  const personal = network.personal,
    m = personal?.member;
  const local = latest.players.find((p) => p.local),
    state = network.state;
  if(modal==="appearance") {
    characterEditor.mount(panelBody,appearanceDraft,value=>{
      if(appearanceForNew){newAppearance=value;closePanel();el("new-appearance").textContent="캐릭터 꾸미기 · 설정됨";return;}
      if(network.snapshot().status!=="connected"){characterEditor.busy("연결을 복구한 뒤 저장해 주세요.");return;}
      send("updateAppearance",{appearance:value});
      characterEditor.busy("외형을 저장하고 있어요…",true);
    },()=>closePanel());return;
  }
  if(modal==="settings") {
    const section=document.createElement("section");section.className="developer-setting";
    const toggle=button(developerActive()?"개발자 모드 끄기":"개발자 모드 켜기",()=>{
      if(!verifiedDeveloper)return;
      localStorage.setItem(DEVELOPER_KEY,String(!developerActive()));
      el("hud").hidden=true;document.body.classList.toggle("developer-mode",developerActive());
      showPanel("settings","게임 설정");
    });toggle.id="developer-toggle";toggle.disabled=!verifiedDeveloper;toggle.setAttribute("aria-pressed",String(developerActive()));
    const help=document.createElement("p");help.textContent=verifiedDeveloper?"농장 소유자 또는 설계도 편집 권한 확인됨 · 편집/진단 메뉴를 표시합니다.":"일반 플레이어 모드 · 편집 권한이 있는 계정에서 사용할 수 있어요.";
    section.append(toggle,help);panelBody.append(section);
  }
  if(modal==="developer") {
    row("개발자 모드 · 편집 권한은 서버에서 별도로 확인합니다",[button("월드 편집기",()=>{window.location.href="/editor.html";})]);
    row("네트워크 보간",["Stable","Fast","Aggressive"].map(p=>button(`${p} ${p==="Stable"?100:p==="Fast"?75:60}ms`,()=>{network.setProfile(p as "Stable"|"Fast"|"Aggressive");notice(`${p} 보간 적용`);})));
    row("멀티플레이 진단",[button("Network HUD",()=>{el("hud").hidden=!el("hud").hidden;closePanel();})]);
    row(`접속 ${latest.status} · ${latest.players.length}명 · RTT ${latest.rtt?.toFixed(0)??"—"}ms · 재접속 ${latest.reconnectCount}회`);
    return;
  }
  const chestKey = panelTarget ? personal?.chestStorageKeys?.[panelTarget] : undefined;
  const chestInfo = panelTarget ? personal?.chestInfos?.[panelTarget] : undefined;
  if (modal === "chest" && chestInfo) {
    el("panel-title").textContent = chestInfo.name;
    if (chestDraft?.key !== chestInfo.storageKey) chestDraft = { key: chestInfo.storageKey, name: chestInfo.customName, color: chestInfo.color, open: false, dirty: false };
    else if (!chestDraft.dirty || (chestDraft.name.trim().normalize("NFC") === chestInfo.customName && chestDraft.color === chestInfo.color)) {
      chestDraft.name = chestInfo.customName; chestDraft.color = chestInfo.color; chestDraft.dirty = false;
    }
  }
  if (renderHouseholdPanel(modal, panelBody, {
    member: m, chest: (chestKey ? personal?.chestStores?.[chestKey] : undefined) ?? {},
    storageReady: !!chestKey && !!personal?.chestStores && !!chestInfo, legacyChestTarget: personal?.legacyChestTarget,
    chestInfo, chestDraft,
    day: sleepPanelDay, minute: state?.minute ?? 360,
    entities: [...(state?.entities.values() ?? [])], players: latest.players, targetId: panelTarget,
    recipe: selectedRecipe, category: selectedCraftCategory,
    upgradeTool: selectedUpgradeTool, selectUpgradeTool: id => { selectedUpgradeTool = id; renderPanel(); },
    busy: !!householdPending || performance.now() < householdReadyAt,
    connected: latest.status === "connected", feedback: householdFeedback,
    sleepVoted: personal?.sleepVoted ?? false, votes: state?.votes ?? 0,
    selectRecipe: id => {
      selectedRecipe = id;
      categorySelections[selectedCraftCategory] = id;
      renderPanel();
    },
    selectCategory: category => {
      if (selectedCraftCategory !== "upgrade") categorySelections[selectedCraftCategory] = selectedRecipe;
      // Upgrading is an action, not a recipe: keep the last recipe untouched.
      if (category !== "upgrade") {
        const recipes = recipesInCategory(category);
        const remembered = categorySelections[category];
        selectedRecipe = recipes.find(r => r.id === remembered)?.id
          ?? recipes.find(r => r.id === selectedRecipe)?.id ?? recipes[0]?.id ?? selectedRecipe;
      }
      selectedCraftCategory = category;
      renderPanel();
    }, send, close: () => closePanel(),
  })) return;
  if (quickbar.renderPanel(modal,panelBody)) return;
  if (
    renderLifePanel(modal, panelBody, {
      member: m,
      day: state?.day ?? 1,
      minute: state?.minute ?? 360,
      weather: state?.weather ?? "clear",
      area: local?.area ?? "farm",
      entities: [...(state?.entities.values() ?? [])],
      players: latest.players,
      targetId: panelTarget,
      dialogue,
      dialoguePage,
      audio,
      send,
      select: selectTool,
      place: startPlacement,
      quickslot: id => quickbar.openSlots(id),
      quickManager: () => quickbar.openManager(),
      editQuickbar: edit => send("updateQuickbar", {quickbarEdit:edit}),
      close: () => closePanel(),
      open: showPanel,
      page: (n) => {
        dialoguePage = n;
        renderPanel();
      },
      notice,
      zoom: (v) => renderer.scene.setZoom(v),
    })
  )
    return;
  if (modal === "bag" && m) {
    row(
      `기력 ${Math.floor(m.stamina)} · ${m.money}골드 · 경험치 ${m.xp} · 물 ${m.water}/30`,
    );
    for (const [id, count] of Object.entries(m.inventory)) {
      const actions: HTMLElement[] = [];
      if (id === "stamina_biscuit")
        actions.push(button("먹기", () => send("eat")));
      if (id === "storage_chest") actions.push(button("앞칸에 놓기", () => { closePanel(); send("placeChest"); }));
      if (id === "wood_processor")
        actions.push(
          button("배치", () => {
            closePanel();
            send("placeMachine");
          }),
        );
      row(`${itemName(id)} ×${count}`, actions);
    }
    row(`보람의 부탁: 작물 3개 수확 (${Math.min(3, m.quests.harvest ?? 0)}/3)`);
  }
  if (modal === "shop") {
    const season = calendar(network.state?.day ?? 1).season;
    row(
      `${SEASON_INFO[season].icon} ${SEASON_INFO[season].name} 장터 · ${m?.money ?? 0} G`,
    );
    for (const crop of Object.values(CROPS).filter((c) =>
      c.seasons.includes(season),
    ))
      row(
        `${crop.name} 씨앗 · ${crop.seedPrice} G · ${crop.growthDays}일${crop.regrowDays ? " / 재수확" : ""}`,
        [
          button("1개", () => send("buyItem", { itemId: crop.seedItemId })),
          button("5개", () =>
            send("buyItem", { itemId: crop.seedItemId, quantity: 5 }),
          ),
        ],
      );
    row("나무 씨앗과 묘목 · 빈 잔디에 심어요");
    for(const t of TREE_SPECIES.filter(t=>t.seedPrice>0)) row(`${t.seedName} · ${t.seedPrice} G`,[button("구매",()=>send("buyItem",{itemId:t.seed}))]);
    for (const [id, price] of [
      ["stamina_biscuit", 10],
      ["animal_feed", 8],
      ["herb_tea", 45],
      ["harvest_stew", 95],
    ] as const)
      row(`${itemName(id)} · ${price} G`, [
        button("구매", () => send("buyItem", { itemId: id })),
      ]);
    for (const [id, d] of Object.entries(DECORATIONS))
      row(`${d.name} · ${d.price} G`, [
        button("구입", () => send("buyItem", { itemId: id })),
      ]);
    row("수확물 판매");
    for (const [id, count] of Object.entries(m?.inventory ?? {}))
      if ((ITEMS[id]?.sellPrice ?? 0) > 0)
        row(`${itemName(id)} ×${count} · 개당 ${ITEMS[id]!.sellPrice} G`, [
          button("1개 판매", () => send("sellItem", { itemId: id })),
          button("모두 판매", () =>
            send("sellItem", { itemId: id, quantity: Math.min(999, count) }),
          ),
        ]);
  }
  if (modal === "menu") {
    const menuGrid=document.createElement("div");menuGrid.className="menu-grid player-menu";
    for(const [id,title] of [["journal","✦ 퀘스트 / 오늘 할 일"],["map","⌖ 지역 지도"],["residents","♧ 주민과 부탁"],["calendar","▦ 행사 달력"],["codex","❧ 도감"],["settings","⚙ 소리·화면 설정"],["family","농장 및 가족"]])
      menuGrid.append(button(title!,()=>showPanel(id!,title!)));
    menuGrid.prepend(button("가방",()=>showPanel("bag","가방")),button("캐릭터 꾸미기",()=>openAppearance()));
    menuGrid.append(button("조작 배치 편집",()=>{closePanel();controls.open();}));
    if(developerActive())menuGrid.append(button("개발자 도구",()=>showPanel("developer","개발자 도구")));
    panelBody.append(menuGrid);
    return;
  }
  if(modal==="codex") {
    row("농장의 도감",[button("사계절 작물·자연 도감",()=>showPanel("crops","사계절 도감")),button("물고기 도감",()=>showPanel("fish","물고기 도감"))]);return;
  }
  if(modal==="family") {
    row(`가족 코드 ${session?.farmId??""}`,[button("코드 복사",()=>{
      void navigator.clipboard.writeText(session?.farmId??"").then(()=>notice("가족 코드 복사 완료")).catch(()=>notice(`가족 코드: ${session?.farmId}`));
    })]);
    row("가족이 모두 투표하면 다음 날이 됩니다",[button("잠자기 투표",()=>showPanel("sleep-status","가족 잠자기")),button("투표 취소",()=>send("sleepVote",{value:false,day:network.state?.day}))]);
    row("농장 생활",[button("동물 돌보기",()=>showPanel("animals","동물 돌보기")),button("정원 꾸미기",()=>showPanel("decoration","정원 꾸미기"))]);
    if(["general_store","cafe"].includes(local?.area??""))row("상점",[button("상점 둘러보기",()=>showPanel("shop","사계절 상점"))]);
    row("농장 목록",[button("저장 농장 관리",()=>{window.location.href="/?newFarm=1";})]);
    row("다른 기기에서 같은 플레이어로 이어하기 · 이 개인 코드는 본인만 사용하세요.",[button("개인 이어하기 코드 복사",()=>{
      void navigator.clipboard.writeText(session?.token??"").then(()=>notice("개인 코드를 다른 기기의 ‘내 플레이어 이어하기’에 붙여 넣으세요.")).catch(()=>notice("복사가 지원되지 않는 기기예요."));
    })]);
    row("접속 관리",[button("같은 플레이어로 다시 연결",()=>{closePanel();void connectSaved();}),button("로그아웃",()=>{
      void cancelConnecting();localStorage.removeItem(SESSION_KEY);session=undefined;verifiedDeveloper=false;el("hud").hidden=true;
      document.body.classList.remove("developer-mode");closePanel();el("login").hidden=false;
      renderSavedFarms();
    })]);return;
  }
  if (modal === "fishing" && fishing) {
    const current = fishing;
    fishingUI = new FishingUI(
      panelBody,
      current,
      fishingOffset,
      () => send("hookFishing", { targetId: current.id }),
      (inputs) => send("fishingResult", { targetId: current.id, inputs }),
      (s) => audio.play(s),
    );
  }
}
function selectTool(id: string): void {
  if(!ownedItem(network.personal?.member,id)) {notice("가방에 없는 아이템이에요");id="hand";}

  if(selected!==id)bufferedToolAction=undefined;
  selected = id;
  el<HTMLSelectElement>("tool").value = id;
  updateSelectedToolIcon();
  quickbar.refresh();
}
function updateSelectedToolIcon(): void {
  let preview = document.getElementById("selected-tool-icon");
  if (!preview) {
    preview = document.createElement("span");
    preview.id = "selected-tool-icon";
    preview.setAttribute("aria-hidden", "true");
    el("tool-picker").prepend(preview);
  }
  const available = ownedItem(network.personal?.member,selected);
  let icon = available ? toolIconImage(selected) : null;
  const source = available ? itemIconSource(selected) : undefined;
  if (!icon && source) {
    icon = document.createElement("img");
    icon.src = source; icon.alt = ""; icon.className = "tool-icon";
  }
  preview.replaceChildren(...(icon ? [icon] : []));
  preview.hidden = !icon;
  const name = el<HTMLSelectElement>("tool").selectedOptions[0]?.textContent ?? "도구";
  el("tool").setAttribute("aria-label", `${name} 선택 중 · 도구와 씨앗 선택`);
  el("tool-picker").title = `${name} · 도구와 씨앗 선택`;
}
function refreshTools(): void {
  const member=network.personal?.member;
  const inventory=member?.inventory??{};
  const choices:Array<[string,string]>=[["hand","손 · 줍기/상호작용"]];
  for(const [id,count] of Object.entries(inventory)) if(count>0 && ITEMS[id])
    choices.push([id,`${itemName(id)}${ITEMS[id]?.kind==="tool"?"":` ×${count}`}`]);
  const select=el<HTMLSelectElement>("tool");
  select.replaceChildren();
  for(const [id,text] of choices) {const option=document.createElement("option");option.value=id;option.textContent=text;select.append(option);}
  // Reconnection clears personal state until the authenticated inventory arrives.
  // Unknown ownership must not erase selection; a confirmed missing item does.
  if(member && !ownedItem(member,selected)) { selected="hand";bufferedToolAction=undefined;actionHeld=false; }
  select.disabled=!member;
  select.value=selected;
  updateSelectedToolIcon();
  quickbar.refresh();
}

function act(): void {
  // Pointer/keyboard events can arrive between render frames. Read the live
  // connection before selecting an authoritative target or sending a command.
  touchNavigation.cancel();
  latest = network.snapshot();
  if (controls.editing) return;
  if (latest.status !== "connected") {
    notice("연결을 복구하고 있어요. 연결된 뒤 행동을 다시 눌러 주세요.");
    return;
  }
  const me = latest.players.find((p) => p.local);
  if (!me || modal) return;
  if (!network.personal?.member) {notice("가방 정보를 불러오는 중이에요");return;}
  if (!ownedItem(network.personal?.member,selected)) {selectTool("hand");return;}
  if (ITEMS[selected]?.placement) {startPlacement(selected);return;}
  if (selected!=="hand" && !isTool(selected) && selected!=="fishing_rod" && !plantingTree(selected) && ITEMS[selected]?.kind!=="seed") {
    if ((ITEMS[selected]?.energy??0)>0) send("eat",{itemId:selected});
    else notice("이 아이템은 제작대나 해당 시설에서 사용할 수 있어요");
    return;
  }
  if (placementItem || me.carrying) return notice(placementItem ? "초록색 설치 칸을 선택하거나 취소하세요" : "내려놓기 버튼으로 보관함을 내려놓아 주세요");
  const tile = frontTile({
    x: me.authoritativeX,
    y: me.authoritativeY,
    facing: me.facing,
  });
  // Pouring has priority over wells, harvesting, doors, shops and object use.
  // Refilling remains an explicit hand interaction with a well.
  if (selected === "water") return send("useTool", { toolId: "water", ...tile });
  const bed = me.area === "farmhouse" ? nearest("bed") : undefined;
  if (bed && nearest()?.id === bed.id) return showPanel("sleep", "포근한 잠자리", bed.id);
  const event = mapFor(me.area).world2?.events.find(
    (e) =>
      e.trigger === "interact" &&
      inRect(e.area, Math.floor(me.x / 32), Math.floor(me.y / 32)),
  );
  if (event && selected === "hand")
    return send("worldEvent", { targetId: event.id });
  if (isTool(selected)) {
    // Aim at the actual front object, irrespective of which tool can damage it.
    // This prevents a wrong-tool swing silently snapping to a different resource.
    const dx = me.facing === "left" ? -1 : me.facing === "right" ? 1 : 0;
    const dy = me.facing === "up" ? -1 : me.facing === "down" ? 1 : 0;
    const targets = [...(network.state?.entities.values() ?? [])].filter(e => {
      const ex=e.x-me.authoritativeX, ey=e.y-me.authoritativeY;
      return e.area===me.area && ["tree","stump","rock","twig","gather","crop","soil","withered","chest"].includes(e.kind) &&
        // Include the adjacent trunk corner while the player's collision body
        // stays outside its full tile. All tools share the same aiming rule.
        Math.hypot(ex,ey)<=64 && ex*dx+ey*dy>=4 && Math.abs(ex*dy-ey*dx)<=TILE;
    }).sort((a,b)=>Math.hypot(a.x-me.authoritativeX,a.y-me.authoritativeY)-Math.hypot(b.x-me.authoritativeX,b.y-me.authoritativeY));
    const target = targets[0];
    return send("useTool", {toolId:selected,targetId:target?.id,...tile});
  }
  if (plantingTree(selected)) return send("plantTree", {...tile,itemId:selected});
  if (selected.endsWith("_seed"))
    return send("plantSeed", { ...tile, itemId: selected });
  if (selected === "fishing_rod") return send("castFishing");
  const drop = nearest("drop");
  if (drop) return send("pickupDrop", { targetId: drop.id });
  const crop = network.state?.entities.get(
    `soil-${me.area}-${tile.tileX}-${tile.tileY}`,
  );
  if (crop?.kind === "crop") return send("harvestCrop", tile);
  const e = nearest();
  if (e) {
    if (e.kind === "chest") return showPanel("chest", "보관함", e.id);
    if (e.kind === "craft") return showPanel("craft", "제작대", e.id);
    if (e.kind === "gather") return send("gather", { targetId: e.id });
    if (e.kind === "ladder") return send("mineAction", { targetId: e.id });
    if (["animal", "barn", "trough"].includes(e.kind))
      return showPanel("animals", "사계절 우리", e.id);
    if (e.kind === "board") return showPanel("board", "마을 게시판", e.id);
    if (e.kind === "decoration")
      return showPanel("decoration", "정원 꾸미기", e.id);
    if (e.kind === "well") return send("refill", { targetId: e.id });
    if (e.kind === "machine")
      return send(e.readyAt ? "collectMachine" : "startMachine", {
        targetId: e.id,
      });
  }
  const map = mapFor(me.area);
  const warp = map.warps.find(
    (w) =>
      me.x / TILE >= w.area.startX - 1 &&
      me.x / TILE <= w.area.endX + 2 &&
      me.y / TILE >= w.area.startY - 1 &&
      me.y / TILE <= w.area.endY + 2,
  );
  if (warp) return send("enterArea", { targetId: warp.id });
  const npc = NPCS.find((n) => {
    const s = authoredNpcSchedule(
      n,
      network.state?.day ?? 1,
      network.state?.minute ?? 360,
    );
    return (
      s.mapId === me.area &&
      Math.hypot(s.from.x * TILE - me.x, s.from.y * TILE - me.y) < 96
    );
  });
  if (npc) return send("talkNpc", { targetId: npc.id });
  if (["general_store", "cafe"].includes(me.area))
    return showPanel("shop", me.area === "cafe" ? "바람찻집" : "사계절 상점");
  notice("도구를 선택하거나 입구·주민·보관함 가까이에서 행동하세요");
}
function touchAct(t: TouchTarget): void {
  if (placementItem || latest.players.find(p => p.local)?.carrying) return;
  if (t.kind === "ground" && t.signature === "water") {
    if (selected !== "water") return;
    send("useTool", { toolId: "water", tileX: Math.floor(t.x / TILE), tileY: Math.floor(t.y / TILE) });
    return;
  }
  if(t.kind === "ground" && t.signature && plantingTree(t.signature)) {
    if(selected!==t.signature)return;
    send("plantTree", {tileX:Math.floor(t.x/TILE),tileY:Math.floor(t.y/TILE),itemId:t.signature}); return;
  }
  if (t.kind === "ground" && t.signature === "hoe") {
    if(selected!=="hoe")return;
    send("useTool", {
      toolId: "hoe",
      tileX: Math.floor(t.x / TILE),
      tileY: Math.floor(t.y / TILE),
    });
    return;
  }
  const e = network.state?.entities.get(t.id);
  if (t.kind === "shop") {
    showPanel("shop", "사계절 상점");
    return;
  }
  if (t.kind === "fish") {
    selectTool("fishing_rod");
    send("castFishing");
    return;
  }
  if (t.kind === "npc") {
    send("talkNpc", { targetId: t.id });
    return;
  }
  if (!e || e.kind !== t.signature) return;
  const tile = { tileX: Math.floor(e.x / TILE), tileY: Math.floor(e.y / TILE) };
  if (isTool(selected) && ["tree","stump","twig","rock","gather","crop","soil","withered","chest"].includes(e.kind)) {
    send("useTool",{toolId:selected,targetId:e.id,...tile});
    return;
  }
  switch (e.kind) {
    case "tree":
    case "stump":
    case "twig":
    case "rock":
      notice("도구를 선택한 뒤 사용하세요");
      break;
    case "drop":
      send("pickupDrop", { targetId: e.id });
      break;
    case "gather":
      send("gather", { targetId: e.id });
      break;
    case "withered":
      selectTool("hoe");
      send("tillTile", tile);
      break;
    case "crop":
      if (selected === "water") {
        send("waterCrop", tile);
      } else if (e.stage >= (CROPS[e.crop]?.growthDays ?? 3)) {
        selectTool("hand");
        send("harvestCrop", tile);
      } else {
        notice("물뿌리개를 선택해 물을 주세요");
      }
      break;
    case "soil": {
      if (selected === "water") {
        send("waterCrop", tile);
        break;
      }
      if (selected.endsWith("_seed")) {
        send("plantSeed", { ...tile, itemId: selected });
      } else notice("씨앗이나 물뿌리개를 선택하세요");
      break;
    }
    case "bed":
      showPanel("sleep", "포근한 잠자리", e.id);
      break;
    case "chest":
      showPanel("chest", "보관함", e.id);
      break;
    case "craft":
      showPanel("craft", "제작", e.id);
      break;
    case "machine":
      send(e.readyAt ? "collectMachine" : "startMachine", { targetId: e.id });
      break;
    case "well":
      send("refill", { targetId: e.id });
      break;
    case "ladder":
      send("mineAction", { targetId: e.id });
      break;
    case "animal":
      showPanel("animals", "동물 돌보기", e.id);
      break;
    case "barn":
    case "trough":
      showPanel("animals", "우리와 동물", e.id);
      break;
    case "board":
      showPanel("board", "마을 게시판", e.id);
      break;
    case "decoration":
      showPanel("decoration", "정원 꾸미기", e.id);
      break;
  }
}
const touchNavigation = new TouchNavigator(notice, touchAct,()=>{
  const me=latest.players.find(p=>p.local);return !!me && renderer.scene.actionBusy(me.id);
});
const controls = new ControlLayout(notice, () => {
  input.reset();
  actionHeld = false;
  touchNavigation.cancel();
});
// Connection events update controls synchronously; a slow render must not leave
// an enabled action button or a stale green status during reconnect.
function updateConnection(status: NetworkSnapshot["status"]): void {
  const connection = el("connection"),
    players = network.snapshot().players.length;
  connection.dataset.status = status;
  connection.textContent =
    status === "connected"
      ? "●"
      : status === "reconnecting"
        ? "↻ 자동으로 다시 연결하고 있어요…"
        : status === "connecting" ? "서버에 연결하는 중…"
        : status === "error" ? "연결할 수 없어요"
        : "연결이 끊겼어요.";
  connection.setAttribute(
    "aria-label",
    `${status === "connected" ? "연결됨" : status === "reconnecting" ? "재연결 중" : "연결 끊김"} · ${players}명`,
  );
  connection.title = `${network.snapshot().message} · ${players}명 · 가족 코드 ${session?.farmId ?? ""}`;
  if (!el("login").hidden && status !== "disconnected") el("login-error").textContent = network.snapshot().message;
  el("cancel-connect").hidden = !entryPending && !sessionRequest && !["connecting", "reconnecting"].includes(status);
  el<HTMLButtonElement>("action").disabled =
    status !== "connected" || !network.personal?.member || panel.open;
}
network.onConnection = (status) => {
  updateConnection(status);
  if (status !== "connected") {
    bufferedToolAction = undefined;
    householdPending = undefined;
    householdFeedback = "연결을 복구하고 있어요. 다시 연결되면 수량을 확인해 주세요.";
    if (modal && modal!=="appearance") renderPanel();
    if(modal==="appearance"){appearanceRequest=undefined;characterEditor.busy("연결을 복구한 뒤 저장을 다시 눌러 주세요.");}
    input.reset();
    actionHeld = false;
    furniturePending = undefined; placementItem = undefined; candidateHints = [];
    touchNavigation.cancel();
  }
  if (controlStatus === "connected" && status === "reconnecting")
    notice("연결을 복구하고 있어요. 잠시 기다려 주세요.");
  if (controlStatus === "reconnecting" && status === "connected")
    notice("연결이 복구됐어요. 이동하거나 행동을 다시 눌러 주세요.");
  if (status === "error") notice(network.snapshot().message);
  controlStatus = status;
};
network.onAction = (result) => {
  if(appearanceRequest===result.actionId){
    appearanceRequest=undefined;
    if(result.ok&&modal==="appearance")closePanel();
    else characterEditor.busy(result.message);
  }
  if (householdPending === result.actionId || (householdPending && !result.actionId && !result.ok)) {
    householdPending = undefined;
    householdReadyAt = performance.now() + 220;
    householdFeedback = result.ok ? `✓ ${result.message}` : result.message;
    if (result.ok) audio.play("pickup");
    if (modal) renderPanel();
    setTimeout(() => { if (modal) renderPanel(); }, 230);
  }
  if (result.ok && actionKinds.get(result.actionId) === "sleepVote" && ["sleep", "sleep-status"].includes(modal)) closePanel();
  if (result.message !== "완료" && !result.transportFx) notice(result.message);
  const kind = actionKinds.get(result.actionId);
  if (furniturePending === result.actionId || (!result.actionId && !result.ok)) {
    furniturePending = undefined;
    if (result.ok && kind === "placeItem") { placementItem = undefined; candidateHints = []; renderer.scene.placementFeedback(); }
  }
  actionKinds.delete(result.actionId);
  if (result.ok && !result.fx) {
    const effect = (
      {
        hitTree: "wood",
        hitRock: "stone",
        waterCrop: "water",
        harvestCrop: "harvest",
        pickupDrop: "harvest",
        collectAnimal: "harvest",
      } as const
    )[
      kind as
        | "hitTree"
        | "hitRock"
        | "waterCrop"
        | "harvestCrop"
        | "pickupDrop"
        | "collectAnimal"
    ];
    if (effect) audio.play(effect);
  }
  if (result.fishing) {
    fishing = result.fishing;
    fishingOffset = (result.serverNow ?? Date.now()) - Date.now();
    showPanel("fishing", "낚시 · 손끝의 물결");
  }
  if (kind === "fishingResult") {
    closePanel(false);
    if (!result.ok) send("cancelFishing");
  }
  if (result.dialogue) {
    dialogue = result.dialogue;
    dialoguePage = 0;
    showPanel("dialogue", result.dialogue.name);
  }
  if (result.ok && result.transition) {
    touchNavigation.cancel();
    renderer.scene.transition(result.transition.effect);
  }
};
network.onTransportFx = event => { renderer.scene.transportFeedback(event); };
network.onActionFx = event => renderer.scene.actionFeedback(event);
el("placement-cancel").addEventListener("click", () => {
  if (furniturePending) return;
  placementItem = undefined; candidateHints = []; renderer.scene.setPlacementHints([]); input.reset();
}, opts);
el("furniture-action").addEventListener("click", () => {
  const me = network.snapshot().players.find(p => p.local);
  if (!me || furniturePending || renderer.scene.actionBusy(me.id) || panel.open) return;
  touchNavigation.cancel(); actionHeld = false; input.reset();
  if (me.carrying) send("lowerChest");
  else if (selected === "hand") {
    const target = nearest("chest");
    if (target) send("liftChest", { targetId: target.id });
  }
}, opts);
el("sleep-status").addEventListener("click", () => showPanel("sleep-status", "가족 잠자기"), opts);
el("tool").addEventListener(
  "change",
  () => {
    selectTool(el<HTMLSelectElement>("tool").value);
  },
  opts,
);
el("today").addEventListener(
  "click",
  () => showPanel("journal", "오늘의 작은 한 걸음"),
  opts,
);
el("bag").addEventListener("click", () => showPanel("bag", "가방"), opts);
el("menu").addEventListener(
  "click",
  () => showPanel("menu", "농장 메뉴"),
  opts,
);
el("action").addEventListener(
  "pointerdown",
  (e) => {
    e.preventDefault();
    el("action").setPointerCapture(e.pointerId);
    actionHeld = true;
    nextAction = performance.now() + 320;
    act();
  },
  opts,
);
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  el("action").addEventListener(
    name,
    () => {
      actionHeld = false;
    },
    opts,
  );
window.addEventListener(
  "keydown",
  (e) => {
    if (
      ["INPUT", "SELECT", "TEXTAREA"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
    if (!panel.open && !controls.editing && /^[1-7]$/.test(e.key)) {
      el("quickslots").querySelector<HTMLButtonElement>(`button[data-slot-id="${e.key}"]`)?.click();return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (!actionHeld) {
        nextAction = performance.now() + 320;
        act();
      }
      actionHeld = !panel.open;
    }
    if (e.code === "KeyE") act();
  },
  opts,
);
window.addEventListener(
  "keyup",
  (e) => {
    if (e.code === "Space") actionHeld = false;
  },
  opts,
);
window.addEventListener(
  "blur",
  () => {
    actionHeld = false;
    touchNavigation.cancel();
  },
  opts,
);
document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      input.reset();
      actionHeld = false;
      touchNavigation.cancel();
    } else resumeConnections();
  },
  opts,
);
window.addEventListener("online", resumeConnections, opts);
window.addEventListener("focus", resumeConnections, opts);
const renderer = createRenderer((now, delta) => {
  let command = input.read();
  if (panel.open || controls.editing || !session)
    command = { moveX: 0, moveY: 0, run: false };
  const me = latest.players.find((p) => p.local);
  if (!panel.open && !controls.editing && latest.status === "connected")
    command = touchNavigation.step(
      performance.now(),
      me,
      network.state,
      command,
      latest,
    );
  else touchNavigation.cancel();
  // Keep the existing server input lock and 30Hz prediction contract. The
  // longer visual recovery sends neutral movement, then held walk/run resumes;
  // it must not turn an animation duration into extra server input debt.
  const interrupted=!!(command.moveX || command.moveY);
  if(me && renderer.scene.actionBusy(me.id))command={moveX:0,moveY:0,run:false};
  latest = network.frame(now, command);
  if(bufferedToolAction) {
    if(interrupted || panel.open || latest.status!=="connected" || now>bufferedToolAction.expires) bufferedToolAction=undefined;
    else {
      const actor=latest.players.find(p=>p.local);
      if(actor && !renderer.scene.actionBusy(actor.id)) {
        const queued=bufferedToolAction;bufferedToolAction=undefined;
        if(!queued.extra.targetId || network.state?.entities.has(queued.extra.targetId))send(queued.type,queued.extra);
      }
    }
  }
  el<HTMLButtonElement>("action").disabled =
    latest.status !== "connected" || !network.personal?.member || panel.open;
  if (actionHeld && now > nextAction) {
    nextAction = now + 320;
    act();
  }
  if (now - lastUi > 200) {
    lastUi = now;
    el("notice").classList.toggle("quiet", now > noticeUntil);
    const state = network.state;
    const local = latest.players.find((p) => p.local);
    const sleepStatus = el("sleep-status");
    sleepStatus.hidden = !state?.votes;
    sleepStatus.textContent = `☾ 잠자기 ${state?.votes ?? 0}/${latest.players.filter(p => p.connected).length} · ${network.personal?.sleepVoted ? "동의함" : "확인"}`;
    if (state && observedDay && state.day > observedDay) {
      if (["sleep", "sleep-status"].includes(modal) && sleepPanelDay < state.day) closePanel();
      notice("☀ 새로운 아침이에요. 기력을 회복했어요!");
      renderer.scene.transition();
    }
    if (state) observedDay = state.day;
    const cal = calendar(state?.day ?? 1),
      info = SEASON_INFO[cal.season];
    const personal = network.personal?.member;
    candidateHints = local && latest.status === "connected" && !panel.open ? placementHints(network, local, placementItem) : [];
    renderer.scene.setPlacementHints(candidateHints);
    el("placement-cancel").hidden = !placementItem;
    el<HTMLButtonElement>("placement-cancel").disabled = !!furniturePending;
    const furnitureButton = el<HTMLButtonElement>("furniture-action");
    const liftTarget = selected === "hand" && !local?.carrying ? nearest("chest") : undefined;
    const liftInfo = liftTarget && network.personal?.chestInfos?.[liftTarget.id];
    const canShow = !!local && !panel.open && !placementItem && latest.status === "connected";
    furnitureButton.hidden = !canShow || (!local?.carrying && !liftInfo);
    furnitureButton.textContent = local?.carrying ? "내려놓기" : liftInfo && !liftInfo.canCarry ? "너무 무거워요" : "들어올리기";
    furnitureButton.disabled = !!furniturePending || !!local && renderer.scene.actionBusy(local.id) || (!local?.carrying && !liftInfo?.canCarry);
    furnitureButton.title = local?.carrying ? candidateHints[0]?.error ?? "앞칸에 내려놓기" : liftInfo ? `${liftInfo.weightKg.toFixed(1)} / 36kg · ${liftInfo.name}` : "";
    el<HTMLButtonElement>("run").disabled = !!local?.carrying;
    controls.placeAuxiliary();
    el("calendar").textContent = state
      ? `${info.icon} ${info.name} ${cal.day}일 · ${String(Math.floor(state.minute / 60)).padStart(2, "0")}:${String(state.minute % 60).padStart(2, "0")} ${state.weather === "rain" ? "☂" : state.weather === "snow" ? "❄" : "☀"}`
      : "우리 가족의 작은 세계";
    el("place").textContent =
      `${local ? mapFor(local.area).name : "사계절을 함께 가꾸어요"} · ${state?.weather === "rain" ? "☂ 비" : state?.weather === "snow" ? "❄ 눈" : "☀ 맑음"}`;
    el("wallet").textContent = `${personal?.money ?? 0} G`;
    el("bag-space").textContent =
      `${Object.keys(personal?.inventory ?? {}).length}/48`;
    const task = QUESTS.find((q) => !personal?.quests[`reward-${q.id}`]);
    el("today").textContent = festivalOn(state?.day ?? 1)
      ? `✦ 오늘 ${festivalOn(state?.day ?? 1)!.name} · 달력을 확인하세요`
      : task
        ? `✦ ${task.title} · ${Math.min(task.goal, personal?.quests[task.stat] ?? 0)}/${task.goal}  ›`
        : `✦ ${info.name}의 하루 · 도감과 마을을 둘러보세요`;
    const spot = local && fishingSpot(local.area, local.x, local.y, NPC_MAPS);
    el("context-hint").textContent = local?.area === "farmhouse" && nearest("bed")
      ? "☾ 침대 · 행동 버튼 / Space로 잠자기"
      : spot
      ? "≈ 낚시 가능 · 낚싯대를 선택하세요"
      : nearest("animal")
        ? "♡ 동물에게 먹이와 인사를 주세요"
        : selected.endsWith("_seed")
          ? "행동을 누른 채 걷기 · RUN 중에는 심기 불가"
          : `${selected === "hand" ? "손 · 가까운 사물과 대화 / 줍기" : selected === "water" ? "물뿌리개 · 앞칸에서 행동" : `${itemName(selected)} · 앞칸에서 행동`}`;
    audio.context(
      local?.area ?? "farm",
      cal.season,
      state?.weather ?? "clear",
      state?.minute ?? 360,
      Boolean(festivalOn(state?.day ?? 1)),
    );
    if (local?.moving && now - lastStep > (local.running ? 240 : 410)) {
      lastStep = now;
      audio.play("step");
    }
    updateConnection(latest.status);
    const stamina = local?.stamina ?? 100;
    el("stamina").querySelector("i")!.style.width = `${stamina}%`;
    el("stamina").querySelector("span")!.textContent =
      `기력 ${Math.floor(stamina)}`;
    if (!el("hud").hidden)
      el("hud").textContent =
        `FPS ${Math.round(1000 / delta)} | RTT ${latest.rtt?.toFixed(0) ?? "—"}ms\nPATCH ${latest.patchRate.toFixed(1)}Hz | TICK ${latest.tickRate ?? "—"}\nBUFFER ${network.delay.toFixed(1)}ms (${network.profile})\nCORRECTION ${latest.correctionDistance.toFixed(2)}px | ${latest.players.length}명\nRECONNECT ${latest.reconnectCount} | ${state?.storage ?? ""}`;
    if (network.personal !== lastPersonal) {
      lastPersonal = network.personal;
      refreshTools();
      if (modal && !["fishing", "settings", "dialogue", "appearance"].includes(modal))
        renderPanel();
    }
  }
  return { snapshot: latest, state: network.state };
});
renderer.scene.onSound = sound => audio.play(sound);
const pointers = new Map<number, { x: number; y: number }>();
const pointerStarts = new Map<number, { x: number; y: number }>();
let pinch = 0,
  pinched = false;
el("arena").addEventListener(
  "pointerdown",
  (e) => {
    if (panel.open || controls.editing || !session) return;
    el("arena").setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pointerStarts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinched = true;
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      touchNavigation.cancel();
    }
  },
  opts,
);
el("arena").addEventListener(
  "pointermove",
  (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const next = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0) renderer.scene.zoomBy(next / pinch);
      pinch = next;
    }
  },
  opts,
);
el("arena").addEventListener(
  "pointerup",
  (e) => {
    const start = pointerStarts.get(e.pointerId);
    if (
      pointers.has(e.pointerId) &&
      !pinched &&
      start &&
      Math.hypot(start.x - e.clientX, start.y - e.clientY) < 12
    ) {
      const me = network.snapshot().players.find((p) => p.local);
      if (me && network.state && placementItem) {
        candidateHints = placementHints(network, me, placementItem);
        const point = renderer.scene.pickWorld(e.clientX, e.clientY);
        const hint = candidateHints.find(h => h.cells.some(p => Math.abs(p.x - point.x) <= TILE / 2 && Math.abs(p.y - point.y) <= TILE / 2));
        if (hint?.error) notice(hint.error);
        else if (hint) send("placeItem", { itemId: placementItem, tileX: hint.tileX, tileY: hint.tileY });
      } else if (me && network.state)
        touchNavigation.choose(
          renderer.scene.pickWorld(e.clientX, e.clientY),
          me,
          network.state,
          selected === "hoe" || selected === "water" ? selected : plantingTree(selected) ? selected : undefined,
        );
    }
    pointers.delete(e.pointerId);
    pointerStarts.delete(e.pointerId);
    if (!pointers.size) pinched = false;
  },
  opts,
);
el("arena").addEventListener(
  "pointercancel",
  (e) => {
    pointers.delete(e.pointerId);
    pointerStarts.delete(e.pointerId);
    if (!pointers.size) pinched = false;
    touchNavigation.cancel();
  },
  opts,
);
const http = serverUrl().replace(/^ws/, "http");
const SESSION_KEY = "farm-v26-session";
const SESSION_LIST_KEY = "farm-v26-sessions";
let connectionIntent = 0;
// A saved identity is not permission to enter a farm. Only an explicit user
// action enables recovery for this page lifetime; refresh/bfcache starts idle.
let connectionAllowed = false;
let entryPending = false;
let sessionRequest: AbortController | undefined, wakeLoginRetry: (() => void) | undefined;
function resumeConnections(): void {
  if (!connectionAllowed) return;
  network.resumeConnection();
  wakeLoginRetry?.();
}
function cancelConnecting(): Promise<void> {
  ++connectionIntent;
  connectionAllowed = false;
  entryPending = false;
  sessionRequest?.abort();
  sessionRequest = undefined;
  wakeLoginRetry?.();
  return network.leave();
}
el("cancel-connect").addEventListener("click", () => {
  void cancelConnecting();
  el("login").hidden = false;
  renderSavedFarms();
  el("cancel-connect").hidden = true;
  el("login-error").textContent = "연결을 취소했어요. 저장된 농장을 다시 선택할 수 있어요.";
}, opts);
function savedSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(SESSION_LIST_KEY) ?? "[]") as Session[]; }
  catch { return []; }
}
function writeSavedSessions(values: Session[]): void {
  localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(values.slice(0, 20)));
}
function archiveSession(value: Session | undefined): void {
  if (!value) return;
  try { writeSavedSessions([value, ...savedSessions().filter((s) => s.token !== value.token)]); }
  catch {}
}
function updateSavedFarm(farmId: string, patch: Partial<Session>): void {
  writeSavedSessions(savedSessions().map((s) => s.farmId === farmId ? { ...s, ...patch } : s));
  if (session?.farmId === farmId) {
    session = { ...session, ...patch };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}
function removeSavedFarm(farmId: string): void {
  writeSavedSessions(savedSessions().filter((s) => s.farmId !== farmId));
  if (session?.farmId === farmId) {
    session = undefined;
    localStorage.removeItem(SESSION_KEY);
  }
}
async function renameSavedFarm(value: Session): Promise<void> {
  const name = prompt("새 농장 이름을 입력하세요.", value.farmName ?? `${value.nickname}의 농장`);
  if (name === null) return;
  const r = await fetch(`${http}/api/farm`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${value.token}` },
    body: JSON.stringify({ name }),
  });
  const result = (await r.json()) as { farmName?: string; error?: string };
  if (!r.ok || !result.farmName) { notice(result.error ?? "농장 이름 변경 실패"); return; }
  updateSavedFarm(value.farmId, { farmName: result.farmName, isOwner: true });
  renderSavedFarms();
  notice("농장 이름을 바꿨어요.");
}
async function deleteSavedFarm(value: Session): Promise<void> {
  if (!confirm(`"${value.farmName ?? value.farmId}" 농장을 정말 삭제하시겠습니까?\n삭제한 농장은 복구할 수 없습니다.`)) return;
  if (session?.farmId === value.farmId) {
    await cancelConnecting().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  let removed = false;
  // An old tab may close before its WebSocket room releases the server lease.
  // The owner confirms only once; transparently retry ONLY the temporary
  // "farm is still open" lock. Other failures never retry or erase anything.
  for (let attempt = 0; attempt < 22; attempt++) {
    const r = await fetch(`${http}/api/farm`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${value.token}` },
      body: JSON.stringify({ confirm: true }),
    });
    if (r.ok) { removed = true; break; }
    const result = (await r.json().catch(() => ({}))) as { error?: string };
    if (!result.error?.includes("농장이 열려") || attempt === 21) {
      notice(result.error ?? "농장 삭제 실패");
      return;
    }
    notice("농장의 이전 연결이 종료되기를 확인하고 있어요…");
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  if (!removed) return;
  removeSavedFarm(value.farmId);
  renderSavedFarms();
  notice("저장 농장을 삭제했습니다.");
}
function renderSavedFarms(): void {
  el("resume").hidden = !session;
  if (session) el("resume").textContent = `${session.farmName ?? `${session.nickname}의 농장`} 이어하기`;
  const holder = el("saved-farms");
  holder.replaceChildren();
  const seen = new Set<string>();
  for (const value of savedSessions()) {
    if (seen.has(value.farmId)) continue;
    seen.add(value.farmId);
    const line = document.createElement("div");
    line.className = "item-row";
    const label = document.createElement("span");
    label.textContent = `${value.farmName ?? `${value.nickname}의 농장`} · ${value.farmId}`;
    line.append(label,
      button("이어하기", () => {
        session = value;
        localStorage.setItem(SESSION_KEY, JSON.stringify(value));
        void connectSaved();
      }),
      button("이름 수정", () => void renameSavedFarm(value)),
      button("삭제", () => void deleteSavedFarm(value)));
    holder.append(line);
  }
}
async function connectSaved(): Promise<void> {
  if (!session) return;
  const value = session, closing = cancelConnecting(), intent = connectionIntent;
  connectionAllowed = true;
  entryPending = true;
  el("cancel-connect").hidden = false;
  // Cancel the old target before waiting for assets or opening another farm.
  await closing;
  try {
    // Do not start the fixed input clock while Phaser is still loading assets.
    // Otherwise the first rendered frame can enqueue a preloading-time backlog.
    await renderer.scene.ready;
    if (intent !== connectionIntent || session !== value) return;
    await network.openFarm(value,newAppearance);
    if (intent !== connectionIntent || session !== value || network.snapshot().status !== "connected") return;
    el("login").hidden = true;
    const canDevelop = await verifyDeveloperAccess();
    if (intent !== connectionIntent || session !== value) return;
    verifiedDeveloper=canDevelop;
    document.body.classList.toggle("developer-mode",developerActive());
    if(!developerActive())el("hud").hidden=true;
    notice("연결됐습니다. 길 밖의 잔디 평지를 괭이로 갈아 우리 가족의 밭을 만들어 보세요.");
  } catch (e) {
    if (intent !== connectionIntent) return;
    connectionAllowed = false;
    el("login-error").textContent =
      e instanceof Error ? e.message : "연결 실패";
    el("login").hidden = false;
  } finally {
    if (intent === connectionIntent) entryPending = false;
  }
}
async function login(create: boolean): Promise<void> {
  if (sessionRequest) return; // repeated taps never create parallel login jobs
  const closing = cancelConnecting(), intent = connectionIntent;
  connectionAllowed = true;
  const controller = new AbortController();
  sessionRequest = controller;
  await closing;
  if (controller.signal.aborted || intent !== connectionIntent) return;
  el("login-error").textContent = "서버에 연결하는 중…";
  el("cancel-connect").hidden = false;
  try {
    const nickname = el<HTMLInputElement>("nickname").value.trim(),
      code = el<HTMLInputElement>("farm-code").value.trim().toUpperCase();
    const saved = !create && savedSessions().find(s => s.farmId === code && s.nickname === nickname);
    if (saved) {
      session = saved;
      localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
      await connectSaved();
      return;
    }
    // Stable for this first-join request: retries use the same durable identity.
    const requestToken = create ? undefined : Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    const body = JSON.stringify({ create, nickname, code, requestToken,
      farmName: create ? el<HTMLInputElement>("farm-name").value : undefined,
      startWorld: create ? await selectedStartWorld() : undefined });
    let attempt = 0;
    while (!controller.signal.aborted && intent === connectionIntent) {
      try {
        const r = await fetch(`${http}/api/session`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(JOIN_TIMEOUT_MS)]),
        });
        const result = (await r.json()) as Session & { error?: string };
        if (!r.ok) throw Object.assign(new Error(result.error ?? "접속 실패"), { code: r.status });
        if (controller.signal.aborted || intent !== connectionIntent) return;
        archiveSession(session);
        session = result;
        archiveSession(session);
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        await connectSaved();
        return;
      } catch (error) {
        if (controller.signal.aborted || intent !== connectionIntent) return;
        // New farm creation is not replayed; existing-family joins are idempotent.
        if (create || terminalConnectionError(error) || (error as {code?: number})?.code === 400) throw error;
        el("login-error").textContent = "자동으로 다시 연결하고 있어요…";
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); wakeLoginRetry = undefined; resolve(); };
          const timer = setTimeout(finish, reconnectDelay(attempt++));
          wakeLoginRetry = finish;
        });
      }
    }
  } catch (e) {
    if (intent === connectionIntent) el("login-error").textContent = e instanceof Error ? e.message : "접속 실패";
  } finally {
    if (sessionRequest === controller) sessionRequest = undefined;
    if (intent === connectionIntent) el("cancel-connect").hidden = true;
  }
}
el("new-appearance").addEventListener("click",()=>openAppearance(true),opts);
const recovery=document.createElement("details");recovery.className="player-recovery";
recovery.innerHTML='<summary>다른 기기의 내 플레이어 이어하기</summary><p>기존 기기 → 농장 및 가족 → 개인 이어하기 코드 복사</p><label>개인 이어하기 코드<input id="resume-code" type="password" autocomplete="off"></label><button type="button" id="import-player">내 플레이어 이어하기</button>';
el("login-form").after(recovery);
el("import-player").addEventListener("click",async()=>{
  const b=el<HTMLButtonElement>("import-player");b.disabled=true;
  const closing=cancelConnecting(), intent=connectionIntent;
  connectionAllowed=true;
  const controller=new AbortController();sessionRequest=controller;
  el("cancel-connect").hidden=false;
  try{
    await closing;
    if(controller.signal.aborted||intent!==connectionIntent)return;
    const token=el<HTMLInputElement>("resume-code").value.trim();
    if(!token||token.length>200)throw Error("개인 이어하기 코드를 입력하세요");
    const r=await fetch(`${http}/api/session`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(JOIN_TIMEOUT_MS)])});
    if(!r.ok)throw Error("코드를 확인하세요. 만료된 코드는 사용할 수 없어요.");
    const identity=await r.json();
    if(controller.signal.aborted||intent!==connectionIntent)return;
    archiveSession(session);session={...identity,token};archiveSession(session);localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    el<HTMLInputElement>("resume-code").value="";await connectSaved();
  }catch(e){if(intent===connectionIntent)el("login-error").textContent=e instanceof Error?e.message:"이어하기 실패";}finally{
    if(sessionRequest===controller)sessionRequest=undefined;
    if(intent===connectionIntent)el("cancel-connect").hidden=true;
    b.disabled=false;
  }
},opts);
el("login-form").addEventListener(
  "submit",
  (e) => {
    e.preventDefault();
    void login(true);
  },
  opts,
);
el("join-farm").addEventListener(
  "click",
  () => {
    void login(false);
  },
  opts,
);
el("resume").addEventListener(
  "click",
  () => {
    void connectSaved();
  },
  opts,
);
try {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    const value = JSON.parse(saved) as Session;
    if (value.token && value.farmId) {
      session = value;
      el("resume").hidden = false;
    }
  }
} catch { /* Keep stored data intact even if this page cannot read it. */ }
try {
  archiveSession(session);
  if (session)
    el("resume").textContent = `${session.farmName ?? `${session.nickname}의 농장`} 이어하기`;
  renderSavedFarms();

} catch {}
// pagehide releases sockets/rendering. Rebuild the lobby after bfcache restore;
// the saved session remains available for an explicit Continue click.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
window.addEventListener(
  "pagehide",
  () => {
    void cancelConnecting();
    fishingUI?.dispose();
    controls.dispose();
    audio.dispose();
    input.dispose();
    network.dispose();
    renderer.game.destroy(true);
    abort.abort();
  },
  { once: true },
);

if (import.meta.env.DEV)
  Object.assign(window, {
    __FARM_DEBUG__: {
      snapshot: () => latest,
      state: () => network.state?.toJSON(),
      screenPoint: (x: number, y: number) => renderer.scene.screenPoint(x, y),
      pickWorld: (x: number, y: number) => renderer.scene.pickWorld(x, y),
      scene: () => renderer.scene,
    },
  });

function authoredNpcSchedule(
  npc: Parameters<typeof worldNpcSchedule>[0],
  day: number,
  minute: number,
) {
  return worldNpcSchedule(npc, day, minute, NPC_MAPS);
}
