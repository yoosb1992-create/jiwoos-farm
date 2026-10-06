import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, code?: string) {
  await page.goto("/");
  await page.locator("#nickname").fill(code ? "B" : "A");
  await page.locator("#password").fill("테스트");
  if (code) {
    await page.locator("#farm-code").fill(code);
    await page.locator("#join-farm").click();
  } else await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden();
  await expect(page.locator("#connection")).toContainText("연결됨");
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("farm-v26-session")!).farmId as string,
  );
}
test("mobile farm load, two contexts, joystick+RUN, action, inventory and reconnect after reload", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const code = await login(page);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const second = await context.newPage();
  await login(second, code);
  await expect(page.locator("#connection")).toContainText("2명");
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("v26-mobile-farm.png") });
  await page.locator("#menu").click();
  await page
    .getByRole("button", { name: "❧ 사계절 도감", exact: true })
    .click();
  await expect(page.locator("#panel-body")).toContainText("겨울별꽃");
  await page.locator("#panel-close").click();
  await page.locator("#menu").click();
  await page
    .getByRole("button", { name: "≈ 물고기 도감", exact: true })
    .click();
  await expect(page.locator("#panel-body")).toContainText("0/24");
  await page.screenshot({
    path: testInfo.outputPath("v26-mobile-encyclopedia.png"),
  });
  await page.locator("#panel-close").click();
  const touch = await context.newCDPSession(second);
  const joy = await second.locator("#joystick").boundingBox(),
    run = await second.locator("#run").boundingBox();
  expect(joy && run).toBeTruthy();
  const x = joy!.x + joy!.width / 2,
    y = joy!.y + joy!.height / 2;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x + 25, y, id: 1 },
      { x: run!.x + 30, y: run!.y + 30, id: 2 },
    ],
  });
  await expect(second.locator("#run")).toHaveAttribute("aria-pressed", "true");
  await second.waitForTimeout(450);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(second.locator("#run")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#bag").click();
  await expect(
    page.getByRole("heading", { name: "가방", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#panel-body")).toContainText("새싹열매 씨앗");
  await page.locator("#panel-close").click();
  // Walk east to the authored field. An action still must pass real range/front-tile checks.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(540);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.locator("#tool").selectOption("hoe");
  const actionBox = await page.locator("#action").boundingBox();
  await page.mouse.move(actionBox!.x + 40, actionBox!.y + 40);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.reload();
  await expect(page.locator("#login")).toBeHidden();
  await expect(page.locator("#connection")).toContainText("연결됨");
  expect(errors).toEqual([]);
  await page.goto("about:blank");
  await page.goBack();
  await expect(page.locator("#login")).toBeHidden();
  await expect(page.locator("#connection")).toContainText("연결됨");
  await expect(page.locator("canvas")).toBeVisible();
  await context.close();
});
