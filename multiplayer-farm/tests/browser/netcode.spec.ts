import { test, expect, type Page } from "@playwright/test";
import type { NetworkSnapshot } from "../../client/network.js";
type DebugWindow = { __FARM_DEBUG__: { snapshot: () => NetworkSnapshot } };
type ResponseMeasurement = {
  localResponseMs: number;
  authoritativeDistanceAtResponse: number;
};
type ProbeWindow = { __FARM_TEST_RESPONSE__?: Promise<ResponseMeasurement> };
async function snapshot(page: Page): Promise<NetworkSnapshot> {
  return page.evaluate(() =>
    (window as unknown as DebugWindow).__FARM_DEBUG__.snapshot(),
  );
}
async function enter(page: Page, name: string, farmId?: string) {
  await page.goto("/");
  await page.locator("#nickname").fill(name);
  if (farmId) {
    await page.locator("#farm-code").fill(farmId);
    await page.locator("#join-farm").click();
  } else await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden();
  await expect
    .poll(async () => (await snapshot(page)).local !== null)
    .toBe(true);
  return {
    roomId: await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("farm-v26-session")!).farmId as string,
    ),
    sessionId: (await snapshot(page)).sessionId,
  };
}
test("two browser contexts: prediction responds before authority and remote rendering interpolates", async ({
  browser,
}, testInfo) => {
  const a = await browser.newContext({ viewport: { width: 900, height: 720 } });
  const b = await browser.newContext({ viewport: { width: 900, height: 720 } });
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    const errors: string[] = [];
    pageA.on("pageerror", (error) => errors.push(error.message));
    pageB.on("pageerror", (error) => errors.push(error.message));
    const initial = await enter(pageA, "Desktop A");
    await enter(pageB, "Desktop B", initial.roomId);
    await expect
      .poll(async () => (await snapshot(pageA)).players.length)
      .toBe(2);
    await expect
      .poll(async () => (await snapshot(pageB)).players.length)
      .toBe(2);

    // Start a measurement at the actual browser key event, not the test RPC.
    await pageA.evaluate(() => {
      (window as unknown as ProbeWindow).__FARM_TEST_RESPONSE__ =
        new Promise<ResponseMeasurement>((resolve, reject) => {
          const startState = (
            window as unknown as DebugWindow
          ).__FARM_DEBUG__.snapshot();
          if (!startState.local)
            return reject(new Error("Missing local player"));
          const baseline = startState.local.authoritative;
          const renderStart = startState.players.find((player) => player.local);
          if (!renderStart)
            return reject(new Error("Missing rendered local player"));
          const timeout = setTimeout(
            () => reject(new Error("No local rendered movement")),
            2_000,
          );
          window.addEventListener(
            "keydown",
            () => {
              const started = performance.now();
              function frame(): void {
                const state = (
                  window as unknown as DebugWindow
                ).__FARM_DEBUG__.snapshot();
                const rendered = state.players.find((player) => player.local);
                if (
                  state.local &&
                  rendered &&
                  Math.abs(rendered.x - renderStart!.x) > 0.5
                ) {
                  clearTimeout(timeout);
                  resolve({
                    localResponseMs: performance.now() - started,
                    authoritativeDistanceAtResponse: Math.hypot(
                      state.local.authoritative.x - baseline.x,
                      state.local.authoritative.y - baseline.y,
                    ),
                  });
                } else requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
            },
            { once: true },
          );
        });
    });
    await pageA.keyboard.down("d");
    const responsiveness = await pageA.evaluate(
      () => (window as unknown as ProbeWindow).__FARM_TEST_RESPONSE__!,
    );
    expect(responsiveness.localResponseMs).toBeLessThan(100);
    expect(responsiveness.authoritativeDistanceAtResponse).toBeLessThan(0.1);

    const frames = await pageB.evaluate(async (id) => {
      const points: Array<{ time: number; x: number; authoritativeX: number }> =
        [];
      const started = performance.now();
      await new Promise<void>((resolve) => {
        let frameHandle = 0;
        const finish = () => {
          clearTimeout(deadline);
          cancelAnimationFrame(frameHandle);
          resolve();
        };
        const deadline = setTimeout(finish, 4_000);
        function sample(): void {
          const player = (window as unknown as DebugWindow).__FARM_DEBUG__
            .snapshot()
            .players.find((entry) => entry.id === id);
          if (player)
            points.push({
              time: performance.now(),
              x: player.x,
              authoritativeX: player.authoritativeX,
            });
          const elapsed = performance.now() - started;
          // Measure enough displayed positions even on a loaded software-GPU
          // runner; elapsed time alone is not an interpolation sample budget.
          if ((points.length >= 30 && elapsed >= 800) || elapsed >= 4_000)
            finish();
          else frameHandle = requestAnimationFrame(sample);
        }
        frameHandle = requestAnimationFrame(sample);
      });
      return points;
    }, initial.sessionId);
    await pageA.keyboard.up("d");
    expect(frames.length).toBeGreaterThanOrEqual(30);
    expect(frames.at(-1)!.x - frames[0]!.x).toBeGreaterThan(20);
    // Record motion between patches and independently require intermediate
    // positions. Software-rendered CI can run below 30 FPS, so demanding a
    // minimum count of frames per server tick would test the host's GPU budget.
    const betweenPatchFrames = frames
      .slice(1)
      .filter(
        (point, index) =>
          point.authoritativeX === frames[index]!.authoritativeX &&
          Math.abs(point.x - frames[index]!.x) > 0.01,
      ).length;
    const authoritativePositions = frames.map((point) => point.authoritativeX);
    const interpolatedFrames = frames.filter(
      (point) =>
        point.x > authoritativePositions[0]! &&
        point.x < point.authoritativeX &&
        authoritativePositions.every(
          (position) => Math.abs(point.x - position) > 0.01,
        ),
    ).length;
    await testInfo.attach("prediction-and-interpolation.json", {
      body: JSON.stringify(
        {
          responsiveness,
          betweenPatchFrames,
          interpolatedFrames,
          frameCount: frames.length,
          frames,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(interpolatedFrames).toBeGreaterThan(8);
    await expect
      .poll(async () => {
        const local = (await snapshot(pageA)).local;
        const remote = (await snapshot(pageB)).players.find(
          (entry) => entry.id === initial.sessionId,
        );
        return local && remote
          ? Math.abs(local.authoritative.x - remote.authoritativeX)
          : Infinity;
      })
      .toBeLessThan(0.1);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
