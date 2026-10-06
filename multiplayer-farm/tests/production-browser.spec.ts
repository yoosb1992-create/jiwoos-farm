import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { Client, type Room } from "@colyseus/sdk";
import { FarmState } from "../shared/schema.js";
import { ROOM_NAME } from "../shared/config.js";
import { until, delay } from "./helpers.js";
import type { Session } from "../persistence/store.js";
const publicBackend = process.env.PUBLIC_FARM_BACKEND;
const api = publicBackend ?? "http://127.0.0.1:2575";
const socket = api.replace("https:", "wss:").replace("http:", "ws:");
async function transport(context: BrowserContext) {
  if (publicBackend) return;
  await context.route("https://farm-validation.invalid/**", async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:2575${u.pathname}${u.search}`,
    });
    await route.fulfill({ response });
  });
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        const u = new URL(String(url));
        super(
          u.origin === "wss://farm-validation.invalid"
            ? `ws://127.0.0.1:2575${u.pathname}${u.search}`
            : u.href,
          protocols,
        );
      }
    };
  });
}
async function enter(page: Page, name: string, code?: string) {
  await page.goto("/");
  await page.locator("#nickname").fill(name);
  await page.locator("#password").fill("브라우저검증");
  if (code) {
    await page.locator("#farm-code").fill(code);
    await page.locator("#join-farm").click();
  } else await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden();
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("farm-v26-session")!) as Session,
  );
}
async function hold(page: Page, id: string, ms = 110) {
  // A reconnect retains the player count while controls are unavailable. Wait
  // for connection readiness and normal button actionability, not raw pixels.
  await expect(page.locator("#connection")).toContainText("● 연결됨");
  await page.locator(id).click({ delay: ms });
}
test("production mobile client: actual authority movement, remote canvas, planting, tree/drop/inventory and session refresh", async ({
  browser,
  page,
  request,
}, info) => {
  await transport(page.context());
  const peerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await transport(peerContext);
  const peer = await peerContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const session = await enter(page, "Farm A");
  await enter(peer, "Farm B", session.farmId);
  await expect(page.locator("#connection")).toContainText("2명");
  const response = await request.post(`${api}/api/session`, {
    data: {
      create: false,
      code: session.farmId,
      password: "브라우저검증",
      nickname: "Observer",
    },
  });
  const observer = (await response.json()) as Session;
  const sdk = await new Client(socket).joinOrCreate<FarmState>(
    ROOM_NAME,
    { farmId: session.farmId, token: observer.token },
    FarmState,
  );
  sdk.reconnection.enabled = false;
  sdk.onMessage("personal", () => undefined);
  await until(() => sdk.state?.players.size === 3);
  const local = () =>
    [...sdk.state.players.values()].find(
      (p) => p.playerId === session.playerId,
    )!;
  try {
    const before = await peer.locator("canvas").screenshot();
    await page.keyboard.down("ArrowRight");
    await expect.poll(() => local().x).toBeGreaterThan(304);
    await page.keyboard.up("ArrowRight");
    const after = await peer.locator("canvas").screenshot();
    expect(before.equals(after)).toBe(false);
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(50);
    await page.keyboard.up("ArrowDown");
    await page.locator("#tool").selectOption("hoe");
    await hold(page, "#action");
    await expect
      .poll(
        () =>
          [...sdk.state.entities.values()].filter((e) => e.kind === "soil")
            .length,
      )
      .toBeGreaterThan(0);
    await delay(250);
    await page.locator("#tool").selectOption("sproutberry_seed");
    await hold(page, "#action");
    await expect
      .poll(
        () =>
          [...sdk.state.entities.values()].filter((e) => e.kind === "crop")
            .length,
      )
      .toBe(1);
    await delay(250);
    await page.locator("#tool").selectOption("water");
    await hold(page, "#action");
    await expect
      .poll(() =>
        [...sdk.state.entities.values()].some(
          (e) => e.kind === "crop" && e.watered,
        ),
      )
      .toBe(true);
    await page.locator("#bag").click();
    await expect(page.locator("#panel-body")).toContainText(
      "새싹열매 씨앗 ×11",
    );
    await page.locator("#panel-close").click();
    await page.reload();
    await expect(page.locator("#login")).toBeHidden();
    await expect(page.locator("#connection")).toContainText("● 연결됨 · 3명");
    // Reload restores the safe spawn. All tree interactions below use actual UI inputs.
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(330);
    await page.keyboard.up("ArrowDown");
    await expect.poll(() => local().y).toBeGreaterThan(326);
    await page.locator("#tool").selectOption("axe");
    for (let hit = 0; hit < 3; hit++) {
      await delay(300);
      await hold(page, "#action");
      if (hit < 2)
        await expect
          .poll(() => sdk.state.entities.get("starter-pine")?.hp)
          .toBe(2 - hit);
    }
    await expect
      .poll(() => sdk.state.entities.get("starter-pine")?.kind)
      .toBe("stump");
    await page.locator("#tool").selectOption("hand");
    for (let pickup = 0; pickup < 3; pickup++) {
      await delay(300);
      await hold(page, "#action");
    }
    await page.locator("#bag").click();
    await expect(page.locator("#panel-body")).toContainText("나무 ×1");
    await page.locator("#panel-close").click();
    expect(
      await page.evaluate(() => Object.hasOwn(window, "__FARM_DEBUG__")),
    ).toBe(false);
    expect(errors).toEqual([]);
    await page.goto("about:blank");
    await page.goBack();
    await expect(page.locator("#login")).toBeHidden();
    await expect(page.locator("#connection")).toContainText("● 연결됨 · 3명");
    await page.locator("#bag").click();
    await expect(page.locator("#panel-body")).toContainText("나무 ×1");
    await page.locator("#panel-close").click();
    await page.screenshot({ path: info.outputPath("farm-mobile.png") });
  } finally {
    await sdk.leave();
    await peerContext.close();
  }
});
