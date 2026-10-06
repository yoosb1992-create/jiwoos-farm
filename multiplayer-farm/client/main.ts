import "./style.css";
import { ColyseusAdapter, type NetworkSnapshot } from "./network.js";
import { InputController } from "./input.js";
import { createRenderer } from "./scene.js";
import { serverUrl } from "./config.js";
import {
  CROPS,
  RECIPES,
  ITEMS,
  NPCS,
  mapFor,
  TILE,
  itemName,
} from "../shared/content.js";
import { frontTile, type MovementInput } from "../shared/applyMovement.js";
import type { Session } from "../persistence/store.js";
import type { Command, ActionResult, Entity } from "../shared/world.js";
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div id="arena" aria-label="가족 농장 게임 화면"></div>
<header id="top"><div><strong>지우네 농장 <small>v2.5</small></strong><span id="calendar">우리 가족의 작은 세계</span></div><button id="bag" aria-label="가방">가방</button><button id="menu" aria-label="메뉴">☰</button><div id="stamina"><i></i><span>기력</span></div></header>
<div id="notice" role="status">가족 농장에 오신 것을 환영합니다.</div><div id="connection"></div>
<div id="toolbar"><label for="tool">선택</label><select id="tool"><option value="hand">손 · 줍기/상호작용</option><option value="hoe">괭이</option><option value="sproutberry_seed">새싹열매 씨앗</option><option value="sunpotato_seed">햇살감자 씨앗</option><option value="heartberry_seed">하트딸기 씨앗</option><option value="morningcarrot_seed">아침당근 씨앗</option><option value="water">물뿌리개</option><option value="axe">도끼</option><option value="pickaxe">곡괭이</option><option value="fishing_rod">낚싯대</option></select></div>
<div id="controls"><div id="joystick" role="group" aria-label="터치 이동 조이스틱"><div id="knob"></div></div><div id="right-controls"><button id="action">행동</button><button id="run" aria-label="달리기">RUN</button></div></div>
<pre id="hud" hidden></pre><dialog id="panel"><div id="panel-top"><h2 id="panel-title"></h2><button id="panel-close">닫기</button></div><div id="panel-body"></div></dialog>
<section id="login"><div class="login-card"><span class="eyebrow">A LITTLE WORLD, TOGETHER</span><h1>지우네 농장</h1><p>같이 심고, 가꾸고, 새로운 하루를 맞이해요.</p><form id="login-form"><label>닉네임<input id="nickname" maxlength="24" autocomplete="nickname" required placeholder="지우"></label><label>가족 비밀번호<input id="password" type="password" minlength="2" autocomplete="current-password" required placeholder="2글자 이상"></label><label>가족 코드<input id="farm-code" autocomplete="off" placeholder="새 농장은 비워 두세요"></label><div class="login-buttons"><button type="submit" id="create-farm">새 가족 농장</button><button type="button" id="join-farm">참가</button></div></form><button id="resume" hidden>저장된 농장 이어하기</button><p id="login-error" role="alert"></p><small>이 버전은 독립된 새 농장입니다. 기존 세이브는 변경되지 않습니다.<br>코드와 비밀번호를 가족에게 공유하세요. 기기마다 다른 닉네임을 사용합니다.</small></div></section>`;
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const abort = new AbortController(),
  opts = { signal: abort.signal };
const network = new ColyseusAdapter(serverUrl());
const input = new InputController(el("joystick"), el("knob"), el("run"));
let session: Session | undefined,
  selected = "hand",
  latest: NetworkSnapshot = network.snapshot(),
  actionHeld = false,
  nextAction = 0,
  modal = "",
  lastPersonal: unknown,
  lastUi = 0,
  lastMoveTime = 0;
let target: { x: number; y: number } | undefined;
let fishing: ActionResult["fishing"];
let fishPath: number[] = [];
const panel = el<HTMLDialogElement>("panel"),
  panelBody = el("panel-body");
const notice = (message: string) => {
  el("notice").textContent = message;
};
const send = (type: string, extra: Partial<Command> = {}) =>
  network.action({ actionId: crypto.randomUUID(), type, ...extra });
function closePanel(): void {
  panel.close();
  modal = "";
  input.reset();
  actionHeld = false;
}
el("panel-close").addEventListener("click", closePanel, opts);
panel.addEventListener(
  "cancel",
  () => {
    modal = "";
    input.reset();
  },
  opts,
);
function showPanel(type: string, title: string): void {
  modal = type;
  input.reset();
  target = undefined;
  actionHeld = false;
  el("panel-title").textContent = title;
  renderPanel();
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
        (!kind || e.kind === kind) &&
        Math.hypot(e.x - me.authoritativeX, e.y - me.authoritativeY) <= 64,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y),
    )[0];
}
function renderPanel(): void {
  panelBody.replaceChildren();
  const personal = network.personal,
    m = personal?.member;
  if (modal === "bag" && m) {
    row(
      `기력 ${Math.floor(m.stamina)} · ${m.money}골드 · 경험치 ${m.xp} · 도구 Lv${m.toolLevel} · 물 ${m.water}/30`,
    );
    for (const [id, count] of Object.entries(m.inventory)) {
      const actions: HTMLElement[] = [];
      if (id === "stamina_biscuit")
        actions.push(button("먹기", () => send("eat")));
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
  if (modal === "chest" && personal) {
    const chest = nearest("chest");
    row("보관함 가까이에서 원자적으로 입출고합니다.");
    for (const [id, count] of Object.entries(personal.member.inventory))
      if (ITEMS[id]?.kind !== "tool")
        row(`${itemName(id)} 소지 ${count}`, [
          button("1개 넣기", () =>
            send("depositChest", {
              targetId: chest?.id,
              itemId: id,
              quantity: 1,
            }),
          ),
        ]);
    for (const [id, count] of Object.entries(personal.chest))
      row(`${itemName(id)} 보관 ${count}`, [
        button("1개 꺼내기", () =>
          send("withdrawChest", {
            targetId: chest?.id,
            itemId: id,
            quantity: 1,
          }),
        ),
      ]);
  }
  if (modal === "craft") {
    const table = nearest("craft");
    for (const recipe of Object.values(RECIPES))
      row(
        `${recipe.name} · ${recipe.ingredients.map((i) => `${itemName(i.itemId)} ${i.quantity}`).join(" + ")}`,
        [
          button("제작", () =>
            send("craftItem", { targetId: table?.id, itemId: recipe.id }),
          ),
        ],
      );
    row("도구 Lv2 · 구리 5 + 나무 5", [
      button("강화", () => send("upgradeTool", { targetId: table?.id })),
    ]);
  }
  if (modal === "shop") {
    for (const crop of Object.values(CROPS))
      row(`${crop.name} 씨앗 · 10골드`, [
        button("구매", () => send("buyItem", { itemId: crop.seedItemId })),
      ]);
    row("기력 비스켓 · 10골드", [
      button("구매", () => send("buyItem", { itemId: "stamina_biscuit" })),
    ]);
    for (const [id, count] of Object.entries(m?.inventory ?? {}))
      if (CROPS[id] || id.startsWith("fish_"))
        row(`${itemName(id)} ×${count}`, [
          button("1개 판매", () => send("sellItem", { itemId: id })),
        ]);
  }
  if (modal === "menu") {
    row(`가족 코드 ${session?.farmId ?? ""}`, [
      button("코드 복사", () => {
        void navigator.clipboard
          .writeText(session?.farmId ?? "")
          .then(() => notice("가족 코드 복사 완료"))
          .catch(() => notice(`가족 코드: ${session?.farmId}`));
      }),
    ]);
    row("가족이 모두 투표하면 다음 날이 됩니다", [
      button("잠자기 투표", () => {
        send("sleepVote", { value: true });
        closePanel();
      }),
      button("취소", () => send("sleepVote", { value: false })),
    ]);
    row(
      "네트워크 보간",
      ["Stable", "Fast", "Aggressive"].map((p) =>
        button(
          `${p} ${p === "Stable" ? 100 : p === "Fast" ? 75 : 60}ms`,
          () => {
            network.setProfile(p as "Stable" | "Fast" | "Aggressive");
            notice(`${p} 보간 적용`);
          },
        ),
      ),
    );
    row("개발 진단", [
      button("Network HUD", () => {
        el("hud").hidden = !el("hud").hidden;
        closePanel();
      }),
    ]);
    row("농장 → 들꽃길 → 마을 / 요정의 숲 / 광산");
    row("이동: 조이스틱·화면 탭·WASD / 달리기: RUN·Shift");
    row("행동: 도구 선택 후 앞칸에서 행동 버튼·Space / 두 손가락: 화면 확대");
    row("씨앗은 행동 버튼을 누른 채 걸으면 연속 심기. 달리기는 불가.");
    row("연결 복구", [
      button("같은 플레이어로 다시 연결", () => {
        closePanel();
        void connectSaved();
      }),
    ]);
    row("이 기기의 세션 보관", [
      button("로그아웃", () => {
        void network.leave();
        localStorage.removeItem("farm-v25-session");
        session = undefined;
        closePanel();
        el("login").hidden = false;
      }),
    ]);
  }
  if (modal === "fishing" && fishing) {
    row(
      Date.now() < fishing.biteAt
        ? "입질을 기다리세요…"
        : "입질! 0에서 시작해 밝은 칸을 이어 별까지 이동하세요",
    );
    const grid = document.createElement("div");
    grid.className = "fish-grid";
    for (let n = 0; n < fishing.size * fishing.size; n++) {
      const b = button(
        n === 0 ? "시작" : n === fishing.size * fishing.size - 1 ? "★" : "·",
        () => {
          if (!fishing || Date.now() < fishing.biteAt) return;
          const prev = fishPath.at(-1);
          if (
            (prev === undefined && n === 0) ||
            (prev !== undefined &&
              Math.abs((n % 5) - (prev % 5)) +
                Math.abs(Math.floor(n / 5) - Math.floor(prev / 5)) ===
                1)
          ) {
            fishPath.push(n);
            b.classList.add("visited");
            if (n === 24) {
              send("fishingResult", { targetId: fishing.id, path: fishPath });
              closePanel();
            }
          }
        },
      );
      b.disabled = fishing.walls.includes(n);
      grid.append(b);
    }
    panelBody.append(grid);
    panelBody.append(
      button("경로 다시", () => {
        fishPath = [];
        renderPanel();
      }),
    );
  }
}
function act(): void {
  const me = latest.players.find((p) => p.local);
  if (!me || latest.status !== "connected" || modal) return;
  const tile = frontTile({
    x: me.authoritativeX,
    y: me.authoritativeY,
    facing: me.facing,
  });
  if (selected === "hoe") return send("tillTile", tile);
  if (selected.endsWith("_seed"))
    return send("plantSeed", { ...tile, itemId: selected });
  if (selected === "water") return send("waterCrop", tile);
  if (selected === "axe") {
    const e = nearest("tree") ?? nearest("stump");
    if (e) send("hitTree", { targetId: e.id });
    else notice("앞쪽 나무에 더 가까이 가세요");
    return;
  }
  if (selected === "pickaxe") {
    const e = nearest("rock");
    if (e) send("hitRock", { targetId: e.id });
    else notice("바위에 더 가까이 가세요");
    return;
  }
  if (selected === "fishing_rod") return send("castFishing");
  const drop = nearest("drop");
  if (drop) return send("pickupDrop", { targetId: drop.id });
  const crop = network.state?.entities.get(
    `soil-${me.area}-${tile.tileX}-${tile.tileY}`,
  );
  if (crop?.kind === "crop") return send("harvestCrop", tile);
  const e = nearest();
  if (e) {
    if (e.kind === "chest") return showPanel("chest", "가족 보관함");
    if (e.kind === "craft") return showPanel("craft", "제작대");
    if (e.kind === "gather") return send("gather", { targetId: e.id });
    if (e.kind === "ladder") return send("mineAction", { targetId: e.id });
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
  if (me.area === "general_store") return showPanel("shop", "새봄 상점");
  const npc = NPCS.find((n) => {
    const s =
      [...n.schedule]
        .reverse()
        .find((s) => s.minute <= (network.state?.minute ?? 360)) ??
      n.schedule[0]!;
    return (
      s.mapId === me.area &&
      Math.hypot(s.from.x * TILE - me.x, s.from.y * TILE - me.y) < 96
    );
  });
  if (npc) return send("talkNpc", { targetId: npc.id });
  notice("도구를 선택하거나 입구·주민·보관함 가까이에서 행동하세요");
}
network.onAction = (result) => {
  notice(result.message);
  if (result.fishing) {
    fishing = result.fishing;
    fishPath = [];
    showPanel("fishing", "낚시 · 미로");
  }
  if (result.ok && result.transition) target = undefined;
};
el("tool").addEventListener(
  "change",
  () => {
    selected = el<HTMLSelectElement>("tool").value;
  },
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
    nextAction = 0;
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
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      actionHeld = true;
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
    target = undefined;
  },
  opts,
);
document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      actionHeld = false;
      target = undefined;
    }
  },
  opts,
);
const renderer = createRenderer((now, delta) => {
  let command = input.read();
  if (panel.open || !session) command = { moveX: 0, moveY: 0, run: false };
  const me = latest.players.find((p) => p.local);
  if (target && me && !panel.open) {
    if (command.moveX || command.moveY) target = undefined;
    else {
      const dx = target.x - me.x,
        dy = target.y - me.y,
        len = Math.hypot(dx, dy);
      if (len < 8 || now - lastMoveTime > 6000) target = undefined;
      else command = { moveX: dx / len, moveY: dy / len, run: command.run };
    }
  }
  latest = network.frame(now, command);
  if (actionHeld && now > nextAction) {
    nextAction = now + 320;
    act();
  }
  if (now - lastUi > 200) {
    lastUi = now;
    const state = network.state;
    const local = latest.players.find((p) => p.local);
    el("calendar").textContent = state
      ? `${Math.floor((state.day - 1) / 28) + 1}계절 ${((state.day - 1) % 28) + 1}일 · ${String(Math.floor(state.minute / 60)).padStart(2, "0")}:${String(state.minute % 60).padStart(2, "0")} · ${state.weather === "rain" ? "비" : "맑음"} · ${local ? mapFor(local.area).name : ""}`
      : "가족 농장";
    el("connection").textContent =
      `${latest.status === "connected" ? "● 연결됨" : latest.status} · ${latest.players.length}명 · 코드 ${session?.farmId ?? "—"}${state?.votes ? ` · 잠자기 ${state.votes}/${latest.players.filter((p) => p.connected).length}` : ""}${state?.storage !== "ready" && state ? " · 저장 연결 확인 중" : ""}`;
    const stamina = local?.stamina ?? 100;
    el("stamina").querySelector("i")!.style.width = `${stamina}%`;
    el("stamina").querySelector("span")!.textContent =
      `기력 ${Math.floor(stamina)}`;
    if (!el("hud").hidden)
      el("hud").textContent =
        `FPS ${Math.round(1000 / delta)} | RTT ${latest.rtt?.toFixed(0) ?? "—"}ms\nPATCH ${latest.patchRate.toFixed(1)}Hz | TICK ${latest.tickRate ?? "—"}\nBUFFER ${network.delay.toFixed(1)}ms (${network.profile})\nCORRECTION ${latest.correctionDistance.toFixed(2)}px | ${latest.players.length}명\nRECONNECT ${latest.reconnectCount} | ${state?.storage ?? ""}`;
    if (network.personal !== lastPersonal) {
      lastPersonal = network.personal;
      if (modal && modal !== "fishing") renderPanel();
    }
  }
  return { snapshot: latest, state: network.state };
});
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0,
  pinched = false;
el("arena").addEventListener(
  "pointerdown",
  (e) => {
    if (panel.open || !session) return;
    el("arena").setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinched = true;
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      target = undefined;
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
    if (pointers.has(e.pointerId) && !pinched) {
      target = renderer.scene.worldPoint(e.clientX, e.clientY);
      lastMoveTime = performance.now();
    }
    pointers.delete(e.pointerId);
    if (!pointers.size) pinched = false;
  },
  opts,
);
el("arena").addEventListener(
  "pointercancel",
  (e) => {
    pointers.delete(e.pointerId);
    target = undefined;
    pinched = false;
  },
  opts,
);
const http = serverUrl().replace(/^ws/, "http");
async function connectSaved(): Promise<void> {
  if (!session) return;
  try {
    await network.openFarm(session);
    el("login").hidden = true;
    notice("연결됐습니다. 앞쪽 밭에서 괭이 → 씨앗 → 물뿌리개를 사용해 보세요.");
  } catch (e) {
    el("login-error").textContent =
      e instanceof Error ? e.message : "연결 실패";
    el("login").hidden = false;
  }
}
async function login(create: boolean): Promise<void> {
  el("login-error").textContent = "농장에 연결하고 있습니다…";
  try {
    const password = el<HTMLInputElement>("password").value,
      nickname = el<HTMLInputElement>("nickname").value,
      code = el<HTMLInputElement>("farm-code").value;
    const r = await fetch(`${http}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create, password, nickname, code }),
    });
    const result = (await r.json()) as Session & { error?: string };
    if (!r.ok) throw new Error(result.error ?? "로그인 실패");
    session = result;
    localStorage.setItem("farm-v25-session", JSON.stringify(session));
    el<HTMLInputElement>("password").value = "";
    await connectSaved();
  } catch (e) {
    el("login-error").textContent =
      e instanceof Error ? e.message : "접속 실패";
  }
}
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
  const saved = localStorage.getItem("farm-v25-session");
  if (saved) {
    const value = JSON.parse(saved) as Session;
    if (value.token && value.farmId) {
      session = value;
      el("resume").hidden = false;
      void connectSaved();
    }
  }
} catch {
  localStorage.removeItem("farm-v25-session");
}
window.addEventListener(
  "pagehide",
  () => {
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
    },
  });
