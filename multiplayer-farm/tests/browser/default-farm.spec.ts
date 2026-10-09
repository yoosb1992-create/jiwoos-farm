import { test, expect } from "@playwright/test";
import { ASSETS } from "../../shared/content.js";
import { TERRAIN_ART } from "../../shared/art-assets.js";

test("default farm: phone spawn, touch walk-stop-face-hoe and editable sketch layout", async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("farm-zoom", "0.7"));
  await page.goto("/");
  await page.locator("#nickname").fill("개척 농부");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
  await expect.poll(() => page.evaluate(() => window.__FARM_DEBUG__.snapshot().local !== null)).toBe(true);
  // Decode the shipped art too: a 200 response can still contain an empty or
  // corrupt sprite, and Phaser's canvas fallback would otherwise conceal it.
  const artPaths = [...new Set([...Object.values(ASSETS).map(a => a.source?.path)
    .filter((p): p is string => Boolean(p?.startsWith("/assets/art-foundation/"))), ...Object.values(TERRAIN_ART)])];
  const failedArt = await page.evaluate(async paths => {
    const decoded = await Promise.all(paths.map(async src => {
      const image = new Image(); image.src = src;
      try { await image.decode(); return ""; } catch { return src; }
    }));
    return decoded.filter(Boolean);
  }, artPaths);
  expect(failedArt).toEqual([]);
  const state = await page.evaluate(() => ({
    layout: JSON.parse(window.__FARM_DEBUG__.state().layout),
    actor: window.__FARM_DEBUG__.snapshot().local!.authoritative,
    entities: window.__FARM_DEBUG__.state().entities,
  }));
  expect(state.layout.maps.farm.width).toBe(128);
  expect(state.actor.x).toBe(60.5 * 32);
  expect(state.actor.y).toBe(37.5 * 32);
  expect(Object.values(state.entities).some(e => e.kind === "soil" || e.kind === "crop")).toBe(false);
  await page.screenshot({ path: info.outputPath("farm-phone-spawn.png") });
  await page.locator("#tool").selectOption("hoe");
  // Nearby clear grass to the southeast, beyond the protected yard and lane.
  const target = await page.evaluate(() => window.__FARM_DEBUG__.screenPoint(64.5 * 32, 44.5 * 32));
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, target)).toBe("CANVAS");
  await page.touchscreen.tap(target.x, target.y);
  await expect.poll(() => page.evaluate(() => window.__FARM_DEBUG__.state().entities["soil-farm-64-44"]?.kind), { timeout: 15000 }).toBe("soil");
  const stopped = await page.evaluate(() => window.__FARM_DEBUG__.snapshot().local!.authoritative);
  await page.waitForTimeout(500);
  const settled = await page.evaluate(() => window.__FARM_DEBUG__.snapshot().local!.authoritative);
  expect(Math.hypot(stopped.x - settled.x, stopped.y - settled.y)).toBeLessThan(3);
  await page.screenshot({ path: info.outputPath("farm-phone-first-till.png") });
  await page.goto("/editor.html");
  await expect(page.locator("#status")).toContainText("초안 준비");
  expect((await page.evaluate(() => window.__WORLD_EDITOR__.snapshot())).maps.farm).toEqual(state.layout.maps.farm);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("farm-editor-detail.png") });
  await page.locator("#menu").click();
  await page.locator("[data-panel=objects]").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("farm-editor-palette.png") });
  await page.locator("#close-sheet").click();
  await page.locator("#menu").click();
  await page.locator("[data-panel=world]").click();
  await page.locator("#grid").uncheck();
  await page.locator("#close-sheet").click();
  await page.locator("#fit").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath("farm-editor-overview.png") });
  await page.locator("#menu").click();
  await page.locator("[data-panel=world]").click();
  await page.locator("#nav-debug").check();
  await page.locator("#close-sheet").click();
  await page.screenshot({ path: info.outputPath("farm-editor-collision.png") });
  const draft = await page.evaluate(() => JSON.stringify(window.__WORLD_EDITOR__.snapshot()));
  await page.locator("#test").click();
  await expect(page.locator("#test-exit")).toBeVisible();
  await page.locator("[data-walk=right]").tap();
  await page.locator("#test-exit").click();
  expect(await page.evaluate(() => JSON.stringify(window.__WORLD_EDITOR__.snapshot()))).toBe(draft);
  expect(errors).toEqual([]);
});
