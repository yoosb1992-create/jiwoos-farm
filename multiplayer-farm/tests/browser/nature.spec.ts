import { test, expect } from "@playwright/test";
import { ASSETS } from "../../shared/content.js";
import { TREE_SPECIES } from "../../shared/nature.js";
import { naturalPlacement } from "../../shared/nature-world.js";
import type { Entity, World } from "../../shared/world.js";

test("mobile nature: decode shipped art, touch plant a seed and reload the saved tree", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("farm-zoom", "0.7"));
  await page.goto("/");
  await page.locator("#nickname").fill("나무 농부");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
  await expect.poll(() => page.evaluate(() => !!window.__FARM_DEBUG__.snapshot().local)).toBe(true);
  const paths = [...new Set(Object.values(ASSETS).map(a => a.source?.path).filter((p): p is string => !!p?.startsWith("/assets/nature/")))];
  expect(await page.evaluate(async paths => {
    return (await Promise.all(paths.map(async path => {
      const image = new Image(); image.src = path;
      try { await image.decode(); return ""; } catch { return path; }
    }))).filter(Boolean);
  }, paths)).toEqual([]);
  const state = await page.evaluate(() => window.__FARM_DEBUG__.state());
  const world = { ...state, layout: JSON.parse(state.layout) } as unknown as World;
  let target: { x: number; y: number } | undefined;
  for (let y = 44; y <= 47 && !target; y++) for (let x = 64; x <= 68 && !target; x++) {
    if (!naturalPlacement(world, "farm", x, y, "tree")) continue;
    const p = await page.evaluate(({ x, y }) => window.__FARM_DEBUG__.screenPoint((x + .5) * 32, (y + .5) * 32), { x, y });
    if (await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS", p)) target = p;
  }
  expect(target).toBeDefined();
  await page.locator("#tool").selectOption("pine_cone");
  await page.touchscreen.tap(target!.x, target!.y);
  await expect.poll(() => page.evaluate(() => (Object.values(window.__FARM_DEBUG__.state().entities) as Entity[]).filter(e => e.planted && e.species === "tree_pine").length), { timeout: 15000 }).toBe(1);
  const tree = await page.evaluate(() => (Object.values(window.__FARM_DEBUG__.state().entities) as Entity[]).find(e => e.planted)!);
  expect(tree.stage).toBe(0);
  await page.locator("#bag").click();
  await expect(page.locator("#panel-body")).toContainText("솔방울 ×1");
  await page.locator("#panel-close").click();
  await page.screenshot({ path: info.outputPath("nature-planted-seedling.png") });
  await page.reload();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
  await expect.poll(() => page.evaluate(id => (window.__FARM_DEBUG__.state().entities[id] as Entity | undefined)?.stage, tree.id)).toBe(0);
  expect(errors).toEqual([]);
});

test("editor nature: eight thumbnails, five stages and species properties survive draft reload", async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/editor.html");
  await expect(page.locator("#status")).toContainText("초안 준비");
  await page.locator("[data-panel=objects]").first().click();
  await page.locator("#category").selectOption("Nature");
  await expect(page.locator("[data-asset=farm_purple_wildflower]")).toBeVisible();
  await page.locator("#category").selectOption("Flowers");
  await expect(page.locator("[data-asset=farm_purple_wildflower]")).toBeVisible();
  await expect(page.locator("[data-asset=crop_frostflower_mature]")).toBeVisible();
  await expect(page.locator("[data-asset=flower_hydrangea]")).toBeVisible();
  await page.locator("#category").selectOption("Trees");
  for (const t of TREE_SPECIES) {
    const thumb = page.locator(`[data-asset=${t.id}] canvas`);
    await expect(thumb).toBeVisible();
    await expect.poll(() => thumb.evaluate(c => {
      const canvas = c as HTMLCanvasElement;
      return canvas.getContext("2d")!.getImageData(0, 0, 90, 72).data.some((v, i) => i % 4 === 3 && v > 0);
    })).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("nature-tree-palette.png") });
  await page.locator("[data-asset=tree_bamboo]").click();
  const p = await page.evaluate(() => window.__WORLD_EDITOR__.screenPoint(64.5, 44.5));
  await page.mouse.click(p.x, p.y);
  const bamboo = await page.evaluate(() => window.__WORLD_EDITOR__.snapshot().maps.farm!.objects.find(o => o.tree?.species === "tree_bamboo")!);
  expect(bamboo).toBeTruthy();
  await page.locator("[data-tool=selection]").click();
  await page.mouse.click(p.x, p.y - 12);
  await expect(page.locator("#prop-stage")).toBeVisible();
  await expect(page.locator("#prop-stage option")).toHaveCount(5);
  await page.locator("#prop-species").selectOption("tree_metasequoia");
  await page.locator("#prop-stage").selectOption("4");
  await page.locator("#prop-planted").check();
  await page.locator("#prop-regrow").check();
  await page.locator("#prop-chop").uncheck();
  await page.locator("#prop-drop").selectOption("metasequoia_seed");
  await page.locator("#apply-properties").click();
  const property = () => page.evaluate(id => window.__WORLD_EDITOR__.snapshot().maps.farm!.objects.find(o => o.id === id)!.tree, bamboo.id);
  expect(await property()).toMatchObject({ species: "tree_metasequoia", stage: 4, planted: true, regrow: true, chop: false, drop: "metasequoia_seed" });
  await page.locator("#close-sheet").click();
  await page.locator("[data-season=winter]").click();
  await page.evaluate(async () => {
    await Promise.all(["winter", "guardian"].map(async stage => {
      const image = new Image(); image.src = `/assets/nature/trees/tree_metasequoia_${stage}.webp`; await image.decode();
    }));
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: info.outputPath("nature-guardian-winter-editor.png") });
  // Draft autosave is intentionally debounced by five seconds.
  await page.waitForTimeout(5500);
  await page.reload();
  await expect(page.locator("#status")).toContainText("초안 준비");
  expect(await property()).toMatchObject({ species: "tree_metasequoia", stage: 4, planted: true, regrow: true, chop: false });
});
