import { CLIENT_MAPS as MAPS } from "./layout.js";
import {
  ASSETS,
  ITEMS,
  CROPS,
  NPCS,
  npcSchedule,
  itemName,
} from "../shared/content.js";
import {
  ANIMALS,
  DECORATIONS,
  FISH_CATALOG,
  FORAGE,
  QUESTS,
  FESTIVALS,
  SEASON_INFO,
  WATER_NAMES,
  calendar,
  festivalOn,
} from "../shared/expansion.js";
import type { ActionResult, Command, Entity, Member } from "../shared/world.js";
import type { RenderPlayer } from "./network.js";
import type { FarmAudio } from "./audio.js";
export interface LifeContext {
  member?: Member;
  day: number;
  minute: number;
  weather: string;
  area: string;
  entities: Entity[];
  players: RenderPlayer[];
  targetId?: string;
  dialogue?: ActionResult["dialogue"];
  dialoguePage: number;
  audio: FarmAudio;
  send(type: string, extra?: Partial<Command>): void;
  select(id: string): void;
  close(): void;
  open(type: string, title: string, targetId?: string): void;
  page(n: number): void;
  notice(message: string): void;
  zoom(value: number): void;
}
const icons: Record<string, string> = {
  tool: "⚒",
  seed: "✦",
  crop: "❧",
  forage: "✿",
  fish: "≈",
  produce: "◒",
  decoration: "⌂",
};
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function action(
  text: string,
  fn: () => void,
  disabled = false,
): HTMLButtonElement {
  const b = element("button", text);
  b.disabled = disabled;
  b.addEventListener("click", fn);
  return b;
}
function card(
  parent: HTMLElement,
  title: string,
  text: string,
  buttons: HTMLElement[] = [],
  badge = "",
): HTMLElement {
  const el = element("article", "", "life-card"),
    h = element("h3", title),
    p = element("p", text);
  if (badge) el.append(element("span", badge, "card-badge"));
  el.append(h, p);
  if (buttons.length) {
    const bar = element("div", "", "card-actions");
    bar.append(...buttons);
    el.append(bar);
  }
  parent.append(el);
  return el;
}
function tabs(parent: HTMLElement, choices: Array<[string, () => void]>): void {
  const nav = element("nav", "", "panel-tabs");
  nav.append(...choices.map(([name, fn]) => action(name, fn)));
  parent.append(nav);
}
const time = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function renderLifePanel(
  type: string,
  body: HTMLElement,
  c: LifeContext,
): boolean {
  const m = c.member,
    cal = calendar(c.day),
    season = cal.season;
  if (type === "bag" && m) {
    card(
      body,
      `${m.money} G · 가방 ${Object.keys(m.inventory).length}/48`,
      `기력 ${Math.floor(m.stamina)} · 물 ${m.water}/30 · 경험치 ${m.xp} · 도구 Lv${m.toolLevel}`,
    );
    tabs(body, [
      [
        "종류순",
        () => {
          localStorage.setItem("farm-bag-sort", "kind");
          c.open("bag", "가방");
        },
      ],
      [
        "이름순",
        () => {
          localStorage.setItem("farm-bag-sort", "name");
          c.open("bag", "가방");
        },
      ],
      ["도감", () => c.open("crops", "사계절 도감")],
    ]);
    const sorted = Object.entries(m.inventory).sort(([a], [b]) =>
      localStorage.getItem("farm-bag-sort") === "name"
        ? itemName(a).localeCompare(itemName(b), "ko")
        : (ITEMS[a]?.kind ?? "").localeCompare(ITEMS[b]?.kind ?? "") ||
          itemName(a).localeCompare(itemName(b), "ko"),
    );
    for (const [id, count] of sorted) {
      const item = ITEMS[id],
        buttons: HTMLElement[] = [];
      if (item?.kind === "tool" || item?.kind === "seed")
        buttons.push(
          action("선택", () => {
            c.select(id === "watering_can" ? "water" : id);
            c.close();
          }),
        );
      if ((item?.energy ?? 0) > 0)
        buttons.push(
          action(`먹기 +${item!.energy}`, () => c.send("eat", { itemId: id })),
        );
      if (id === "wood_processor")
        buttons.push(
          action("배치", () => {
            c.close();
            c.send("placeMachine");
          }),
        );
      if (id in DECORATIONS)
        buttons.push(
          action("앞칸에 놓기", () => {
            c.close();
            c.send("placeDecoration", { itemId: id });
          }),
        );
      const el = card(
        body,
        `${itemName(id)} ×${count}`,
        item?.description ??
          `${item?.sellPrice ? `판매가 ${item.sellPrice} G` : "농장의 소중한 재료"}`,
        buttons,
        icons[item?.kind ?? ""] ?? "•",
      );
      const path = ASSETS[item?.assetId ?? ""]?.source?.path;
      if (path && !["tool", "crop"].includes(item?.kind ?? "")) {
        const img = element("img");
        img.src = path;
        img.alt = "";
        img.className = "item-art";
        img.loading = "lazy";
        el.prepend(img);
      }
    }
    return true;
  }
  if (["crops", "fish", "forage"].includes(type)) {
    tabs(body, [
      ["작물", () => c.open("crops", "사계절 도감")],
      ["물고기", () => c.open("fish", "물결 도감")],
      ["채집물", () => c.open("forage", "숲의 노트")],
    ]);
    if (type === "crops")
      for (const crop of Object.values(CROPS)) {
        card(
          body,
          crop.name,
          `${crop.seasons.map((s) => SEASON_INFO[s].name).join("·")} · ${crop.growthDays}일 성장${crop.regrowDays ? ` · ${crop.regrowDays}일 재수확` : ""}\n씨앗 ${crop.seedPrice} G / 판매 ${crop.sellPrice} G / 기력 +${crop.energy}\n${crop.description}`,
          [],
          crop.seasons.includes(season) ? "지금 재배 가능" : "다른 계절",
        );
      }
    if (type === "fish") {
      card(
        body,
        `물결 수집 ${Object.keys(m?.fishBook ?? {}).length}/${FISH_CATALOG.length}`,
        "입질 때 챔질 → 홀드/해제로 초록 영역을 움직여 물고기를 따라가요. 수역과 계절마다 다른 물고기를 만나요.",
      );
      for (const f of FISH_CATALOG) {
        const record = m?.fishBook?.[f.id];
        card(
          body,
          `${record ? "✓ " : ""}${f.name}`,
          `${f.seasons.map((s) => SEASON_INFO[s].name).join("·")} · ${f.waters.map((w) => WATER_NAMES[w]).join(" / ")}\n${time(f.from)}–${time(f.to)} · ${f.weather === "rain" ? "비" : "모든 날씨"} · ${f.price} G\n${record ? `${record.count}마리 · 최고 ${record.bestCm}cm` : "아직 만나지 못한 물고기"}\n${f.description}`,
          [],
          f.rarity,
        );
      }
    }
    if (type === "forage")
      for (const f of FORAGE)
        card(
          body,
          f.name,
          `${f.seasons.map((s) => SEASON_INFO[s].name).join("·")} · ${f.price} G · 기력 +${f.energy}\n${f.description}`,
          [],
          m?.collections?.[f.id] ? "발견했어요" : "요정의 숲",
        );
    return true;
  }
  if (type === "journal" || type === "board") {
    card(
      body,
      "오늘도, 작은 한 걸음",
      "① 괭이로 밭 갈기 → ② 계절 씨앗 심기 → ③ 물주기. 매일 물을 주고 가족 모두 잠자기 투표를 하면 작물이 자라요.",
    );
    for (const q of QUESTS) {
      const value = m?.quests[q.stat] ?? 0,
        done = Boolean(m?.quests[`reward-${q.id}`]);
      card(
        body,
        q.title,
        `${q.text}\n${Math.min(q.goal, value)}/${q.goal} · 보상 ${q.gold} G`,
        [
          action(
            done ? "완료" : "보상 받기",
            () => c.send("claimQuest", { targetId: q.id }),
            done || value < q.goal,
          ),
        ],
        done ? "✓" : "생활 목표",
      );
    }
    const seasonKey = `${cal.year}-${season}`;
    card(
      body,
      `${SEASON_INFO[season].name} 수확 일기`,
      `이번 계절 작물 8개 수확 · ${Math.min(8, m?.quests[`harvest-${seasonKey}`] ?? 0)}/8 · 180 G`,
      [
        action(
          "계절 보상 받기",
          () => c.send("claimSeason"),
          Boolean(m?.quests[`season-${seasonKey}`]) ||
            (m?.quests[`harvest-${seasonKey}`] ?? 0) < 8,
        ),
      ],
    );
    tabs(body, [
      ["행사 달력", () => c.open("calendar", "마을 달력")],
      ["주민 부탁", () => c.open("residents", "우리 마을 사람들")],
    ]);
    return true;
  }
  if (type === "calendar") {
    card(
      body,
      `${cal.year}년 ${SEASON_INFO[season].name} ${cal.day}일`,
      "한 계절은 28일이에요. 계절이 바뀌면 제철이 지난 작물은 말라요. 재수확 작물도 마지막 날 전에 챙겨 주세요.",
    );
    const days = element("div", "", "calendar-grid");
    for (let d = 1; d <= 28; d++) {
      const festival = FESTIVALS.find(
        (f) => f.season === season && f.day === d,
      );
      const cell = element(
        "div",
        `${d}${festival ? " ✦" : ""}`,
        d === cal.day ? "today" : "",
      );
      cell.title = festival?.name ?? "";
      days.append(cell);
    }
    body.append(days);
    for (const f of FESTIVALS)
      card(
        body,
        `${SEASON_INFO[f.season].name} ${f.day}일 · ${f.name}`,
        `${time(f.from)}–${time(f.to)} · 마을 광장\n${f.description}`,
        f.id === festivalOn(c.day)?.id
          ? [
              action("광장에서 행사 참여", () =>
                c.send("attendFestival", { targetId: f.id }),
              ),
            ]
          : [],
        f.id === festivalOn(c.day)?.id ? "오늘!" : "계절 행사",
      );
    return true;
  }
  if (type === "residents") {
    const pool = FORAGE.filter((f) => f.seasons.includes(season));
    NPCS.forEach((n, i) => {
      const schedule = npcSchedule(n, c.day, c.minute),
        request = pool[i % pool.length]!;
      card(
        body,
        n.displayName,
        `${n.personality}\n지금: ${MAPS[schedule.mapId]?.name} · ${schedule.activity}\n친밀도 ${m?.friendship?.[n.id] ?? 0}/100\n오늘의 부탁: ${request.name} 2개 → ${request.price * 3} G`,
        [
          action("가까이에서 대화", () =>
            c.send("talkNpc", { targetId: n.id }),
          ),
          action("부탁 전달", () =>
            c.send("deliverRequest", { targetId: n.id }),
          ),
        ],
      );
    });
    return true;
  }
  if (type === "dialogue" && c.dialogue) {
    const d = c.dialogue,
      page = Math.min(c.dialoguePage, d.lines.length - 1);
    card(
      body,
      d.name,
      d.lines[page] ?? "",
      [
        action(page < d.lines.length - 1 ? "이야기 계속 →" : "다시 듣기", () =>
          c.page(page < d.lines.length - 1 ? page + 1 : 0),
        ),
      ],
      `${page + 1}/${d.lines.length}`,
    );
    if (NPCS.some((n) => n.id === d.npcId)) {
      card(
        body,
        "작은 마음 전하기",
        "주민에게 하루 한 번 선물할 수 있어요. 좋아하는 선물은 더 반가워해요.",
        [
          action("오늘 부탁 전달", () =>
            c.send("deliverRequest", { targetId: d.npcId }),
          ),
        ],
      );
      for (const [id, count] of Object.entries(m?.inventory ?? {})
        .filter(([id]) =>
          ["crop", "fish", "forage", "produce"].includes(ITEMS[id]?.kind ?? ""),
        )
        .slice(0, 12))
        body.append(
          action(`${itemName(id)} ×${count} 선물`, () =>
            c.send("giftNpc", { targetId: d.npcId, itemId: id }),
          ),
        );
    }
    return true;
  }
  if (type === "animals") {
    const animal = c.entities.find(
        (e) => e.id === c.targetId && e.kind === "animal",
      ),
      barn = c.entities.find((e) => e.kind === "barn");
    card(
      body,
      "사계절 우리",
      "먹이 → 다음 아침 생산물. 쓰다듬기는 하루 한 번, 가족 중 한 명이 하면 함께 돌본 것으로 기록돼요. 먹이는 상점에서 살 수 있어요.",
    );
    const near = c.players.find((p) => p.local);
    const closeEnough = (e?: Entity) =>
      Boolean(
        near &&
          e &&
          near.area === e.area &&
          Math.hypot(near.x - e.x, near.y - e.y) <= 64,
      );
    for (const [id, d] of Object.entries(ANIMALS))
      card(
        body,
        `${d.icon} ${d.name}`,
        `${d.price} G · 매일 ${itemName(d.produce)}`,
        [
          action(
            "우리 앞에서 구입",
            () => c.send("buyAnimal", { targetId: barn?.id, itemId: id }),
            !closeEnough(barn),
          ),
        ],
      );
    const animals = c.entities
      .filter((e) => e.kind === "animal")
      .sort(
        (a, b) => Number(b.id === animal?.id) - Number(a.id === animal?.id),
      );
    for (const e of animals) {
      const d = ANIMALS[e.crop as keyof typeof ANIMALS];
      card(
        body,
        `${d?.icon ?? ""} ${d?.name ?? "동물"}`,
        `마음 ${e.hp}/100 · ${e.stage === c.day ? "오늘 먹이 완료" : "먹이가 필요해요"} · 생산물 ${e.quantity}개`,
        [
          action(
            "먹이",
            () => c.send("feedAnimal", { targetId: e.id }),
            !closeEnough(e) || e.stage === c.day,
          ),
          action(
            "쓰다듬기",
            () => c.send("petAnimal", { targetId: e.id }),
            !closeEnough(e) || e.owner === String(c.day),
          ),
          action(
            "생산물 받기",
            () => c.send("collectAnimal", { targetId: e.id }),
            !closeEnough(e) || !e.quantity,
          ),
        ],
      );
    }
    return true;
  }
  if (type === "decoration") {
    card(
      body,
      "나만의 작은 정원",
      "가방의 장식을 선택해 앞칸에 놓으세요. 밭과 건물은 비워 둡니다. 장식은 이동을 막지 않으며 내가 놓은 물건은 회수할 수 있어요.",
    );
    for (const [id, d] of Object.entries(DECORATIONS))
      card(
        body,
        d.name,
        `공방: 목재 ${d.wood}개 · 상점: ${d.price} G · 소지 ${m?.inventory[id] ?? 0}`,
        [
          action(
            "앞칸에 배치",
            () => {
              c.close();
              c.send("placeDecoration", { itemId: id });
            },
            !m?.inventory[id],
          ),
        ],
      );
    const e = c.entities.find(
      (e) => e.id === c.targetId && e.kind === "decoration",
    );
    if (e)
      body.append(
        action("이 장식 회수", () => {
          c.send("removeDecoration", { targetId: e.id });
          c.close();
        }),
      );
    return true;
  }
  if (type === "map") {
    card(
      body,
      MAPS[c.area]?.name ?? c.area,
      "농장 남쪽 → 들꽃길 → 마을. 들꽃길에서 숲과 광산, 마을 동쪽에서 해안으로 갈 수 있어요. 지도는 안내용이며 순간이동하지 않아요.",
    );
    const map = MAPS[c.area];
    if (map) {
      const canvas = element("canvas");
      canvas.className = "area-map";
      canvas.width = map.width * 10;
      canvas.height = map.height * 10;
      body.append(canvas);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = c.area.startsWith("mine") ? "#667778" : "#acc18c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const r of [
        ...map.terrainRegions,
        ...map.farmAreas.map((f) => ({ ...f, tileType: "farm" })),
      ]) {
        ctx.fillStyle =
          r.tileType === "water"
            ? "#70a9bc"
            : r.tileType === "farm"
              ? "#aa8054"
              : "#d9c698";
        ctx.fillRect(
          r.startX * 10,
          r.startY * 10,
          (r.endX - r.startX + 1) * 10,
          (r.endY - r.startY + 1) * 10,
        );
      }
      ctx.font = "9px sans-serif";
      for (const warp of map.warps) {
        ctx.fillStyle = "#fff8da";
        ctx.fillRect(warp.area.startX * 10, warp.area.startY * 10, 13, 13);
        ctx.fillStyle = "#355343";
        ctx.fillText(
          MAPS[warp.targetMapId]?.name ?? warp.id,
          Math.min(canvas.width - 50, warp.area.startX * 10),
          Math.max(10, warp.area.startY * 10 - 3),
        );
      }
      for (const p of c.players.filter((p) => p.area === c.area)) {
        ctx.fillStyle = p.local ? "#d66751" : "#546eaf";
        ctx.beginPath();
        ctx.arc((p.x / 32) * 10, (p.y / 32) * 10, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const n of NPCS) {
        const s = npcSchedule(n, c.day, c.minute);
        if (s.mapId === c.area) {
          ctx.fillStyle = "#6a4f77";
          ctx.fillRect(s.from.x * 10 - 2, s.from.y * 10 - 2, 4, 4);
        }
      }
      body.append(
        element(
          "p",
          "● 주황: 나 · 파랑: 가족 · 보라: 주민 · 밝은 표식: 출입구",
          "muted",
        ),
      );
    }
    tabs(body, [
      ["주민 위치", () => c.open("residents", "우리 마을 사람들")],
      ["낚시 수역", () => c.open("fish", "물결 도감")],
    ]);
    return true;
  }
  if (type === "settings") {
    card(
      body,
      "소리와 화면",
      "음악은 첫 터치 후 시작해요. 이 기기에서만 설정을 기억합니다.",
      [
        action(c.audio.enabled ? "소리 끄기" : "소리 켜기", () => {
          void c.audio.unlock();
          c.audio.setEnabled(!c.audio.enabled);
          c.open("settings", "설정");
        }),
      ],
    );
    for (const [label, min, max, step, value, fn] of [
      ["음량", 0, 1, 0.05, c.audio.volume, (v: number) => c.audio.setVolume(v)],
      [
        "카메라 확대",
        0.65,
        2,
        0.05,
        Number(localStorage.getItem("farm-zoom") ?? 1),
        (v: number) => {
          c.zoom(v);
          localStorage.setItem("farm-zoom", String(v));
        },
      ],
      [
        "글자 크기",
        0.9,
        1.2,
        0.05,
        Number(localStorage.getItem("farm-ui-scale") ?? 1),
        (v: number) => {
          document.documentElement.style.setProperty("--ui-scale", String(v));
          localStorage.setItem("farm-ui-scale", String(v));
        },
      ],
    ] as const) {
      const wrap = element("label", label, "range-row"),
        input = element("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.setAttribute("aria-label", label);
      input.addEventListener("input", () => fn(Number(input.value)));
      wrap.append(input);
      body.append(wrap);
    }
    card(
      body,
      "조작 안내",
      "조이스틱 + RUN은 두 손가락으로 함께 사용할 수 있어요. 행동을 누른 채 걸으면 연속 심기, 달리면서는 심지 않아요. 화면을 두 손가락으로 벌리면 카메라가 확대됩니다.",
    );
    return true;
  }
  return false;
}
