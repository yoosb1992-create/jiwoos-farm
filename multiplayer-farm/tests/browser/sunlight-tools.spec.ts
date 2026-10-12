import { test, expect, type Page } from "@playwright/test";
import { waitForFarmInput } from "./nature-target.js";

async function openClearFarm(page: Page) {
  const api = "http://127.0.0.1:2575";
  const layout = await (await page.request.get(`${api}/api/blueprints/defaults`)).json();
  const map = layout.maps.farm;
  delete map.world2; map.objects = []; map.collisionRegions = []; map.terrainRegions = []; map.warps = [];
  map.baseTileType = "grass"; map.farmAreas = [{ startX: 34, endX: 46, startY: 34, endY: 46 }];
  Object.assign(map.spawns.find((s: any) => s.id === "farm_entry"), { tileX: 40.5, tileY: 40.5, facing: "right" });
  map.objects.push({ id: "water-well", assetId: "stone_well", kind: "well", position: { tileX: 42.5, tileY: 40.5 } });
  const draft = await (await page.request.post(`${api}/api/blueprints`, { data: layout })).json();
  expect((await page.request.post(`${api}/api/blueprints/${draft.id}`, {
    headers: { Authorization: `Bearer ${draft.editToken}` }, data: { layout, revision: draft.revision, publish: true },
  })).ok()).toBe(true);
  await page.addInitScript(id => { localStorage.setItem("farm-active-blueprint", id); localStorage.setItem("farm-zoom", "1"); }, draft.id);
  await page.goto("/"); await page.locator("#nickname").fill("햇빛 농부"); await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected", { timeout: 20000 });
  await page.waitForFunction(() => (window.__FARM_DEBUG__ as any).scene().objects.has("water-well"));
  await waitForFarmInput(page);
  // The software WebGL startup can reconnect while the first input batch is
  // draining. Observe another uninterrupted batch before single-shot actions.
  await waitForFarmInput(page);
  await page.evaluate(() => {
    const s = (window.__FARM_DEBUG__ as any).scene(), original = s.actionFeedback.bind(s);
    (window as any).__sunFx = [];
    s.actionFeedback = (fx: any) => { (window as any).__sunFx.push(fx); original(fx); };
  });
}
const stamina = (page: Page) => page.evaluate(() => window.__FARM_DEBUG__.snapshot().players.find(p => p.local)?.stamina);
async function idle(page: Page) {
  await page.waitForFunction(() => {
    const d = window.__FARM_DEBUG__ as any, s = d.snapshot(), p = s.players.find((p: any) => p.local);
    return s.status === "connected" && p && !d.scene().actionBusy(p.id) && !p.moving;
  });
}
async function point(page: Page, x: number, y: number) {
  return page.evaluate(p => window.__FARM_DEBUG__.screenPoint(p.x, p.y), { x, y });
}
for (const mobile of [false, true]) test(`${mobile ? "phone touch" : "PC mouse/keyboard"}: water priority, empty pour and exactly one charge`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1080, height: 800 });
  await openClearFarm(page);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.locator("#tool").selectOption("water");
  await page.locator("#tool").evaluate(e => (e as HTMLElement).blur());
  const before = (await stamina(page))!;
  if (mobile) { const b = await page.locator("#action").boundingBox(); await page.touchscreen.tap(b!.x + b!.width / 2, b!.y + b!.height / 2); }
  else await page.keyboard.press("Space");
  await expect.poll(() => stamina(page), { timeout: 15000 }).toBe(before - 1);
  await page.waitForFunction(() => {
    const s = (window.__FARM_DEBUG__ as any).scene();
    return [...s.feedback.swings.values()].some((v: any) => v.event.tool === "water" && v.event.outcome === "fail" && s.time.now - v.start > 240 && s.time.now - v.start < 590 && v.rig.trail.commandBuffer.length > 0);
  });
  await page.screenshot({ path: info.outputPath("empty-pour.png") });
  // Capturing software WebGL can interrupt the room after idle first becomes
  // true. Observe live input acknowledgements before the next single charge.
  await waitForFarmInput(page);
  await idle(page);
  const well = await point(page, 42.5 * 32, 40.5 * 32);
  if (mobile) await page.touchscreen.tap(well.x, well.y); else await page.mouse.click(well.x, well.y);
  await expect.poll(() => stamina(page)).toBe(before - 2);
  expect(await page.evaluate(() => (window as any).__sunFx.at(-1).action)).toBe("waterCrop");
  await expect(page.locator("#tool")).toHaveValue("water");
  await idle(page);
  // A real planted tile still waters; the same pointer handler is used on PC and phone.
  const plot = { x: 37.5 * 32, y: 40.5 * 32 }, id = "soil-farm-37-40";
  const tapPlot = async (tool: string, done: () => Promise<boolean>) => {
    await idle(page);
    const read = () => page.evaluate(id => {
      const s = window.__FARM_DEBUG__.snapshot();
      return { connection: s.reconnectCount, entity: window.__FARM_DEBUG__.state()?.entities[id],
        stamina: s.players.find(p => p.local)?.stamina, fx: (window as any).__sunFx.length,
        seeds: document.querySelector('#tool option[value="sproutberry_seed"]')?.textContent };
    }, id);
    let before = await read();
    for (let attempt = 0; attempt < 3; attempt++) {
      await idle(page); await page.locator("#tool").selectOption(tool);
      const p = await point(page, plot.x, plot.y);
      if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await expect.poll(async () => (await done()) || (await read()).connection !== before.connection,
        { timeout: 15000 }).toBe(true);
      if (await done()) return;
      // Reconnect intentionally cancels walk-and-use. Re-tap only after live
      // acknowledgements prove the old command changed no tile, seed, energy
      // or committed effect. A failed/duplicate tool use must still fail here.
      await waitForFarmInput(page);
      if (await done()) return;
      const after = await read();
      expect(after.connection).toBeGreaterThan(before.connection);
      expect({ ...after, connection: before.connection }).toEqual(before);
      before = after;
    }
    throw Error(`Repeated reconnects prevented ${tool} on the test plot`);
  };
  const kindIs = (kind: string) => page.evaluate(({ id, kind }) => window.__FARM_DEBUG__.state()?.entities[id]?.kind === kind, { id, kind });
  await tapPlot("hoe", () => kindIs("soil"));
  await expect.poll(() => page.evaluate(id => window.__FARM_DEBUG__.state()?.entities[id]?.kind, id)).toBe("soil");
  await tapPlot("sproutberry_seed", () => kindIs("crop"));
  await expect.poll(() => page.evaluate(id => window.__FARM_DEBUG__.state()?.entities[id]?.kind, id)).toBe("crop");
  const preWater = (await stamina(page))!; await tapPlot("water", async () => (await stamina(page)) === preWater - 1);
  await expect.poll(() => page.evaluate(id => (window.__FARM_DEBUG__.state()?.entities[id] as any)?.watered, id)).toBe(true);
  await expect.poll(() => stamina(page)).toBe(preWater - 1); await idle(page);
  await tapPlot("water", async () => (await stamina(page)) === preWater - 2); await expect.poll(() => stamina(page)).toBe(preWater - 2); await idle(page);
  expect(errors).toEqual([]);
});

