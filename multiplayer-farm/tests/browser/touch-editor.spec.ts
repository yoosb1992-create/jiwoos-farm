import { test, expect } from "@playwright/test";
import type { NetworkSnapshot } from "../../client/network.js";
import { clearWorldBlueprint, waitForFarmInput } from "./nature-target.js";
type Debug = {
  snapshot: () => NetworkSnapshot;
  state: () => {
    entities: Record<string, { hp: number; kind: string }>;
    layout: string;
  };
  screenPoint: (x: number, y: number) => { x: number; y: number };
};
declare global {
  interface Window {
    __FARM_DEBUG__: Debug;
  }
}
test("mobile touch action, saved control layout and new-world editor isolation", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await clearWorldBlueprint(page, 52.5, 39.5);
  await page.addInitScript(() => localStorage.setItem("farm-zoom", "0.7"));
  await page.goto("/");
  await expect(page.locator("#password")).toHaveCount(0);
  await page.locator("#nickname").fill("Touch");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute(
    "data-status",
    "connected",
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__FARM_DEBUG__.snapshot().local !== null),
    )
    .toBe(true);
  await expect.poll(() => page.evaluate(() => !!window.__FARM_DEBUG__.state())).toBe(true);
  const old = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("farm-v26-session")!).farmId as string,
  );
  await waitForFarmInput(page);
  // Tapping the tree selects axe even when another tool was selected.
  await page.locator("#tool").selectOption("pickaxe");
  // Tool selection can overlap a cold-renderer reconnect. Read the target
  // from one live snapshot, then retain the real touch and tree-HP assertion.
  await waitForFarmInput(page);
  let target: { x: number; y: number } | undefined;
  await expect.poll(async () => {
    target = await page.evaluate(() => {
      const state = window.__FARM_DEBUG__.state();
      if (!state?.layout || window.__FARM_DEBUG__.snapshot().status !== "connected") return;
      const farm = JSON.parse(state.layout).maps.farm;
      const tree = farm.objects.find((o: { id: string }) => o.id === "starter-pine");
      if (!tree) return;
      return window.__FARM_DEBUG__.screenPoint(tree.position.tileX * 32, tree.position.tileY * 32 - 42);
    });
    return target;
  }, { timeout: 15000 }).toBeDefined();
  await page.touchscreen.tap(target!.x, target!.y);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__FARM_DEBUG__?.state()?.entities?.["starter-pine"]?.hp,
        ),
      { timeout: 12000 },
    )
    .toBe(2);
  await page.locator("#menu").click();
  await page
    .getByRole("button", { name: "조작 배치 편집", exact: true })
    .click();
  await page.locator("#control-size").fill("136");
  const joy = await page.locator("#joystick").boundingBox();
  await page.mouse.move(joy!.x + 50, joy!.y + 50);
  await page.mouse.down();
  await page.mouse.move(joy!.x + 75, joy!.y - 70, { steps: 5 });
  await page.mouse.up();
  await page.locator("#controls-save").click();
  const saved = await page.evaluate(() =>
    localStorage.getItem("farm-controls-v1"),
  );
  expect(saved).toBeTruthy();
  await page.reload();await expect(page.locator("#login")).toBeVisible();await page.locator("#resume").click();
  await expect(page.locator("#connection")).toHaveAttribute(
    "data-status",
    "connected",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("farm-controls-v1")),
  ).toBe(saved);
  await page.setViewportSize({ width: 844, height: 390 });
  for (const id of ["joystick", "action", "run"]) {
    const b = await page.locator("#" + id).boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.y).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(844);
    expect(b!.y + b!.height).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: info.outputPath("landscape-controls.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor.html");
  await page.locator("#menu").click();
  await page.locator("[data-panel=world]").click();
  await page.locator("#width").fill("136");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("farm-editor-draft-v1") ?? "null")?.maps
          .farm.width,
    ),
  ).not.toBe(136);
  await page.locator("#resize").click();
  await page.locator("#undo").click();
  await expect(page.locator("#width")).not.toHaveValue("136");
  await page.locator("#redo").click();
  await expect(page.locator("#width")).toHaveValue("136");
  await page.locator("#menu").click();
  await page.locator("[data-panel=save]").click();
  await page.locator("#register-start").click();
  await expect(page.locator("#status")).toContainText("나만의 시작 농장으로 등록 완료");
  await page.screenshot({ path: info.outputPath("mobile-world-editor.png") });
  await page.goto("/?newFarm=1");
  await expect(page.locator("#login")).toBeVisible();
  await page.locator("#nickname").fill("Edited");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute(
    "data-status",
    "connected",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__FARM_DEBUG__?.state()?.layout
          ? JSON.parse(window.__FARM_DEBUG__.state()!.layout).maps.farm.width
          : undefined,
      ),
    )
    .toBe(136);
  expect(
    await page.evaluate(
      (old) =>
        JSON.parse(localStorage.getItem("farm-v26-sessions")!).some(
          (s: { farmId: string }) => s.farmId === old,
        ),
      old,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("portrait-compact-hud.png") });
});
