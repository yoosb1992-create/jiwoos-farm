import {
  CROPS,
  RECIPES,
  ITEMS,
  MAPS,
  TILE,
  mapFor,
  tileIn,
  NPCS,
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
export class ActionError extends Error {}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ActionError(message);
}
const TYPES = new Set([
  "tillTile",
  "plantSeed",
  "waterCrop",
  "harvestCrop",
  "hitTree",
  "hitRock",
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
  if (c.path !== undefined) {
    requireThat(
      Array.isArray(c.path) &&
        c.path.length <= 250 &&
        c.path.every((n) => Number.isInteger(n) && n >= 0 && n < 100),
      "낚시 경로 오류",
    );
    out.path = c.path as number[];
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
  w.day++;
  w.minute = 360;
  w.weather = random(w.seed + w.day)() < 0.3 ? "rain" : "clear";
  for (const e of Object.values(w.entities))
    if (e.kind === "crop") {
      if (e.watered)
        e.stage = Math.min(CROPS[e.crop]?.growthDays ?? 0, e.stage + 1);
      e.watered = w.weather === "rain";
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
    requireThat(isFarmable(a.area, x, y), "경작 가능한 밭이 아닙니다");
    const p = { area: a.area, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    near(p);
    return { ...p, id: `soil-${a.area}-${x}-${y}` };
  };
  const q = c.quantity ?? 1;
  requireThat(q >= 1 && q <= MAX_QUANTITY, "수량은 1~999입니다");
  switch (c.type) {
    case "tillTile": {
      own("hoe");
      const t = tile();
      requireThat(!w.entities[t.id], "이미 경작한 밭");
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
      own(crop.seedItemId);
      spend(1);
      change(m.inventory, crop.seedItemId, -1);
      e.kind = "crop";
      e.crop = crop.id;
      e.stage = 0;
      e.watered = w.weather === "rain";
      break;
    }
    case "waterCrop": {
      own("water");
      const t = tile(),
        e = w.entities[t.id];
      requireThat(e?.kind === "crop" && !e.watered, "물을 줄 작물이 없습니다");
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
      e.kind = "soil";
      e.crop = "";
      e.stage = 0;
      e.watered = false;
      m.xp += 5;
      m.quests.harvest = (m.quests.harvest ?? 0) + 1;
      break;
    }
    case "hitTree": {
      own("axe");
      const e = target();
      requireThat(e.kind === "tree" || e.kind === "stump", "나무가 아닙니다");
      front(e);
      spend(3);
      e.hp -= m.toolLevel >= 2 ? 2 : 1;
      if (e.hp <= 0) {
        if (e.kind === "tree") {
          addDrop(w, e, "wood", 1);
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
      spend(3);
      e.hp -= m.toolLevel >= 2 ? 2 : 1;
      if (e.hp <= 0) {
        addDrop(w, e, e.item || "stone", 1);
        delete w.entities[e.id];
        m.xp += 5;
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
      requireThat(a.area === "farm", "농장에서 배치하세요");
      const t = frontTile(a);
      const p = { x: (t.tileX + 0.5) * TILE, y: (t.tileY + 0.5) * TILE };
      requireThat(
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
      const map = mapFor(a.area);
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
      const dest = mapFor(warp.targetMapId);
      const spawn =
        dest.spawns.find((s) => s.id === warp.targetSpawnId) ?? dest.spawns[0]!;
      result.transition = {
        area: dest.id,
        x: spawn.tileX * TILE,
        y: spawn.tileY * TILE,
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
        x: 5 * TILE,
        y: 6 * TILE,
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
      own("stamina_biscuit");
      requireThat(m.stamina < STAMINA_MAX, "기력이 충분합니다");
      change(m.inventory, "stamina_biscuit", -1);
      m.stamina = Math.min(100, m.stamina + 35);
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
      requireThat(a.area === "general_store", "상점 안에서 거래하세요");
      requireThat(c.itemId && ITEMS[c.itemId], "아이템 없음");
      if (c.type === "buyItem") {
        const allowed =
          Object.values(CROPS).some((cr) => cr.seedItemId === c.itemId) ||
          c.itemId === "stamina_biscuit";
        requireThat(allowed, "판매하지 않는 물품");
        const cost = 10 * q;
        requireThat(m.money >= cost, "골드 부족");
        m.money -= cost;
        change(m.inventory, c.itemId, q);
      } else {
        const price =
          CROPS[c.itemId]?.sellPrice ?? (c.itemId.startsWith("fish_") ? 12 : 0);
        requireThat(price > 0, "판매할 수 없습니다");
        change(m.inventory, c.itemId, -q);
        m.money += price * q;
      }
      break;
    }
    case "talkNpc": {
      const npc = NPCS.find((n) => n.id === c.targetId);
      requireThat(npc, "주민 없음");
      const schedule =
        [...npc.schedule].reverse().find((s) => s.minute <= w.minute) ??
        npc.schedule[0]!;
      near(
        {
          area: schedule.mapId,
          x: schedule.from.x * TILE,
          y: schedule.from.y * TILE,
        },
        96,
      );
      const key = `talk-${npc.id}-${w.day}`;
      result.message =
        npc.dialogue.general[w.day % npc.dialogue.general.length]![0]!;
      if (!m.quests[key]) {
        m.quests[key] = 1;
        m.xp++;
      }
      if (
        npc.id === "boram" &&
        (m.quests.harvest ?? 0) >= 3 &&
        !m.quests.harvestReward
      ) {
        m.money += 100;
        m.quests.harvestReward = 1;
        result.message = "작물 3개 수확 완료! 보람의 선물 100골드";
      }
      break;
    }
    case "castFishing": {
      own("fishing_rod");
      requireThat(
        a.area === "farm" &&
          tileIn(
            { startX: 24, endX: 29, startY: 13, endY: 14 },
            Math.floor(a.x / TILE),
            Math.floor(a.y / TILE),
          ),
        "농장 연못 북쪽 물가로 가세요",
      );
      requireThat(
        !m.fishing || ctx.now > m.fishing.expiresAt,
        "이미 낚시 중입니다",
      );
      spend(3);
      const rng = random(w.seed + w.nextEntity++);
      const size = 5;
      const walls: number[] = [];
      for (let i = 1; i < 24; i++)
        if (i >= 5 && i % 5 !== 4 && rng() < 0.3) walls.push(i);
      m.fishing = {
        id: c.actionId,
        size,
        walls,
        biteAt: ctx.now + 2000,
        expiresAt: ctx.now + 22000,
      };
      result.fishing = m.fishing;
      result.message = "2초 후 입질! 경로를 이어 물고기를 낚으세요";
      break;
    }
    case "fishingResult": {
      const f = m.fishing;
      requireThat(
        f &&
          f.id === c.targetId &&
          ctx.now >= f.biteAt &&
          ctx.now <= f.expiresAt,
        "입질 시간을 놓쳤습니다",
      );
      requireThat(
        a.area === "farm" &&
          a.x >= 23 * TILE &&
          a.x <= 30 * TILE &&
          a.y >= 12 * TILE &&
          a.y <= 15 * TILE,
        "물가에서 낚시하세요",
      );
      const path = c.path;
      requireThat(
        path && path[0] === 0 && path.at(-1) === f.size * f.size - 1,
        "도착 지점까지 이어주세요",
      );
      for (let i = 0; i < path.length; i++) {
        const n = path[i]!;
        requireThat(!f.walls.includes(n), "장애물에 닿았습니다");
        if (i) {
          const prev = path[i - 1]!;
          requireThat(
            Math.abs((n % f.size) - (prev % f.size)) +
              Math.abs(Math.floor(n / f.size) - Math.floor(prev / f.size)) ===
              1,
            "연속한 칸만 이동 가능합니다",
          );
        }
      }
      change(m.inventory, "fish_minnow", 1);
      delete m.fishing;
      m.xp += 3;
      result.message = "송사리를 낚았습니다";
      break;
    }
    default:
      throw new ActionError("지원하지 않는 행동");
  }
  w.events.push(`${m.nickname}: ${result.message}`);
  w.events = w.events.slice(-10);
  w.revision++;
  return result;
}
