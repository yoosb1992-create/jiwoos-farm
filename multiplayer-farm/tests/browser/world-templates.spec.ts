import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:2575";
async function panel(page: import("@playwright/test").Page, name: string) {
  await page.locator("#menu").click();
  await page.locator(`#sheet [data-panel=${name}]`).click();
}

test("phone creates isolated personal worlds before owning a farm; town edits survive new farm and a second device", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/editor.html");
  await expect(page.locator("#status")).toContainText("초안 준비");
  const official = await (
    await page.request.get(api + "/api/world-templates/official")
  ).json();
  expect(await page.evaluate(() => window.__WORLD_EDITOR__.snapshot())).toEqual(
    official.layout,
  );
  await panel(page, "workspace");
  await page.locator("#personal-name").fill("숲속 농장");
  await page.locator("#personal-new").click();
  await expect(page.locator("#source-label")).toContainText("숲속 농장");
  await page.locator("#close-sheet").click();
  await page.locator("#map").selectOption("town");
  await panel(page, "world");
  await page.locator("#map-name").fill("내가 만든 마을");
  await page
    .locator("#width")
    .fill(String(official.layout.maps.town.width + 8));
  await page.locator("#resize").click();
  await expect(page.locator("#map option:checked")).toContainText(
    "내가 만든 마을",
  );
  await panel(page, "save");
  await page.locator("#device-save").click();
  await expect(page.locator("#status")).toContainText("이 기기에 저장 완료");
  const original = await page.evaluate(() =>
    window.__WORLD_EDITOR__.snapshot(),
  );
  await panel(page, "workspace");
  const originalId = await page.locator("#personal-list").inputValue();
  await page.locator("#personal-name").fill("강변 농장");
  await page.locator("#personal-copy").click();
  await expect(page.locator("#source-label")).toContainText("강변 농장");
  const copyId = await page.locator("#personal-list").inputValue();
  expect(copyId).not.toBe(originalId);
  await page.locator("#personal-name").fill("강변 복사본");
  await page.locator("#personal-rename").click();
  await expect(page.locator("#source-label")).toContainText("강변 복사본");
  await panel(page, "world");
  await page.locator("#map-name").fill("복사본 마을");
  await page.locator("#resize").click();
  await panel(page, "workspace");
  await page.locator("#personal-list").selectOption(originalId);
  await page.locator("#personal-load").click();
  await expect(page.locator("#source-label")).toContainText("숲속 농장");
  expect(await page.evaluate(() => window.__WORLD_EDITOR__.snapshot())).toEqual(
    original,
  );
  await page.locator("#personal-list").selectOption(copyId);
  await page.locator("#personal-delete").click();
  await expect(
    page.locator(`#personal-list option[value="${copyId}"]`),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("personal-worlds-phone.png") });
  await panel(page, "save");
  await page.locator("#register-start").click();
  await expect(page.locator("#status")).toContainText("등록 완료");
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  expect((await download).suggestedFilename()).toBe("jiwoo-start-world.json");
  await page.goto("/?newFarm=1");
  await expect(page.locator("#start-world-select")).toHaveValue(
    "local:" + originalId,
  );
  await expect(page.locator("#start-world-info")).toContainText("새 농장");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("start-map-picker-phone.png"),
  });
  await page.locator("#nickname").fill("시작맵 농부");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute(
    "data-status",
    "connected",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(window.__FARM_DEBUG__.state().layout).maps.town.name,
      ),
    )
    .toBe("내가 만든 마을");
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("farm-v26-session")!),
  );
  const other = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    }),
    p2 = await other.newPage();
  try {
    await p2.goto("/");
    await p2.locator("#nickname").fill("다른 기기");
    await p2.locator("#farm-code").fill(session.farmId);
    await p2.locator("#join-farm").click();
    await expect(p2.locator("#connection")).toHaveAttribute(
      "data-status",
      "connected",
    );
    expect(
      await p2.evaluate(() => JSON.parse(window.__FARM_DEBUG__.state().layout)),
    ).toEqual(original);
  } finally {
    await other.close();
  }
  await page.goto("/editor.html");
  await expect(page.locator("#status")).toContainText("초안 준비");
  await panel(page, "save");
  await page.locator("#server-save").click();
  await expect(page.locator("#status")).toContainText(
    "서버에 개인 설계도 저장 완료",
  );
  await panel(page, "workspace");
  await page.locator("#load-current").click();
  await expect(page.locator("#source-label")).toContainText("현재 농장");
  await page.screenshot({
    path: info.outputPath("current-farm-protected.png"),
  });
  expect(errors).toEqual([]);
});
