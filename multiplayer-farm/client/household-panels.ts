import { ITEMS, itemName } from "../shared/content.js";
import { recipesInCategory, visibleCraftCategories, type CraftCategory } from "./craft-categories.js";
import { itemIconSource, toolIconImage } from "./item-icons.js";
import { canCraft, maxCrafts, transferQuantity } from "../shared/household.js";
import type { Command, Entity, Member } from "../shared/world.js";
import type { RenderPlayer } from "./network.js";

export interface HouseholdContext {
  member?: Member;
  chest: Record<string, number>;
  day: number;
  minute: number;
  entities: Entity[];
  players: RenderPlayer[];
  targetId?: string;
  recipe: string;
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
  const blocked = c.busy || !c.connected || !inRange;
  const status = el("p", c.busy ? "물건을 정리하고 있어요…" : c.feedback ||
    (!c.connected ? "연결을 복구하고 있어요" : ""), "household-feedback");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  body.append(status);
  if (type === "chest" && m) {
    body.append(el("p", "가족이 함께 쓰는 보관함 · 도구는 가방에 남겨 두어요. 절반은 홀수일 때 올림해요.", "household-note"));
    const columns = el("div", "", "storage-columns");
    for (const [into, title, inventory] of [[true, "내 가방", m.inventory], [false, "가족 보관함", c.chest]] as const) {
      const section = el("section", "", into ? "storage-side bag-side" : "storage-side chest-side");
      section.setAttribute("aria-label", title);
      const entries = Object.entries(inventory).filter(([id, n]) => n > 0 && ITEMS[id]?.kind !== "tool")
        .sort(([a], [b]) => itemName(a).localeCompare(itemName(b), "ko"));
      section.append(el("h3", title), el("p", into ? `사용 중 ${Object.keys(m.inventory).length}/48칸` : `${entries.length}종 보관 중`, "storage-summary"));
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
          const b = button(`${name} ${verb}`, `${into}-${id}-${mode}`, () => c.send(into ? "depositChest" : "withdrawChest", {
            targetId: target?.id, itemId: id, ...(mode === "one" ? { quantity: 1 } : { quantityMode: mode }),
          }), blocked);
          actions.append(b);
        }
        card.append(heading, actions);
        stack.append(card);
      }
      columns.append(section);
    }
    body.append(columns);
  }
  if (type === "craft" && m) {
    body.append(el("p", "가방의 재료로 바로 만들어요. 제작 횟수만큼 재료가 사용됩니다.", "household-note"));
    const categories = el("nav", "", "craft-categories");
    categories.setAttribute("aria-label", "제작 카테고리");
    categories.dataset.scroll = "categories";
    for (const category of visibleCraftCategories) {
      const tab = button(category.name, `category-${category.id}`, () => c.selectCategory(category.id));
      tab.dataset.category = category.id;
      tab.setAttribute("aria-pressed", String(c.category === category.id));
      tab.classList.toggle("selected", c.category === category.id);
      tab.append(el("span", String(recipesInCategory(category.id).length), "category-count"));
      categories.append(tab);
    }
    body.append(categories);
    const recipes = recipesInCategory(c.category);
    const workshop = el("div", "", "workshop-layout"), list = el("nav", "", "recipe-list");
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
      const b = button(label, `craft-${label}`, () => c.send("craftItem", { targetId: target?.id, itemId: recipe.id, quantity: count }),
        blocked || !canCraft(m.inventory, recipe, count));
      b.title = `결과 ${count * recipe.output.quantity}개 · ${recipe.ingredients.map(i => `${itemName(i.itemId)} ${i.quantity * count}개`).join(" + ")}`;
      actions.append(b);
    }
    detail.append(el("p", max ? `지금 최대 ${max}회 · 결과 ${max * recipe.output.quantity}개` : "재료가 부족하거나 가방이 가득 찼어요.", max ? "available" : "unavailable"), actions);
    workshop.append(list, detail);
    body.append(workshop);
    const upgrade = el("section", "", "upgrade-tools");
    upgrade.setAttribute("aria-label", "도구 강화");
    upgrade.append(el("h3", `도구 강화 · 현재 Lv${m.toolLevel}`));
    const upgradeIcons = el("div", "", "upgrade-icons");
    upgradeIcons.setAttribute("aria-hidden", "true");
    for (const id of ["axe", "pickaxe"]) {
      const image = toolIconImage(id);
      if (image) upgradeIcons.append(image);
    }
    upgrade.append(upgradeIcons);
    if (m.toolLevel >= 2) upgrade.append(el("p", "✓ 최고 단계 강화 완료", "available"));
    else {
      for (const id of ["copper_ore", "wood"]) upgrade.append(el("p", `${itemName(id)} · ${m.inventory[id] ?? 0} / 5`, (m.inventory[id] ?? 0) >= 5 ? "available" : "unavailable"));
      upgrade.append(button("Lv2로 강화", "upgrade", () => c.send("upgradeTool", { targetId: target?.id }),
        blocked || (m.inventory.copper_ore ?? 0) < 5 || (m.inventory.wood ?? 0) < 5));
    }
    body.append(upgrade);
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
