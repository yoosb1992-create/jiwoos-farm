import { test, expect } from "@playwright/test";

test("mobile lobby can name a new farm and scroll the entire page and long farm list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 440 });
  await page.goto("/?newFarm=1");
  await page.locator("#nickname").fill("지우");
  await page.locator("#farm-name").fill("지우네 꽃밭");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem("farm-v26-session")!));
  expect(current.farmName).toBe("지우네 꽃밭");

  await page.goto("/?newFarm=1");
  await expect(page.locator("#saved-farms")).toContainText("지우네 꽃밭");
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("farm-v26-session")!);
    const extra = Array.from({ length: 19 }, (_, i) => ({
      ...current,
      farmId: "D" + String(i).padStart(9, "0"),
      token: "lobby-test-token-" + i,
      farmName: "저장 농장 " + (i + 1),
    }));
    localStorage.setItem("farm-v26-sessions", JSON.stringify([current, ...extra]));
  });
  await page.reload();
  await expect(page.locator("#saved-farms .item-row")).toHaveCount(20);

  const lobby = page.locator("#login");
  const list = page.locator("#saved-farms");
  expect(await lobby.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await lobby.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await lobby.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await lobby.evaluate(el => { el.scrollTop = 0; });
  await expect(page.locator("#farm-name")).toBeInViewport();
});
