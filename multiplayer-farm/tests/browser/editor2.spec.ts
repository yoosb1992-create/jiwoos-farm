import { test, expect } from "@playwright/test";
import type { WorldLayout } from "../../shared/layout.js";
declare global {
  interface Window {
    __WORLD_EDITOR__: {
      stats: () => {
        area: string;
        width: number;
        height: number;
        chunks: number;
        cache: number;
        undo: number;
        objects: number;
        sandbox: boolean;
      };
      screenPoint: (x: number, y: number) => { x: number; y: number };
      snapshot: () => WorldLayout;
    };
  }
}
test("World Editor 2.0: phone 80k map, brush history, route, draft restore, sandbox and publish", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/editor.html");
  await expect(page.locator("#status")).toContainText("초안 준비");
  await page.locator("#menu").click();
  await page.locator("[data-panel=world]").click();
  await page.locator("#new-map-name").fill("달빛호수");
  await page.locator("#create-map").click();
  const id = await page.evaluate(() => window.__WORLD_EDITOR__.stats().area);
  await page.locator("#width").fill("400");
  await page.locator("#height").fill("200");
  expect(await page.evaluate(() => window.__WORLD_EDITOR__.stats().width)).toBe(
    64,
  );
  await page.locator("#resize").click();
  expect(await page.evaluate(() => window.__WORLD_EDITOR__.stats().width)).toBe(
    400,
  );
  await page.locator("#close-sheet").click();
  await page.locator("[data-tool=pencil]").click();
  await page.locator("[data-terrain=water]").click();
  await page.locator("#brush-size").fill("3");
  await page.locator("#close-sheet").click();
  const point = await page.evaluate(() =>
    window.__WORLD_EDITOR__.screenPoint(30.5, 30.5),
  );
  await page.touchscreen.tap(point.x, point.y);
  expect(
    await page.evaluate(() => window.__WORLD_EDITOR__.stats().chunks),
  ).toBeGreaterThan(0);
  const chunks = await page.evaluate(() =>
    JSON.stringify(
      window.__WORLD_EDITOR__.snapshot().maps[
        window.__WORLD_EDITOR__.stats().area
      ]!.world2!.chunks,
    ),
  );
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => window.__WORLD_EDITOR__.stats().chunks),
  ).toBe(0);
  await page.locator("#redo").click();
  expect(
    await page.evaluate(() =>
      JSON.stringify(
        window.__WORLD_EDITOR__.snapshot().maps[
          window.__WORLD_EDITOR__.stats().area
        ]!.world2!.chunks,
      ),
    ),
  ).toBe(chunks);
  await page.locator("#menu").click();
  await page.locator("[data-panel=npc]").click();
  await page.locator("#add-route-point").click();
  await page.touchscreen.tap(point.x + 10, point.y + 10);
  expect(
    await page.evaluate(
      () =>
        window.__WORLD_EDITOR__.snapshot().maps[
          window.__WORLD_EDITOR__.stats().area
        ]!.world2!.npcRoutes.length,
    ),
  ).toBe(1);
  await page.locator("#close-sheet").click();
  await page.locator("[data-season=winter]").click();
  await page.screenshot({ path: info.outputPath("editor2-80000-phone.png") });
  const before = await page.evaluate(() =>
    JSON.stringify(window.__WORLD_EDITOR__.snapshot()),
  );
  await page.locator("#test").click();
  await expect(page.locator("#test-exit")).toBeVisible();
  await page.locator("[data-walk=right]").tap();
  await page.locator("#test-exit").click();
  expect(
    await page.evaluate(() =>
      JSON.stringify(window.__WORLD_EDITOR__.snapshot()),
    ),
  ).toBe(before);
  await page.waitForTimeout(5500);
  await page.reload();
  await expect(page.locator("#status")).toContainText("초안 준비");
  expect(
    await page.evaluate(
      (id) => window.__WORLD_EDITOR__.snapshot().maps[id]!.width,
      id,
    ),
  ).toBe(400);
  await page.locator("#menu").click();
  await page.locator("[data-panel=save]").click();
  await page.locator("#publish").click();
  await expect(page.locator("#status")).toContainText("초기 월드 적용 완료");
  await page.goto("/?newFarm=1");
  await page.locator("#nickname").fill("Editor2");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute(
    "data-status",
    "connected",
  );
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const w = JSON.parse(window.__FARM_DEBUG__.state().layout);
        return w.maps[id]?.width;
      }, id),
    )
    .toBe(400);
  expect(errors).toEqual([]);
});
