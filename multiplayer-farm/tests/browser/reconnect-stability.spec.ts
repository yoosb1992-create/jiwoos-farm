import { test, expect } from "@playwright/test";
import type { Session } from "../../persistence/store.js";

test("phone: lost first-join response, matchmaking failure, offline/visible recovery and logout", async ({ page, context }) => {
  test.setTimeout(60000);
  const owner = await (await page.request.post("http://127.0.0.1:2575/api/session", { data: { create: true, nickname: "RetryOwner" } })).json() as Session;
  let posts = 0, matches = 0, lost: Session | undefined;
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/session", async route => {
    if (route.request().method() === "POST" && ++posts === 1) {
      lost = await (await route.fetch()).json() as Session;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.route("**/matchmake/**", async route => {
    if (++matches === 1) await route.abort("failed"); else await route.continue();
  });
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) { super(...args); sockets.push(this); }
    };
    Object.assign(window, { dropTestConnection: () => sockets.filter(s => s.url.includes(":2575/")).forEach(s => s.close(4010, "temporary network loss")) });
  });
  await page.goto("/");
  await page.locator("#nickname").fill("RetryPhone"); await page.locator("#farm-code").fill(owner.farmId);
  await page.locator("#join-farm").click();
  await expect(page.locator("#login-error")).toContainText("다시 연결", { timeout: 20000 });
  await expect(page.locator("#login")).toBeHidden({ timeout: 25000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("farm-v26-session")!) as Session);
  expect(saved.playerId).toBe(lost!.playerId); expect(saved.token).toBe(lost!.token); expect(posts).toBe(2);
  await context.setOffline(true);
  await page.evaluate(() => (window as unknown as {dropTestConnection(): void}).dropTestConnection());
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "reconnecting");
  await expect(page.locator("#action")).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); } });
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected", { timeout: 15000 });
  await expect(page.locator("#action")).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("farm-v26-session")!))).toEqual(saved);
  await page.locator("#menu").click(); await page.getByRole("button", { name: "농장 및 가족", exact: true }).click(); await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "disconnected");
  await page.reload();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  await expect(page.locator("#login")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("farm-v26-session"))).toBeNull();
  await expect(page.locator("#saved-farms")).toContainText(saved.farmId);
  expect(errors).toEqual([]);
});
