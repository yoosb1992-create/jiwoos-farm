import { frontTile, isFarmable } from "../shared/applyMovement.js";
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
  if (code) {
    await page.locator("#farm-code").fill(code);
    await page.locator("#join-farm").click();
  } else await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:20000});
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("farm-v26-session")!) as Session,
  );
}
async function restore(page: Page, navigate: () => Promise<unknown>) {
  // Refresh and browser restoration stay in the lobby until Continue.
  await navigate();
  await expect(page.locator("#login")).toBeVisible();
  const joined = page.waitForResponse(response =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === `/matchmake/joinOrCreate/${ROOM_NAME}`,
  );
  const [response] = await Promise.all([joined, page.locator("#resume").click()]);
  expect(response.ok()).toBe(true);
  await expect(page.locator("#login")).toBeHidden();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
}
async function hold(page: Page, id: string, ms = 110) {
  // A reconnect retains the player count while controls are unavailable. Wait
  // for connection readiness and normal button actionability, not raw pixels.
  await expect(page.locator("#connection")).toHaveAttribute(
    "data-status",
    "connected",
  );
  await page.locator(id).click({ delay: ms });
}
async function plantableScenario(page: Page) {
  // Publish an isolated field through the real editor API. Movement and crop
  // actions still run on the production server; unrelated random forest
  // placement must not decide whether this planting scenario is reachable.
  const ownerResponse = await page.request.post(`${api}/api/session`, {
    data: { create: true, nickname: "Field author" },
  });
  expect(ownerResponse.ok()).toBe(true);
  const owner = await ownerResponse.json();
  const layoutResponse = await page.request.get(`${api}/api/blueprints/defaults`);
  expect(layoutResponse.ok()).toBe(true);
  const layout = await layoutResponse.json();
  const farm = layout.maps.farm;
  delete farm.world2;
  Object.assign(farm, { baseTileType: "soil", objects: [], terrainRegions: [], collisionRegions: [], warps: [] });
  Object.assign(farm.spawns.find((s: { id: string }) => s.id === "farm_entry"), {
    tileX: 10.5, tileY: 10.5, facing: "right",
  });
  const draftResponse = await page.request.post(`${api}/api/blueprints`, {
    headers: { Authorization: `Bearer ${owner.token}` }, data: layout,
  });
  expect(draftResponse.ok()).toBe(true);
  const draft = await draftResponse.json();
  const published = await page.request.post(`${api}/api/blueprints/${draft.id}`, {
    headers: { Authorization: `Bearer ${draft.editToken}` },
    data: { layout, revision: draft.revision, publish: true },
  });
  expect(published.ok()).toBe(true);
  await page.addInitScript(id => localStorage.setItem("farm-active-blueprint", id), draft.id);
}
// Keep independent production scenarios inside the existing 60s budget.
// CI trace 38039642779 passed gameplay assertions but exhausted the combined
// budget during the final screenshot/session teardown. No timeout was raised.
test("production mobile: authoritative movement, remote canvas, crop planting and watering", async ({
  browser,
  page,
  request,
}, info) => {
  await transport(page.context());
  await plantableScenario(page);
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
  await expect(page.locator("#connection")).toHaveAttribute(
    "aria-label",
    /2명/,
  );
  const response = await request.post(`${api}/api/session`, {
    data: {
      create: false,
      code: session.farmId,
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
  sdk.onMessage("actionFx", () => undefined);
  await until(() => sdk.state?.players.size === 3);
  expect(JSON.parse(sdk.state.weatherPlan)).toMatchObject({day:sdk.state.day,windDirection:expect.any(Number),windSpeed:expect.any(Number),gustStrength:expect.any(Number)});
  const local = () =>
    [...sdk.state.players.values()].find(
      (p) => p.playerId === session.playerId,
    )!;
  try {
    const before = await peer.getByLabel("가족 농장 게임 화면").locator("canvas").screenshot();
    const startX = local().x;
    await page.keyboard.down("ArrowRight");
    await expect.poll(() => local().x).toBeGreaterThan(startX + 40);
    await page.keyboard.up("ArrowRight");
    const after = await peer.getByLabel("가족 농장 게임 화면").locator("canvas").screenshot();
    expect(before.equals(after)).toBe(false);
    await expect.poll(()=>local().moving).toBe(false);
    // Inspect actual authority state: Postgres family seeds vary, so a fixed
    // farming coordinate can contain a newly spawned branch or stone.
    const maps=JSON.parse(sdk.state.layout).maps;
    const freeFront=()=>{
      const t=frontTile(local());
      return isFarmable("farm",t.tileX,t.tileY,maps) && ![...sdk.state.entities.values()].some(e=>e.area==="farm" && Math.floor(e.x/32)===t.tileX && Math.floor(e.y/32)===t.tileY);
    };
    for(let attempt=0;!freeFront() && attempt<8;attempt++) {
      const x=local().x;
      await page.keyboard.down("ArrowRight");
      try {await expect.poll(()=>local().x,{intervals:[30]}).toBeGreaterThan(x+32);}
      finally {await page.keyboard.up("ArrowRight");}
      await expect.poll(()=>local().moving).toBe(false);
    }
    expect(freeFront()).toBe(true);
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
    await restore(page, () => page.reload());
    await expect.poll(()=>[...sdk.state.entities.values()].some(e=>e.kind==="crop" && e.watered)).toBe(true);
    expect(errors).toEqual([]);
  } catch (error) {
    console.log("Production connection diagnostic", JSON.stringify({
      observerOpen: sdk.connection.isOpen,
      players: [...sdk.state.players.values()].map(p => ({ nickname: p.nickname, connected: p.connected })),
      pageStatus: await page.locator("#connection").getAttribute("aria-label").catch(() => null),
      peerStatus: await peer.locator("#connection").getAttribute("aria-label").catch(() => null),
      pageUrl: page.url(),
      errors,
    }));
    throw error;
  } finally {
    await sdk.leave();
    await peerContext.close();
  }
});

test("production mobile: tree drops, inventory and repeated session restoration", async ({
  page,
  request,
}, info) => {
  await transport(page.context());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const session = await enter(page, "Farm A");
  // Run 38545947874 passed every gameplay/restoration assertion, then hit the
  // 60s budget during cleanup. This peer only verifies continued membership;
  // a second software-rendered canvas adds no assertion here. Keep all three
  // authenticated players using the real SDK; the preceding test still checks
  // a remote browser's rendered canvas. Do not raise timeouts or skip checks.
  const peerResponse = await request.post(`${api}/api/session`, {
    data: { create: false, code: session.farmId, nickname: "Farm B" },
  });
  expect(peerResponse.ok()).toBe(true);
  const peerSession = (await peerResponse.json()) as Session;
  const peer = await new Client(socket).joinOrCreate<FarmState>(
    ROOM_NAME, { farmId: session.farmId, token: peerSession.token }, FarmState,
  );
  peer.reconnection.enabled = false;
  peer.onMessage("personal", () => undefined);
  peer.onMessage("actionFx", () => undefined);
  await expect(page.locator("#connection")).toHaveAttribute(
    "aria-label",
    /2명/,
  );
  const response = await request.post(`${api}/api/session`, {
    data: {
      create: false,
      code: session.farmId,
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
  sdk.onMessage("actionFx", () => undefined);
  await until(() => sdk.state?.players.size === 3);
  expect(JSON.parse(sdk.state.weatherPlan)).toMatchObject({day:sdk.state.day,windDirection:expect.any(Number),windSpeed:expect.any(Number),gustStrength:expect.any(Number)});
  const local = () =>
    [...sdk.state.players.values()].find(
      (p) => p.playerId === session.playerId,
    )!;
  try {
    await expect(page.locator("#connection")).toHaveAttribute(
      "aria-label",
      "연결됨 · 3명",
    );
    await until(() => peer.state?.players.size === 3);
    // This independent scenario already starts at the safe spawn. Reload is
    // exercised after crops above; history restoration follows tree pickup below.
    const tree = sdk.state.entities.get("starter-pine")!;
    // Short key presses keep queued input from carrying the actor past the
    // trunk's entire collision tile while the software renderer catches up.
    // Check both sides: x < tree.x + 4 also accepted being far to its left.
    await expect(async () => {
      const dx = tree.x - local().x;
      if (Math.abs(dx) >= 12)
        await page.keyboard.press(dx > 0 ? "ArrowRight" : "ArrowLeft", { delay: 80 });
      expect(Math.abs(local().x - tree.x)).toBeLessThan(12);
    }).toPass({ timeout: 12000, intervals: [200] });
    await page.keyboard.down("ArrowDown");
    await expect.poll(() => local().y, { intervals: [20] }).toBeGreaterThan(tree.y - 36);
    await page.keyboard.up("ArrowDown");
    await delay(250);
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
    // The starter magnet is deliberately only 32px. Align with the stump's
    // edge and walk into range; no action button or tool switch should be needed.
    // A held alignment key can overshoot while the observer's patch arrives;
    // a backlog reconnect also clears held keys. Use bounded real key presses
    // and re-read both axes after each release, including after reconnects.
    await expect(async () => {
      await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
      const dx=tree.x-local().x,dy=tree.y-local().y;
      if(Math.hypot(dx,dy)>32.001) {
        const key=Math.abs(dx)>=8?(dx>0?"ArrowRight":"ArrowLeft"):(dy>0?"ArrowDown":"ArrowUp");
        await page.keyboard.press(key,{delay:60});
        await delay(120);
      }
      expect(Math.hypot(local().x-tree.x,local().y-tree.y)).toBeLessThanOrEqual(32.001);
    }).toPass({timeout:10000,intervals:[100]});
    await expect.poll(()=>[...sdk.state.entities.values()].filter(e=>e.kind==="drop"&&Math.hypot(e.x-tree.x,e.y-tree.y)<1).length).toBe(0);
    await page.locator("#bag").click();
    await expect(page.locator("#panel-body")).toContainText("나무 ×1");
    await page.locator("#panel-close").click();
    expect(
      await page.evaluate(() => Object.hasOwn(window, "__FARM_DEBUG__")),
    ).toBe(false);
    expect(errors).toEqual([]);
    await page.locator("#menu").click();
    await page.getByRole("button",{name:"⚙ 소리·화면 설정",exact:true}).click();
    await page.locator("#lightning-mode").selectOption("reduced");
    await page.locator("#panel-close").click();
    await page.goto("about:blank");
    await restore(page, () => page.goBack());
    await expect(page.locator("#connection")).toHaveAttribute(
      "aria-label",
      "연결됨 · 3명",
    );
    await until(() => peer.state.players.size === 3);
    expect([...peer.state.players.values()].filter(p => p.playerId === session.playerId && p.connected)).toHaveLength(1);
    await page.locator("#bag").click();
    await expect(page.locator("#panel-body")).toContainText("나무 ×1");
    await page.locator("#panel-close").click();
    await page.locator("#menu").click();
    await page.getByRole("button",{name:"⚙ 소리·화면 설정",exact:true}).click();
    await expect(page.locator("#lightning-mode")).toHaveValue("reduced");
    await page.locator("#panel-close").click();
    await page.screenshot({ path: info.outputPath("farm-mobile.png") });
  } catch (error) {
    console.log("Production connection diagnostic", JSON.stringify({
      observerOpen: sdk.connection.isOpen,
      players: [...sdk.state.players.values()].map(p => ({ nickname: p.nickname, connected: p.connected })),
      pageStatus: await page.locator("#connection").getAttribute("aria-label").catch(() => null),
      peerConnected: peer.connection.isOpen,
      pageUrl: page.url(),
      errors,
    }));
    throw error;
  } finally {
    await Promise.all([sdk.leave(), peer.leave()]);
  }
});
