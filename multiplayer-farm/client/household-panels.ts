import type { TransactionRequest } from "../shared/transactions.js";
import { UPGRADE_TOOLS, TOOL_UPGRADES, toolLevel, type UpgradeTool } from "../shared/tool-levels.js";
import { ITEMS, itemName } from "../shared/content.js";
import { recipesInCategory, visibleCraftCategories, type CraftCategory } from "./craft-categories.js";
import { itemIconSource } from "./item-icons.js";
import { canCraft, maxCrafts, transferQuantity, STACK_LIMIT } from "../shared/household.js";
import type { Command, Entity, Member } from "../shared/world.js";
import type { RenderPlayer } from "./network.js";
import { CHEST_COLORS, CHEST_NAME_LIMIT, validChestName, type ChestColor, type ChestInfo } from "../shared/chest-storage.js";

export interface ChestSettingsDraft { key: string; name: string; color: ChestColor; open: boolean; dirty: boolean }

export interface HouseholdContext {
  quantity(request: TransactionRequest): void;
  member?: Member;
  chest: Record<string, number>;
  storageReady?: boolean;
  chestInfo?: ChestInfo;
  chestDraft?: ChestSettingsDraft;
  legacyChestTarget?: string;
  day: number;
  minute: number;
  entities: Entity[];
  players: RenderPlayer[];
  targetId?: string;
  recipe: string;
  upgradeTool?: UpgradeTool;
  selectUpgradeTool?(id: UpgradeTool): void;
  category: CraftCategory;
  busy: boolean;
  connected: boolean;
  feedback: string;
  sleepVoted: boolean;
  votes: number;
  selectRecipe(id: string): void;
  selectCategory(id: CraftCategory): void;
  send(type: string, extra?: Partial<Command>): void;
  close(): void;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = cls;
  return node;
}
function button(label: string, key: string, run: () => void, disabled = false): HTMLButtonElement {
  const node = el("button", label);
  node.type = "button";
  node.dataset.focus = key;
  node.disabled = disabled;
  node.onclick = run;
  return node;
}
function icon(id: string): HTMLElement {
  const box = el("span", "", "household-icon");
  box.setAttribute("aria-hidden", "true");
  const source = itemIconSource(id);
  if (source) {
    const img = el("img");
    img.src = source;
    if (ITEMS[id]?.kind === "tool") img.className = "tool-icon";
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => box.replaceChildren(el("span", "✦"));
    box.append(img);
  } else box.textContent = "✦";
  return box;
}
export function renderHouseholdPanel(type: string, body: HTMLElement, c: HouseholdContext): boolean {
  if (!["chest", "craft", "sleep", "sleep-status"].includes(type)) return false;
  const me = c.players.find(p => p.local), m = c.member;
  const target = c.entities.find(e => e.id === c.targetId);
  const inRange = !!target && !!me && target.area === me.area &&
    Math.hypot(target.x - me.authoritativeX, target.y - me.authoritativeY) <= 64;
  const blocked = c.busy || !c.connected || !inRange || (type === "chest" && c.storageReady === false);
  const status = el("p", c.busy ? "물건을 정리하고 있어요…" : c.feedback ||
    (!c.connected ? "연결을 복구하고 있어요" : ""), "household-feedback");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  body.append(status);
  if (type === "chest" && m) {
    const info = c.chestInfo, draft = c.chestDraft;
    body.append(el("p", `${info?.size ?? 1}칸 보관함 · 이 보관함의 물품을 가족과 함께 사용해요.`, "household-note"));
    if (info?.members.includes(c.legacyChestTarget ?? "") || c.targetId === c.legacyChestTarget) body.append(el("p", "기존 공동 보관함의 물품이 이곳으로 옮겨졌어요.", "household-note"));
    if (c.storageReady === false) body.append(el("p", "보관함 정보를 준비 중이에요. 잠시 후에도 같으면 새로고침해 주세요.", "unavailable"));
    if (info) body.append(el("p", `총 무게 ${info.weightKg.toFixed(1)}kg · ${info.canCarry ? "손으로 운반 가능" : "너무 무거워요 (손 운반 한도 36kg)"}`, "household-note"));
    if (info && info.used > info.capacity) body.append(el("p", "기존 물품은 모두 보존되어 있어요. 용량 안으로 정리할 때까지 새 종류의 물품만 넣을 수 없어요.", "unavailable"));
    if (info && draft) {
      const settings = el("details", "", "chest-settings");
      settings.open = draft.open;
      settings.ontoggle = () => { draft.open = settings.open; };
      settings.append(el("summary", "보관함 설정 · 이름 / 색상 / 연결"));
      const form = el("form"), label = el("label", `이름 · 최대 ${CHEST_NAME_LIMIT}자`), input = el("input");
      input.type = "text"; input.maxLength = CHEST_NAME_LIMIT; input.value = draft.name;
      input.placeholder = "비워 두면 기본 이름을 사용해요";
      input.dataset.focus = "chest-name"; input.disabled = blocked;
      input.oninput = () => { draft.name = input.value; draft.dirty = true; };
      input.addEventListener("compositionstart", () => { input.dataset.composing = "true"; });
      input.addEventListener("compositionend", () => { input.dataset.composing = "false"; draft.name = input.value; draft.dirty = true; });
      label.append(input); form.append(label);
      const palette = el("fieldset", "", "chest-palette");
      palette.append(el("legend", "목재 색상"));
      for (const [color, colors] of Object.entries(CHEST_COLORS)) {
        const choice = button(colors.name, `chest-color-${color}`, () => {
          draft.color = color as ChestColor; draft.dirty = true;
          for (const b of palette.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === choice));
        }, blocked);
        choice.setAttribute("aria-pressed", String(draft.color === color));
        const swatch = el("span", "", "chest-swatch"); swatch.style.backgroundColor = colors.main;
        choice.prepend(swatch); palette.append(choice);
      }
      const error = el("p", "", "unavailable"); error.setAttribute("role", "status");
      const save = button("이름·색상 저장", "save-chest", () => {}, blocked); save.type = "submit";
      form.onsubmit = event => {
        event.preventDefault();
        if (!validChestName(draft.name)) { error.textContent = "이름은 제어문자 없이 20자 이내로 입력해 주세요."; return; }
        c.send("configureChest", { targetId: target?.id, chestName: draft.name, chestColor: draft.color });
      };
      form.append(palette, error, save);
      const links = el("div", "", "chest-links");

      if (info.size > 1) links.append(button("연결 해제", "unlink-chest", () => c.send("unlinkChest", { targetId: target?.id }), blocked || info.used > 0));
      settings.append(form, links, el("p", "바로 옆에 설치하면 가로로 최대 3칸까지 자동 연결돼요. 연결하면 물품이 합쳐져요. 연결 해제는 물품을 모두 꺼낸 뒤 가능해요.", "household-note"));
      body.append(settings);
    }
    const columns = el("div", "", "storage-columns");
    for (const [into, title, inventory] of [[true, "내 가방", m.inventory], [false, "가족 보관함", c.chest]] as const) {
      const section = el("section", "", into ? "storage-side bag-side" : "storage-side chest-side");
      section.setAttribute("aria-label", title);
      const entries = Object.entries(inventory).filter(([id, n]) => n > 0 && ITEMS[id]?.kind !== "tool")
        .sort(([a], [b]) => itemName(a).localeCompare(itemName(b), "ko"));
      section.append(el("h3", into ? title : info?.name ?? title), el("p", into ? `사용 중 ${Object.keys(m.inventory).length}/48칸` : `${info?.used ?? entries.length} / ${info?.capacity ?? 16}칸`, "storage-summary"));
      const stack = el("div", "", "storage-items");
      stack.dataset.scroll = into ? "bag" : "chest";
      section.append(stack);
      if (!entries.length) stack.append(el("p", into ? "보관할 물건이 없어요. 수확물과 재료를 모아 보세요." : "아직 비어 있어요. 가방에서 물건을 넣어 주세요.", "household-empty"));
      for (const [id, count] of entries) {
        const card = el("article", "", "storage-item");
        card.dataset.item = id;
        card.dataset.scrollKey = `${into ? "bag" : "chest"}-${id}`;
        const heading = el("div", "", "household-item-heading");
        heading.append(icon(id), el("strong", itemName(id)), el("span", `×${count.toLocaleString()}`, "item-count"));
        const actions = el("div", "", "quantity-actions");
        for (const mode of ["one", "half", "all"] as const) {
          const amount = mode === "one" ? 1 : transferQuantity(count, mode);
          const verb = into ? "넣기" : "꺼내기";
          const name = mode === "one" ? "1개" : mode === "half" ? `절반 (${amount.toLocaleString()})` : `전체 (${amount.toLocaleString()})`;
          const destination = into ? c.chest : m.inventory;
          const full = into ? !!info && info.used >= info.capacity : Object.keys(m.inventory).length >= 48;
          const noSlot = full && !((destination[id] ?? 0) > 0);
          const b = button(`${name} ${verb}`, `${into}-${id}-${mode}`, () => c.quantity({ type: into ? "depositChest" : "withdrawChest",
            targetId: target?.id, itemId: id, initial: Math.min(999, amount),
          }), blocked || noSlot || (destination[id] ?? 0) + amount > STACK_LIMIT);
          if (noSlot) b.title = into ? "보관함의 빈 칸이 필요해요" : "가방의 빈 칸이 필요해요";
          actions.append(b);
        }
        actions.append(button("수량 입력",`${into}-${id}-custom`,()=>c.quantity({type:into?"depositChest":"withdrawChest",targetId:target?.id,itemId:id}),blocked));
        card.append(heading, actions);
        stack.append(card);
      }
      columns.append(section);
    }
    body.append(columns);
  }
  if (type === "craft" && m) {
    body.append(el("p", c.category === "upgrade" ? "가방의 재료로 도구를 강화해요." : "가방의 재료로 바로 만들어요. 제작 횟수만큼 재료가 사용됩니다.", "household-note"));
    const workshop = el("div", "", "workshop-layout"), menu = el("aside", "", "workshop-menu");
    const categories = el("nav", "", "craft-categories");
    categories.setAttribute("aria-label", "제작 카테고리");
    categories.dataset.scroll = "categories";
    for (const category of visibleCraftCategories) {
      const tab = button(category.name, `category-${category.id}`, () => c.selectCategory(category.id));
      tab.dataset.category = category.id;
      tab.setAttribute("aria-pressed", String(c.category === category.id));
      tab.classList.toggle("selected", c.category === category.id);
      if (category.id !== "upgrade") tab.append(el("span", String(recipesInCategory(category.id).length), "category-count"));
      categories.append(tab);
    }
    workshop.append(menu);
    body.append(categories, workshop);
    if (c.category === "upgrade") {
      const selectedTool = c.upgradeTool ?? "axe";
      const list = el("nav", "", "recipe-list");
      list.setAttribute("aria-label", "강화할 도구");
      for (const id of UPGRADE_TOOLS) {
        const choice = button("", `upgrade-tool-${id}`, () => c.selectUpgradeTool?.(id));
        choice.className = `recipe-choice${selectedTool === id ? " selected" : ""}`;
        choice.setAttribute("aria-pressed", String(selectedTool === id));
        choice.append(icon(id), el("strong", itemName(id)), el("span", `Lv${toolLevel(m, id)}`, "available"));
        list.append(choice);
      }
      menu.append(list);
      const upgrade = el("section", "", "upgrade-tools"), level = toolLevel(m, selectedTool);
      upgrade.setAttribute("aria-label", "도구 강화");
      const heading = el("div", "", "household-item-heading");
      heading.append(icon(selectedTool), el("h3", `${itemName(selectedTool)} · Lv${level}`));
      upgrade.append(heading);
      const definition = TOOL_UPGRADES[selectedTool];
      if (!definition) {
        upgrade.append(el("p", "강화 효과 준비 중 · 현재 도구는 그대로 사용할 수 있어요.", "household-note"),
          button("강화 준비 중", "upgrade", () => {}, true));
      } else if (level >= 2) upgrade.append(el("p", "✓ 최고 단계 강화 완료", "available"), el("p", definition.effect));
      else {
        upgrade.append(el("p", `다음 단계 Lv${level + 1}`), el("p", definition.effect), el("h4", "필요 재료 · 보유 / 필요"));
        for (const [id, count] of Object.entries(definition.materials)) upgrade.append(el("p", `${itemName(id)} · ${m.inventory[id] ?? 0} / ${count}`, (m.inventory[id] ?? 0) >= count ? "available" : "unavailable"));
        const ready = Object.entries(definition.materials).every(([id, count]) => (m.inventory[id] ?? 0) >= count) && (m.inventory[selectedTool] ?? 0) > 0;
        upgrade.append(button("Lv2로 강화", "upgrade", () => c.send("upgradeTool", { targetId: target?.id, itemId: selectedTool }), blocked || !ready));
      }
      workshop.append(upgrade);
    } else {
      const recipes = recipesInCategory(c.category);
      const list = el("nav", "", "recipe-list");
      list.setAttribute("aria-label", "제작법");
      list.dataset.scroll = "recipes";
      for (const recipe of recipes) {
        const max = maxCrafts(m.inventory, recipe);
        const b = button("", `recipe-${recipe.id}`, () => c.selectRecipe(recipe.id));
        b.className = `recipe-choice${c.recipe === recipe.id ? " selected" : ""}`;
        b.setAttribute("aria-pressed", String(c.recipe === recipe.id));
        b.append(icon(recipe.output.itemId), el("strong", recipe.name), el("span", max ? `제작 가능 · ${max}회` : "재료·공간 부족", max ? "available" : "unavailable"));
        list.append(b);
      }
      const recipe = recipes.find(r => r.id === c.recipe) ?? recipes[0]!;
      const detail = el("section", "", "recipe-detail");
      detail.setAttribute("aria-label", "선택한 제작법");
      const heading = el("div", "", "household-item-heading");
      heading.append(icon(recipe.output.itemId), el("h3", recipe.name));
      detail.append(heading, el("p", `1회 결과: ${itemName(recipe.output.itemId)} ×${recipe.output.quantity}`, "household-note"));
      detail.append(el("h4", "필요 재료 · 보유 / 필요"));
      for (const i of recipe.ingredients) {
        const owned = m.inventory[i.itemId] ?? 0;
        const row = el("div", "", `ingredient ${owned >= i.quantity ? "available" : "unavailable"}`);
        row.append(icon(i.itemId), el("span", itemName(i.itemId)), el("strong", `${owned} / ${i.quantity}`),
          el("small", owned >= i.quantity ? "충분" : `${i.quantity - owned}개 부족`));
        detail.append(row);
      }
      const max = maxCrafts(m.inventory, recipe), actions = el("div", "", "craft-actions");
      for (const [label, count] of [["1회 제작", 1], ["5회 제작", 5], [`최대 ${max}회 제작`, max]] as const) {
        const b = button(label, `craft-${label}`, () => c.quantity({type:"craftItem",targetId:target?.id,itemId:recipe.id,initial:count}),
          blocked || !canCraft(m.inventory, recipe, count));
        b.title = `결과 ${count * recipe.output.quantity}개 · ${recipe.ingredients.map(i => `${itemName(i.itemId)} ${i.quantity * count}개`).join(" + ")}`;
        actions.append(b);
      }
      actions.append(button("제작 횟수 입력","craft-custom",()=>c.quantity({type:"craftItem",targetId:target?.id,itemId:recipe.id}),blocked||max<1));
      detail.append(el("p", max ? `지금 최대 ${max}회 · 결과 ${max * recipe.output.quantity}개` : "재료가 부족하거나 가방이 가득 찼어요.", max ? "available" : "unavailable"), actions);
      menu.append(list);
      workshop.append(detail);
    }
  }
  if (type === "sleep" || type === "sleep-status") {
    const count = c.players.filter(p => p.connected).length;
    const section = el("section", "", "sleep-card");
    section.append(icon("bed"), el("h3", c.sleepVoted ? "가족을 기다리고 있어요" : c.minute < 1080 ? "아직 이른 시간이지만 쉬러 갈까요?" : "잠자리에 들까요?"),
      el("p", count <= 1 ? "잠들면 다음 날 아침이 되고 기력을 회복해요." : `가족 모두 동의하면 다음 날 아침이 돼요. 현재 ${c.votes}/${count}명 동의했어요.`));
    const allowed = type === "sleep" ? inRange && me?.area === "farmhouse" : ["farm", "farmhouse"].includes(me?.area ?? "");
    if (!allowed) section.append(el("p", type === "sleep" ? "농가 안의 침대 가까이로 와 주세요." : "농장으로 돌아와 잠자기에 동의해 주세요.", "unavailable"));
    const actions = el("div", "", "craft-actions");
    actions.append(button(c.sleepVoted ? "잠자기 취소" : count <= 1 ? "잠자기" : "잠자기에 동의", "sleep-confirm", () =>
      c.send("sleepVote", { targetId: type === "sleep" ? target?.id : undefined, day: c.day, value: !c.sleepVoted }),
      !allowed || c.busy || !c.connected), button("계속 놀기", "sleep-close", c.close));
    section.append(actions);
    body.append(section);
  }
  if (!["sleep", "sleep-status"].includes(type) && !inRange) body.append(el("p", "가까이에서 다시 열어 주세요.", "unavailable"));
  return true;
}