test("seed light in the live scene and botanical growth contact sheet", async ({ page }, info) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 1280, height: 1000 }); await openClearFarm(page);
  const measured = await page.evaluate(async () => {
    const d = window.__FARM_DEBUG__ as any, s = d.scene(), original = s.onFrame;
    const frame = original(performance.now(), 16), me = frame.snapshot.players.find((p: any) => p.local);
    const e = { id: "qa-seed", area: me.area, kind: "crop", asset: "tile_farm_empty", crop: "goldcorn", stage: 0, watered: false, x: me.x + 32, y: me.y + 32, hp: 0, item: "", quantity: 0 };
    s.scene.pause(); const values: any[] = [];
    for (const minute of [720, 1080, 1380]) {
      s.onFrame = () => ({ snapshot: frame.snapshot, state: { ...frame.state.toJSON(), minute, entities: new Map([[e.id, e]]) } });
      s.update(1000, 16); const v = s.objects.get(e.id);
      values.push({ alpha: v.seedGlow.alpha, glow: v.seedGlow.visible, seed: v.body.visible });
    }
    e.stage = 1; s.update(1000, 16); values.push({ sproutHasGlow: !!s.objects.get(e.id).seedGlow });
    s.onFrame = original;
    return values;
  });
  expect(measured[0].alpha).toBeGreaterThan(measured[1].alpha); expect(measured[1].alpha).toBeGreaterThan(0);
  expect(measured[2]).toEqual({ alpha: 0, glow: false, seed: true }); expect(measured[3].sproutHasGlow).toBe(false);
  await page.evaluate(async () => {
    const mod = "/shared/sunlight.ts", { currentLightLevel, seedGlowVisibility } = await import(mod);
    const s = (window.__FARM_DEBUG__ as any).scene();
    s.children.list.forEach((o: any) => o.setVisible?.(false)); s.feedback.clear();
    s.cameras.main.stopFollow().removeBounds().setOrigin(0, 0).setScroll(0, 0).setZoom(2);
    s.cameras.main.setBackgroundColor("#829069");
    for (const el of document.querySelectorAll<HTMLElement>("body > :not(#arena):not(script)")) el.style.visibility = "hidden";
    document.querySelector<HTMLElement>("#arena")!.style.visibility = "visible";
    const ids = ["goldcorn", "morningcarrot", "pinktulip", "coolcucumber", "ribboncabbage", "sunpotato", "lavender"];
    const headers = ["Noon dry", "Noon wet", "Dusk wet", "Night wet", "Sprout", "Growing", "Mature"];
    headers.forEach((title, i) => s.add.text(105 + i * 74, 55, title, { fontSize: "9px", color: "#fff3d0" }));
    ids.forEach((id, row) => {
      const y = 108 + row * 53; s.add.text(4, y - 12, id, { fontSize: "8px", color: "#fff3d0" });
      headers.forEach((_title, col) => {
        const x = 130 + col * 74, stage = col < 4 ? "seed" : ["sprout", "growing", "mature"][col - 4];
        s.add.image(x, y, "tile_farm_empty").setDisplaySize(32, 32).setTint(col > 0 && col < 4 ? 0xa07a62 : 0xffffff);
        s.add.image(x, y, `crop_${id}_${stage}`).setOrigin(.5, .8).setDisplaySize(40, 52);
        if (col < 4) s.add.image(x, y, `crop_${id}_glow`).setOrigin(.5, .8)
          .setAlpha(seedGlowVisibility(currentLightLevel({ minute: [720, 720, 1080, 1380][col] })));
      });
    });
  });
  await page.waitForTimeout(80); await page.screenshot({ path: info.outputPath("seed-light-growth.png") });
});
