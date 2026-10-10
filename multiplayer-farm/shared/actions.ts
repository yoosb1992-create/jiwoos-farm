import { placementAllowed, inRect } from "./world2.js";
import { worldNpcSchedule } from "./world2-runtime.js";
import {
  CROPS,
  RECIPES,
  ITEMS,
  MAPS,
  TILE,
  mapFor,
  tileIn,
  NPCS,
  npcSchedule,
} from "./content.js";
import { isFarmable, frontTile } from "./applyMovement.js";
import {
  ACTION_RANGE,
  MAX_QUANTITY,
  STAMINA_MAX,
  addDrop,
  entity,
  generateDaily,
  random,
  type World,
  type Actor,
  type Command,
  type ActionResult,
  type Entity,
} from "./world.js";
import {
  calendar,
  SEASON_INFO,
  FORAGE,
  ANIMALS,
  DECORATIONS,
  QUESTS,
  festivalOn,
  fishingSpot,
  FISH_CATALOG,
} from "./expansion.js";
import { FISH_STEP_MS, FISH_MAX_STEPS, replayFishing } from "./fishing.js";
import { safeSpawn } from "./regions.js";
import { collidesWithObstacle } from "./applyMovement.js";
export class ActionError extends Error {}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ActionError(message);
}
const TYPES = new Set([
  "worldEvent",
  "tillTile",
  "plantSeed",
  "waterCrop",
  "harvestCrop",
  "hitTree",
  "hitRock",
  "clearTwig",
  "pickupDrop",
  "gather",
  "depositChest",
  "withdrawChest",
  "craftItem",
  "placeMachine",
  "startMachine",
  "collectMachine",
  "sleepVote",
  "enterArea",
  "mineAction",
  "castFishing",
  "hookFishing",
  "cancelFishing",
  "buyAnimal",
  "feedAnimal",
  "petAnimal",
  "collectAnimal",
  "placeDecoration",
  "removeDecoration",
  "claimQuest",
  "claimSeason",
  "deliverRequest",
  "giftNpc",
  "attendFestival",
  "fishingResult",
  "talkNpc",
  "buyItem",
  "sellItem",
  "eat",
  "refill",
  "upgradeTool",
]);
export function parseCommand(value: unknown): Command {
  requireThat(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "잘못된 명령",
  );
  const c = value as Record<string, unknown>;
  requireThat(
    typeof c.actionId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(c.actionId),
    "행동 ID 오류",
  );
  requireThat(
    typeof c.type === "string" && TYPES.has(c.type),
    "지원하지 않는 행동",
  );
  const out: Command = { actionId: c.actionId, type: c.type };
  for (const key of ["targetId", "itemId", "area"] as const) {
    if (c[key] !== undefined) {
      requireThat(
        typeof c[key] === "string" && c[key].length <= 100,
        "대상 오류",
      );
      out[key] = c[key];
    }
  }
  for (const key of ["tileX", "tileY", "quantity"] as const) {
    if (c[key] !== undefined) {
      requireThat(
        typeof c[key] === "number" &&
          Number.isSafeInteger(c[key]) &&
          Math.abs(c[key]) <= 9999,
        "수량/좌표 오류",
      );
      out[key] = c[key];
    }
  }
  if (c.inputs !== undefined) {
    requireThat(
      Array.isArray(c.inputs) &&
        c.inputs.length <= FISH_MAX_STEPS &&
        c.inputs.every((n) => n === 0 || n === 1),
      "낚시 입력 오류",
    );
    out.inputs = c.inputs as number[];
  }
  if (c.value !== undefined) {
    requireThat(typeof c.value === "boolean", "투표 오류");
    out.value = c.value;
  }
  return out;
}
export interface ActionContext {
  now: number;
  online: string[];
  votes: Set<string>;
}
export function nextDay(w: World): void {
  const previousDay = w.day;
  w.day++;
  w.minute = 360;
  const season = calendar(w.day).season;
  w.weather =
    random(w.seed + w.day)() < 0.3
      ? season === "winter"
        ? "snow"
        : "rain"
      : "clear";
  for (const e of Object.values(w.entities)) {
    if (e.kind === "crop") {
      const crop = CROPS[e.crop];
      if (!crop?.seasons.includes(season)) {
        e.kind = "withered";
        e.watered = false;
        continue;
      }
      if (e.watered) e.stage = Math.min(crop.growthDays, e.stage + 1);
      e.watered = w.weather === "rain";
    } else if (e.kind === "soil") {
      // Bare tilled soil can be watered too. It dries the next morning unless rain
      // waters it again, matching the same daily visual state as planted soil.
      e.watered = w.weather === "rain";
    }
    if (e.kind === "animal" && e.stage === previousDay) {
      e.quantity = Math.min(5, e.quantity + 1);
      e.readyAt = w.day;
    }
  }
  for (const m of Object.values(w.members)) {
    m.stamina = 100;
    m.water = 30;
    delete m.fishing;
  }
  generateDaily(w);
}
export function applyAction(
  w: World,
  a: Actor,
  c: Command,
  ctx: ActionContext,
): ActionResult {
  const m = w.members[a.id];
  requireThat(m, "플레이어 없음");
  m.stamina = Math.min(m.stamina, a.stamina);
  const result: ActionResult = {
    actionId: c.actionId,
    ok: true,
    message: "완료",
    revision: w.revision + 1,
    serverNow: ctx.now,
  };
  const near = (e: Pick<Entity, "area" | "x" | "y">, r = ACTION_RANGE) => {
    requireThat(
      e.area === a.area && Math.hypot(e.x - a.x, e.y - a.y) <= r,
      "대상에 더 가까이 가세요",
    );
  };
  const target = (kind?: string) => {
    const e = c.targetId ? w.entities[c.targetId] : undefined;
    requireThat(
      e && (!kind || e.kind === kind),
      "대상이 없거나 이미 처리됐습니다",
    );
    near(e);
    return e;
  };
  const front = (e: Pick<Entity, "x" | "y">) => {
    const dx = e.x - a.x,
      dy = e.y - a.y;
    requireThat(
      a.facing === "left"
        ? dx <= 16
        : a.facing === "right"
          ? dx >= -16
          : a.facing === "up"
            ? dy <= 16
            : dy >= -16,
      "앞쪽 대상을 바라보세요",
    );
  };
  const own = (id: string, n = 1) =>
    requireThat((m.inventory[id] ?? 0) >= n, "재료 또는 도구가 부족합니다");
  const spend = (n: number) => {
    requireThat(m.stamina >= n, "기력이 부족합니다");
    m.stamina -= n;
  };
  const change = (bag: Record<string, number>, id: string, n: number) => {
    requireThat(ITEMS[id] && Number.isInteger(n), "아이템 오류");
    const v = (bag[id] ?? 0) + n;
    requireThat(v >= 0 && v <= 999999, "수량 부족 또는 보관 한도");
    requireThat(
      bag !== m.inventory || v === 0 || bag[id] || Object.keys(bag).length < 48,
      "가방이 가득 찼어요. 보관함에 옮기거나 판매하세요",
    );
    bag[id] = v;
    if (v === 0) delete bag[id];
  };
  const tile = () => {
    const t = frontTile(a);
    const x = c.tileX ?? t.tileX,
      y = c.tileY ?? t.tileY;
    requireThat(
      x === t.tileX && y === t.tileY,
      "앞칸에서만 사용할 수 있습니다",
    );
    requireThat(
      isFarmable(a.area, x, y, w.layout?.maps),
      "경작 가능한 밭이 아닙니다",
    );
    const p = { area: a.area, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    near(p);
    return { ...p, id: `soil-${a.area}-${x}-${y}` };
  };
  const q = c.quantity ?? 1;
  requireThat(q >= 1 && q <= MAX_QUANTITY, "수량은 1~999입니다");
  switch (c.type) {
    case "worldEvent": {
      const e = mapFor(a.area, w.layout?.maps).world2?.events.find(
        (e) => e.id === c.targetId,
      );
      requireThat(
        e && inRect(e.area, Math.floor(a.x / TILE), Math.floor(a.y / TILE)),
        "이벤트 영역 밖입니다",
      );
      const key = `event-${a.area}-${e.id}-${e.once ? "once" : w.day}`;
      requireThat(!m.quests[key], "이미 실행한 이벤트입니다");
      requireThat(
        e.trigger === "enter" ||
          e.trigger === "interact" ||
          (e.trigger === "date" && String(w.day) === e.condition) ||
          (e.trigger === "time" && w.minute >= Number(e.condition)) ||
          (e.trigger === "weather" && w.weather === e.condition) ||
          (e.trigger === "season" && calendar(w.day).season === e.condition) ||
          (e.trigger === "quest" && !!m.quests[e.condition]),
        "이벤트 조건 전입니다",
      );
      if (e.action === "item") {
        requireThat(ITEMS[e.value], "이벤트 아이템 오류");
        change(m.inventory, e.value, e.quantity);
      }
      if (e.action === "quest")
        m.quests[e.value] = (m.quests[e.value] ?? 0) + e.quantity;
      if (e.action === "dialogue")
        result.dialogue = {
          name: e.name,
          npcId: "world-event",
          lines: [e.value],
        };
      if (e.action === "warp") {
        requireThat(
          e.destination && w.layout?.maps[e.destination],
          "이벤트 목적지 없음",
        );
        const p = safeSpawn(e.destination, e.spawn, w.layout.maps);
        result.transition = { area: e.destination, x: p.x, y: p.y };
      }
      m.quests[key] = 1;
      result.message = e.action === "effect" ? `✦ ${e.value}` : e.name;
      break;
    }
    case "tillTile": {
      own("hoe");
      const t = tile();
      requireThat(
        !w.entities[t.id] || w.entities[t.id]!.kind === "withered",
        "이미 경작한 밭",
      );
      spend(2);
      w.entities[t.id] = entity(
        t.id,
        t.area,
        "soil",
        t.x,
        t.y,
        "tile_farm_empty",
      );
      break;
    }
    case "plantSeed": {
      requireThat(!a.running, "달리는 동안 씨앗을 심을 수 없습니다");
      const t = tile(),
        e = w.entities[t.id];
      requireThat(e?.kind === "soil", "빈 밭이 필요합니다");
      const crop = Object.values(CROPS).find((x) => x.seedItemId === c.itemId);
      requireThat(crop, "씨앗을 선택하세요");
      requireThat(
        crop.seasons.includes(calendar(w.day).season),
        "이 계절에는 심을 수 없어요. 씨앗 도감을 확인하세요",
      );
      own(crop.seedItemId);
      spend(1);
      change(m.inventory, crop.seedItemId, -1);
      e.kind = "crop";
      e.crop = crop.id;
      e.stage = 0;
      // Preserve pre-watered tilled soil when a seed is planted into it.
      e.watered = e.watered || w.weather === "rain";
      break;
    }
    case "waterCrop": {
      own("water");
      const t = tile(),
        e = w.entities[t.id];
      requireThat(
        (e?.kind === "soil" || e?.kind === "crop") && !e.watered,
        "물을 줄 경작지가 없습니다",
      );
      requireThat(m.water > 0, "우물에서 물을 채우세요");
      spend(1);
      m.water--;
      e.watered = true;
      break;
    }
    case "harvestCrop": {
      const t = tile(),
        e = w.entities[t.id];
      requireThat(e?.kind === "crop", "작물이 없습니다");
      const crop = CROPS[e.crop];
      requireThat(crop && e.stage >= crop.growthDays, "아직 자라고 있어요");
      spend(1);
      addDrop(w, e, crop.harvestItemId, 1);
      e.kind = crop.regrowDays ? "crop" : "soil";
      e.crop = crop.regrowDays ? crop.id : "";
      e.stage = crop.regrowDays ? crop.growthDays - crop.regrowDays : 0;
      e.watered = false;
      m.xp += 5;
      m.quests.harvest = (m.quests.harvest ?? 0) + 1;
      const c = calendar(w.day),
        key = `harvest-${c.year}-${c.season}`;
      m.quests[key] = (m.quests[key] ?? 0) + 1;
      break;
    }
    case "hitTree": {
      const authored = mapFor(a.area, w.layout?.maps).objects.find(
        (o) => o.id === c.targetId,
      );
      requireThat(
        authored?.tree?.chop !== false,
        "이 나무는 벌목할 수 없습니다",
      );
      own("axe");
      const e = target();
      requireThat(e.kind === "tree" || e.kind === "stump", "나무가 아닙니다");
      front(e);
      spend(3);
      e.hp -= m.toolLevel >= 2 ? 2 : 1;
      if (e.hp <= 0) {
        if (e.kind === "tree") {
          addDrop(
            w,
            e,
            authored?.tree?.drop && ITEMS[authored.tree.drop]
              ? authored.tree.drop
              : "wood",
            1,
          );
          addDrop(w, e, "pine_needles", 1);
          addDrop(w, e, "pine_cone", 1);
          e.kind = "stump";
          e.asset = "stump";
          e.hp = 3;
        } else {
          addDrop(w, e, "wood", 1);
          delete w.entities[e.id];
        }
        m.xp += 5;
      }
      break;
    }
    case "hitRock": {
      own("pickaxe");
      const e = target("rock");
      front(e);
      spend(e.id.startsWith("farmdebris-") ? 1 : 3);
      e.hp -= m.toolLevel >= 2 ? 2 : 1;
      if (e.hp <= 0) {
        addDrop(w, e, e.item || "stone", 1);
        delete w.entities[e.id];
        m.xp += e.id.startsWith("farmdebris-") ? 1 : 5;
        if (!e.id.startsWith("farmdebris-"))
          m.quests.mine = (m.quests.mine ?? 0) + 1;
        if (a.area.startsWith("mine")) {
          const id = `ladder-${a.area}`;
          if (!w.entities[id])
            w.entities[id] = entity(
              id,
              a.area,
              "ladder",
              e.x,
              e.y,
              "mine_ladder",
            );
        }
      }
      break;
    }
    case "clearTwig": {
      own("axe");
      const e = target("twig");
      front(e);
      spend(1);
      addDrop(w, e, e.item || "wood", 1);
      delete w.entities[e.id];
      m.xp += 1;
      break;
    }
    case "gather": {
      const e = target("gather");
      spend(1);
      addDrop(w, e, e.item, 1);
      delete w.entities[e.id];
      break;
    }
    case "pickupDrop": {
      const e = target("drop");
      change(m.inventory, e.item, e.quantity);
      m.collections ??= {};
      m.collections[e.item] = (m.collections[e.item] ?? 0) + e.quantity;
      delete w.entities[e.id];
      break;
    }
    case "depositChest":
    case "withdrawChest": {
      target("chest");
      requireThat(
        c.itemId && ITEMS[c.itemId] && ITEMS[c.itemId]!.kind !== "tool",
        "보관할 자원을 선택하세요",
      );
      const into = c.type === "depositChest";
      change(into ? m.inventory : w.chest, c.itemId, -q);
      change(into ? w.chest : m.inventory, c.itemId, q);
      break;
    }
    case "craftItem": {
      target("craft");
      const recipe = c.itemId ? RECIPES[c.itemId] : undefined;
      requireThat(recipe, "제작법 없음");
      for (const i of recipe.ingredients) own(i.itemId, i.quantity * q);
      for (const i of recipe.ingredients)
        change(m.inventory, i.itemId, -i.quantity * q);
      change(m.inventory, recipe.output.itemId, recipe.output.quantity * q);
      break;
    }
    case "placeMachine": {
      own("wood_processor");
      requireThat(
        placementAllowed(
          mapFor(a.area, w.layout?.maps),
          "building",
          frontTile(a).tileX,
          frontTile(a).tileY,
        ),
        "건물 배치 가능 영역에 놓으세요",
      );
      const t = frontTile(a);
      const p = { x: (t.tileX + 0.5) * TILE, y: (t.tileY + 0.5) * TILE };
      requireThat(
        !collidesWithObstacle(p.x, p.y, a.area, w.layout?.maps) &&
          !Object.values(w.entities).some(
            (e) => e.area === a.area && Math.hypot(e.x - p.x, e.y - p.y) < 24,
          ),
        "빈 자리에 배치하세요",
      );
      change(m.inventory, "wood_processor", -1);
      const id = `machine-${++w.nextEntity}`;
      w.entities[id] = entity(
        id,
        a.area,
        "machine",
        p.x,
        p.y,
        "wood_processor",
      );
      break;
    }
    case "startMachine": {
      const e = target("machine");
      requireThat(e.readyAt === 0, "가공 중입니다");
      own("wood", 2);
      change(m.inventory, "wood", -2);
      e.readyAt = (w.day - 1) * 1440 + w.minute + 120;
      e.item = "wood_plank";
      e.quantity = 1;
      break;
    }
    case "collectMachine": {
      const e = target("machine");
      requireThat(
        e.readyAt > 0 && (w.day - 1) * 1440 + w.minute >= e.readyAt,
        "아직 가공 중입니다",
      );
      change(m.inventory, e.item, e.quantity);
      e.readyAt = 0;
      e.quantity = 0;
      e.item = "";
      break;
    }
    case "sleepVote": {
      requireThat(
        ["farm", "farmhouse"].includes(a.area),
        "농장으로 돌아와 잠자기 투표하세요",
      );
      if (c.value === false) ctx.votes.delete(a.id);
      else ctx.votes.add(a.id);
      if (
        ctx.online.length > 0 &&
        ctx.online.every((id) => ctx.votes.has(id))
      ) {
        nextDay(w);
        ctx.votes.clear();
        result.message = "새로운 아침입니다";
      } else result.message = "잠자기 투표를 기다립니다";
      break;
    }
    case "enterArea": {
      const map = mapFor(a.area, w.layout?.maps);
      const warp = map.warps.find((x) => x.id === c.targetId);
      requireThat(warp, "입구 없음");
      const px = a.x / TILE,
        py = a.y / TILE;
      requireThat(
        px >= warp.area.startX - 1 &&
          px <= warp.area.endX + 2 &&
          py >= warp.area.startY - 1 &&
          py <= warp.area.endY + 2,
        "입구로 이동하세요",
      );
      const dest = mapFor(warp.targetMapId, w.layout?.maps);
      const spawn = safeSpawn(dest.id, warp.targetSpawnId, w.layout!.maps);
      result.transition = {
        area: dest.id,
        x: spawn.x,
        y: spawn.y,
        facing: warp.facing ?? spawn.facing,
        effect: warp.effect ?? "fade",
      };
      break;
    }
    case "mineAction": {
      const e = target("ladder");
      requireThat(a.area.startsWith("mine"), "광산이 아닙니다");
      const floor = Number(a.area.slice(4));
      requireThat(floor < 5, "마지막 층입니다");
      w.deepest = Math.max(w.deepest, floor + 1);
      result.transition = {
        area: `mine${floor + 1}`,
        ...safeSpawn(`mine${floor + 1}`, undefined, w.layout!.maps),
      };
      break;
    }
    case "refill": {
      own("water");
      target("well");
      m.water = 30;
      break;
    }
    case "eat": {
      const id = c.itemId ?? "stamina_biscuit",
        food = ITEMS[id];
      requireThat(food && (food.energy ?? 0) > 0, "먹을 수 없는 아이템이에요");
      own(id);
      requireThat(m.stamina < STAMINA_MAX, "기력이 충분합니다");
      change(m.inventory, id, -1);
      m.stamina = Math.min(100, m.stamina + food.energy!);
      result.message = `${food.name} · 기력 +${food.energy}`;
      break;
    }
    case "upgradeTool": {
      target("craft");
      requireThat(m.toolLevel < 2, "현재 최고 단계입니다");
      own("copper_ore", 5);
      own("wood", 5);
      change(m.inventory, "copper_ore", -5);
      change(m.inventory, "wood", -5);
      m.toolLevel = 2;
      break;
    }
    case "buyItem":
    case "sellItem": {
      requireThat(
        a.area === "general_store" || a.area === "cafe",
        "상점 또는 찻집 안에서 거래하세요",
      );
      requireThat(c.itemId && ITEMS[c.itemId], "아이템 없음");
      if (c.type === "buyItem") {
        const crop = Object.values(CROPS).find(
          (cr) => cr.seedItemId === c.itemId,
        );
        const decor = DECORATIONS[c.itemId as keyof typeof DECORATIONS];
        const costEach =
          crop?.seedPrice ??
          decor?.price ??
          (
            {
              stamina_biscuit: 10,
              animal_feed: 8,
              herb_tea: 45,
              harvest_stew: 95,
            } as Record<string, number>
          )[c.itemId];
        requireThat(
          costEach && (!crop || crop.seasons.includes(calendar(w.day).season)),
          "지금 판매하지 않는 물품이에요",
        );
        const cost = costEach * q;
        requireThat(m.money >= cost, "골드 부족");
        m.money -= cost;
        change(m.inventory, c.itemId, q);
      } else {
        const price = ITEMS[c.itemId]?.sellPrice ?? 0;
        requireThat(price > 0, "판매할 수 없습니다");
        change(m.inventory, c.itemId, -q);
        m.money += price * q;
      }
      break;
    }
    case "talkNpc":
    case "giftNpc":
    case "deliverRequest": {
      const npc = NPCS.find((n) => n.id === c.targetId);
      requireThat(npc, "주민 없음");
      const schedule = worldNpcSchedule(
        npc,
        w.day,
        w.minute,
        w.layout?.maps ?? MAPS,
      );
      near(
        {
          area: schedule.mapId,
          x: schedule.from.x * TILE,
          y: schedule.from.y * TILE,
        },
        96,
      );
      m.friendship ??= {};
      if (c.type === "giftNpc") {
        requireThat(
          c.itemId && ITEMS[c.itemId]?.kind !== "tool",
          "선물할 아이템을 고르세요",
        );
        requireThat(
          !m.quests[`gift-${npc.id}-${w.day}`],
          "오늘은 이미 선물을 받았어요",
        );
        own(c.itemId);
        change(m.inventory, c.itemId, -1);
        const liked = npc.giftPreferences.loved.includes(c.itemId);
        m.friendship[npc.id] = Math.min(
          100,
          (m.friendship[npc.id] ?? 0) + (liked ? 12 : 5),
        );
        m.quests[`gift-${npc.id}-${w.day}`] = 1;
        result.message = liked
          ? `${npc.name}: 정말 좋아하는 선물이야!`
          : `${npc.name}: 마음을 담아 줘서 고마워요.`;
        break;
      }
      if (c.type === "deliverRequest") {
        const need = FORAGE.filter((f) =>
          f.seasons.includes(calendar(w.day).season),
        )[
          NPCS.indexOf(npc) %
            FORAGE.filter((f) => f.seasons.includes(calendar(w.day).season))
              .length
        ]!;
        requireThat(
          !m.quests[`delivery-${npc.id}-${w.day}`],
          "오늘 부탁은 이미 도와주셨어요",
        );
        own(need.id, 2);
        change(m.inventory, need.id, -2);
        m.money += need.price * 3;
        m.friendship[npc.id] = Math.min(100, (m.friendship[npc.id] ?? 0) + 8);
        m.quests[`delivery-${npc.id}-${w.day}`] = 1;
        result.message = `${npc.name}: ${need.name} 고마워요! ${need.price * 3}골드`;
        break;
      }
      const key = `talk-${npc.id}-${w.day}`;
      const first = !m.friendship[npc.id];
      if (!m.quests[key]) {
        m.quests[key] = 1;
        m.xp++;
        m.quests.talk = (m.quests.talk ?? 0) + 1;
        m.friendship[npc.id] = Math.min(100, (m.friendship[npc.id] ?? 0) + 2);
      }
      const season = calendar(w.day).season;
      const seasonLine = {
        spring: "새싹이 고개를 내미는 봄이 왔어요. 꽃편지의 날은 12일이에요.",
        summer: "여름 그늘 아래 잠깐 쉬어요. 18일 저녁은 물결등불 밤이에요.",
        autumn: "낙엽 아래 버섯을 찾아보세요. 20일 황금식탁 잔치에서 만나요.",
        winter:
          "설근 작물과 광산, 겨울 낚시는 어때요? 16일에는 눈별 소원제가 열려요.",
      }[season];
      const condition =
        w.weather === "rain"
          ? "비 오는 날은 물뿌리개를 쉬어도 돼요. 강에는 특별한 물고기도 나타나요."
          : w.weather === "snow"
            ? "눈이 와도 겨울 작물에는 직접 물을 주세요. 따뜻한 차를 챙겨요."
            : w.minute >= 1080
              ? "어두워지기 전에 가족들과 오늘 이야기를 나눠요."
              : seasonLine;
      const familiar =
        (m.friendship[npc.id] ?? 0) >= 30
          ? "이젠 당신을 만나면 오래된 친구를 만난 기분이에요."
          : npc.personality;
      result.dialogue = {
        npcId: npc.id,
        name: npc.displayName,
        lines: [
          "dialogue" in schedule && schedule.dialogue
            ? String(schedule.dialogue)
            : first
              ? npc.dialogue.first[0]!
              : npc.dialogue.general[w.day % npc.dialogue.general.length]![0]!,
          condition,
          familiar,
        ],
      };
      result.message = `${npc.name}와 이야기를 나눴어요`;
      if (
        npc.id === "boram" &&
        (m.quests.harvest ?? 0) >= 3 &&
        !m.quests.harvestReward
      ) {
        m.money += 100;
        m.quests.harvestReward = 1;
        result.dialogue.lines.push("첫 수확을 축하해! 100골드를 선물할게.");
      }
      break;
    }
    case "claimQuest": {
      const quest = QUESTS.find((q) => q.id === c.targetId);
      requireThat(
        quest && (m.quests[quest.stat] ?? 0) >= quest.goal,
        "아직 목표를 달성하지 못했어요",
      );
      requireThat(!m.quests[`reward-${quest.id}`], "이미 받은 보상이에요");
      m.quests[`reward-${quest.id}`] = 1;
      m.money += quest.gold;
      result.message = `${quest.title} 완료 · ${quest.gold}골드`;
      break;
    }
    case "claimSeason": {
      const cal = calendar(w.day),
        key = `${cal.year}-${cal.season}`;
      requireThat(
        (m.quests[`harvest-${key}`] ?? 0) >= 8 && !m.quests[`season-${key}`],
        "이번 계절 작물 8개를 수확하면 받을 수 있어요",
      );
      m.quests[`season-${key}`] = 1;
      m.money += 180;
      result.message = `${SEASON_INFO[cal.season].name} 수확 일기 완성 · 180골드`;
      break;
    }
    case "attendFestival": {
      const f = festivalOn(w.day),
        cal = calendar(w.day);
      requireThat(
        f && f.id === c.targetId && w.minute >= f.from && w.minute <= f.to,
        "아직 행사 시간이 아니에요",
      );
      near({ area: "town", x: 17 * TILE, y: 11 * TILE }, 260);
      const key = `festival-${cal.year}-${f.id}`;
      requireThat(!m.quests[key], "올해의 행사 선물은 이미 받았어요");
      change(m.inventory, f.gift, f.quantity);
      m.money += 60;
      m.quests[key] = 1;
      result.dialogue = {
        name: f.name,
        npcId: "haneul",
        lines: [
          f.description,
          "우리 마을의 한 장면을 함께 만들어 줘서 고마워요.",
          `${ITEMS[f.gift]?.name} ${f.quantity}개와 60골드를 받았어요.`,
        ],
      };
      result.message = `${f.name} · 가족과 함께 좋은 추억을!`;
      break;
    }
    case "buyAnimal": {
      target("barn");
      const def = ANIMALS[c.itemId as keyof typeof ANIMALS];
      requireThat(def && m.money >= def.price, "동물 구입 골드가 부족해요");
      const animals = Object.values(w.entities).filter(
        (e) => e.kind === "animal",
      );
      requireThat(
        animals.length < 8,
        "우리는 최대 8마리까지 함께 지낼 수 있어요",
      );
      const animalMap = mapFor(a.area, w.layout?.maps);
      let animalPoint = {
        x: (38 + (animals.length % 4) * 2) * TILE,
        y: (12 + Math.floor(animals.length / 4) * 2) * TILE,
      };
      if (animalMap.world2) {
        let found = false;
        for (const [key, chunk] of Object.entries(animalMap.world2.chunks)) {
          if (found) break;
          for (const [index, z] of Object.entries(chunk.layers.zones ?? {})) {
            if (!(z & 8) || z & 64) continue;
            const [cx, cy] = key.split(",").map(Number),
              i = Number(index),
              x = (cx! * 16 + (i % 16) + 0.5) * TILE,
              y = (cy! * 16 + Math.floor(i / 16) + 0.5) * TILE;
            if (!collidesWithObstacle(x, y, a.area, w.layout?.maps)) {
              animalPoint = { x, y };
              found = true;
              break;
            }
          }
        }
        requireThat(found, "동물 가능 영역이 없습니다");
      }
      m.money -= def.price;
      const id = `animal-${++w.nextEntity}`,
        e = entity(
          id,
          a.area,
          "animal",
          animalPoint.x,
          animalPoint.y,
          def.asset,
        );
      e.crop = c.itemId!;
      w.entities[id] = e;
      result.message = `${def.name}가 가족이 되었어요. 매일 먹이와 인사를 주세요.`;
      break;
    }
    case "feedAnimal":
    case "petAnimal":
    case "collectAnimal": {
      const e = target("animal"),
        def = ANIMALS[e.crop as keyof typeof ANIMALS];
      requireThat(def, "동물 정보 오류");
      if (c.type === "feedAnimal") {
        requireThat(e.stage !== w.day, "오늘 먹이는 충분해요");
        own("animal_feed");
        change(m.inventory, "animal_feed", -1);
        e.stage = w.day;
        result.message = `${def.name}: 냠냠! 다음 아침에 생산물을 확인하세요.`;
      } else if (c.type === "petAnimal") {
        requireThat(e.owner !== String(w.day), "오늘은 이미 인사했어요");
        e.owner = String(w.day);
        e.hp = Math.min(100, e.hp + 5);
        m.quests.pet = (m.quests.pet ?? 0) + 1;
        result.message = `${def.name}가 기분 좋게 다가와요. ♥ ${e.hp}`;
      } else {
        requireThat(e.quantity > 0, "아직 생산물이 없어요. 매일 먹이를 주세요");
        change(m.inventory, def.produce, e.quantity);
        e.quantity = 0;
        e.readyAt = 0;
        result.message = `${ITEMS[def.produce]?.name}를 받았어요`;
      }
      break;
    }
    case "placeDecoration": {
      const def = DECORATIONS[c.itemId as keyof typeof DECORATIONS];
      requireThat(
        def &&
          placementAllowed(
            mapFor(a.area, w.layout?.maps),
            "decoration",
            frontTile(a).tileX,
            frontTile(a).tileY,
          ),
        "장식 배치 가능 영역에 놓으세요",
      );
      own(c.itemId!);
      const t = frontTile(a),
        x = (t.tileX + 0.5) * TILE,
        y = (t.tileY + 0.5) * TILE;
      requireThat(
        !collidesWithObstacle(x, y, a.area, w.layout?.maps) &&
          !isFarmable(a.area, t.tileX, t.tileY, w.layout?.maps),
        "밭과 건물을 피해서 정원에 놓아주세요",
      );
      requireThat(
        Object.values(w.entities).filter((e) => e.kind === "decoration")
          .length < 64 &&
          !Object.values(w.entities).some(
            (e) => e.area === a.area && Math.hypot(e.x - x, e.y - y) < 28,
          ),
        "다른 빈자리에 놓아주세요 (장식 최대 64개)",
      );
      change(m.inventory, c.itemId!, -1);
      const id = `decor-${++w.nextEntity}`,
        e = entity(id, a.area, "decoration", x, y, def.asset);
      e.item = c.itemId!;
      e.owner = a.id;
      w.entities[id] = e;
      result.message = `${def.name}를 놓았어요`;
      break;
    }
    case "removeDecoration": {
      const e = target("decoration");
      requireThat(e.owner === a.id, "내가 놓은 장식만 회수할 수 있어요");
      change(m.inventory, e.item, 1);
      delete w.entities[e.id];
      result.message = "장식을 가방에 담았어요";
      break;
    }
    case "castFishing": {
      own("fishing_rod");
      const spot = fishingSpot(a.area, a.x, a.y, w.layout?.maps);
      requireThat(spot, "물결 표시가 있는 물가에서 낚싯대를 사용하세요");
      requireThat(
        !m.fishing || ctx.now > m.fishing.expiresAt,
        "이미 낚시 중입니다",
      );
      spend(3);
      const rng = random(w.seed + w.day * 919 + w.nextEntity++),
        season =
          mapFor(a.area, w.layout?.maps).world2?.fishing.seasonOverride ||
          calendar(w.day).season;
      const fishConfig = mapFor(a.area, w.layout?.maps).world2?.fishing;
      const available = FISH_CATALOG.filter(
        (f) =>
          (!fishConfig ||
            fishConfig.table === "seasonal" ||
            (fishConfig.table === "common"
              ? f.difficulty < 0.6
              : f.difficulty >= 0.5)) &&
          f.seasons.includes(season) &&
          f.waters.includes(spot.water) &&
          w.minute >= f.from &&
          w.minute <= f.to &&
          (f.weather === "any" || f.weather === w.weather),
      );
      requireThat(available.length, "이 시간에는 물고기가 쉬고 있어요");
      const weights = available.map(
          (f) =>
            (1 + (fishConfig?.rareFishBonus ?? 0) * f.difficulty * 10) /
            (0.15 + f.difficulty * f.difficulty * 7),
        ),
        total = weights.reduce((a, b) => a + b, 0);
      let pick = rng() * total,
        f = available[0]!;
      for (let i = 0; i < available.length; i++) {
        pick -= weights[i]!;
        if (pick <= 0) {
          f = available[i]!;
          break;
        }
      }
      const biteAt = ctx.now + 1700 + Math.floor(rng() * 2600);
      m.fishing = {
        id: c.actionId,
        seed: Math.floor(rng() * 0x7fffffff),
        fishId: f.id,
        difficulty: f.difficulty,
        area: a.area,
        x: a.x,
        y: a.y,
        biteAt,
        expiresAt: biteAt + 3000,
        startedAt: 0,
      };
      result.fishing = { ...m.fishing };
      result.message = "찌를 바라보세요… 입질하면 챔질!";
      break;
    }
    case "hookFishing": {
      const f = m.fishing;
      requireThat(
        f &&
          f.id === c.targetId &&
          !f.startedAt &&
          ctx.now >= f.biteAt &&
          ctx.now <= f.expiresAt,
        "입질 타이밍을 놓쳤어요",
      );
      near(f, 40);
      f.startedAt = ctx.now;
      f.expiresAt = ctx.now + 25000;
      result.fishing = { ...f };
      result.message =
        "누르면 올라가고, 놓으면 내려가요. 물고기를 초록 영역에!";
      break;
    }
    case "cancelFishing": {
      delete m.fishing;
      result.message = "낚싯대를 거뒀어요";
      break;
    }
    case "fishingResult": {
      const f = m.fishing;
      requireThat(
        f && f.id === c.targetId && f.startedAt > 0 && ctx.now <= f.expiresAt,
        "낚시가 끝났어요",
      );
      near(f, 40);
      const inputs = c.inputs;
      requireThat(
        inputs && inputs.length >= 1 && inputs.length <= FISH_MAX_STEPS,
        "낚시 입력이 필요해요",
      );
      requireThat(
        ctx.now - f.startedAt >= inputs.length * FISH_STEP_MS - 150,
        "낚시 시간이 맞지 않아요",
      );
      const replay = replayFishing(inputs, f);
      requireThat(replay.done, "아직 물고기와 겨루는 중이에요");
      if (replay.won) {
        const fish = FISH_CATALOG.find((d) => d.id === f.fishId)!;
        change(m.inventory, fish.id, 1);
        m.fishBook ??= {};
        const cm =
          Math.round(
            (fish.cm[0] + (fish.cm[1] - fish.cm[0]) * random(f.seed + 72)()) *
              10,
          ) / 10;
        const old = m.fishBook[fish.id];
        m.fishBook[fish.id] = {
          count: (old?.count ?? 0) + 1,
          bestCm: Math.max(old?.bestCm ?? 0, cm),
        };
        m.quests.fish = (m.quests.fish ?? 0) + 1;
        m.xp += 3;
        result.message = `${fish.name} ${cm}cm! · ${fish.rarity} · ${fish.price}골드`;
      } else
        result.message = "물고기가 물결 속으로 돌아갔어요. 다시 도전해 봐요!";
      delete m.fishing;
      break;
    }
    default:
      throw new ActionError("지원하지 않는 행동");
  }
  const stat = (
    {
      tillTile: "till",
      plantSeed: "plant",
      waterCrop: "water",
      gather: "gather",
    } as Record<string, string>
  )[c.type];
  if (stat) m.quests[stat] = (m.quests[stat] ?? 0) + 1;
  w.events.push(`${m.nickname}: ${result.message}`);
  w.events = w.events.slice(-10);
  w.revision++;
  return result;
}
