import { expect, test, devices, type Page } from '@playwright/test';

type Position = { x: number; y: number };
type DebugSnapshot = {
  status: string;
  roomId: string;
  sessionId: string;
  players: Array<{
    id: string;
    x: number;
    y: number;
    authoritativeX: number;
    authoritativeY: number;
    local: boolean;
  }>;
  local: { predicted: Position; authoritative: Position } | null;
  reconnectCount: number;
  input: { moveX: number; moveY: number; run: boolean };
};
type DebugWindow = Window & { readonly __LAB_DEBUG__: DebugSnapshot };
type ResponseMeasurement = { localResponseMs: number; authoritativeDistanceAtResponse: number };
type ProbeWindow = DebugWindow & {
  __LAB_TEST_RESPONSE__?: Promise<ResponseMeasurement>;
  __LAB_TEST_SOCKETS__?: WebSocket[];
};

async function observeSockets(page: Page): Promise<void> {
  // Keep native WebSocket behavior, including its synchronous invalid-protocol
  // exception used by the SDK's Node/browser constructor fallback. Playwright's
  // routeWebSocket wrapper cannot model that fallback in SDK 0.18.5.
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    (window as unknown as ProbeWindow).__LAB_TEST_SOCKETS__ = sockets;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).startsWith('ws://127.0.0.1:2569/')) sockets.push(this);
      }
    };
  });
}

async function interruptSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    const socket = (window as unknown as ProbeWindow).__LAB_TEST_SOCKETS__?.find((candidate) => candidate.readyState === WebSocket.OPEN);
    if (!socket) throw new Error('No live Lab WebSocket to interrupt');
    // No application LEAVE_ROOM message: the server reserves this session.
    socket.close(4010, 'browser test transport interruption');
  });
}

async function snapshot(page: Page): Promise<DebugSnapshot> {
  return page.evaluate(() => (window as unknown as DebugWindow).__LAB_DEBUG__);
}

async function enter(page: Page, nickname: string, roomId?: string): Promise<DebugSnapshot> {
  await page.goto('/');
  await page.locator('#nickname').fill(nickname);
  if (roomId) {
    await page.locator('#room-code').fill(roomId);
    await page.locator('#join-room').click();
  } else {
    await page.locator('#create-room').click();
  }
  await expect.poll(async () => (await snapshot(page)).local !== null).toBe(true);
  await expect(page.locator('canvas')).toBeVisible();
  // Let netcode clock sync complete before measuring a fresh input.
  await page.waitForTimeout(700);
  return snapshot(page);
}

test('two browser contexts: prediction responds before authority and remote rendering interpolates', async ({ browser }, testInfo) => {
  const a = await browser.newContext({ viewport: { width: 900, height: 720 } });
  const b = await browser.newContext({ viewport: { width: 900, height: 720 } });
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    const errors: string[] = [];
    pageA.on('pageerror', (error) => errors.push(error.message));
    pageB.on('pageerror', (error) => errors.push(error.message));
    const initial = await enter(pageA, 'Desktop A');
    await enter(pageB, 'Desktop B', initial.roomId);
    await expect.poll(async () => (await snapshot(pageA)).players.length).toBe(2);
    await expect.poll(async () => (await snapshot(pageB)).players.length).toBe(2);

    // Start a measurement at the actual browser key event, not the test RPC.
    await pageA.evaluate(() => {
      (window as unknown as ProbeWindow).__LAB_TEST_RESPONSE__ = new Promise<ResponseMeasurement>((resolve, reject) => {
      const startState = (window as unknown as DebugWindow).__LAB_DEBUG__;
      if (!startState.local) return reject(new Error('Missing local player'));
      const baseline = startState.local.authoritative;
      const renderStart = startState.players.find((player) => player.local);
      if (!renderStart) return reject(new Error('Missing rendered local player'));
      const timeout = setTimeout(() => reject(new Error('No local rendered movement')), 2_000);
      window.addEventListener('keydown', () => {
        const started = performance.now();
        function frame(): void {
          const state = (window as unknown as DebugWindow).__LAB_DEBUG__;
          const rendered = state.players.find((player) => player.local);
          if (state.local && rendered && Math.abs(rendered.x - renderStart!.x) > 0.5) {
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
      }, { once: true });
      });
    });
    await pageA.keyboard.down('d');
    const responsiveness = await pageA.evaluate(() => (window as unknown as ProbeWindow).__LAB_TEST_RESPONSE__!);
    expect(responsiveness.localResponseMs).toBeLessThan(100);
    expect(responsiveness.authoritativeDistanceAtResponse).toBeLessThan(0.1);

    const frames = await pageB.evaluate(async (id) => {
      const points: Array<{ time: number; x: number; authoritativeX: number }> = [];
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
          const player = (window as unknown as DebugWindow).__LAB_DEBUG__.players.find((entry) => entry.id === id);
          if (player) points.push({ time: performance.now(), x: player.x, authoritativeX: player.authoritativeX });
          const elapsed = performance.now() - started;
          // Measure enough displayed positions even on a loaded software-GPU
          // runner; elapsed time alone is not an interpolation sample budget.
          if ((points.length >= 30 && elapsed >= 800) || elapsed >= 4_000) finish();
          else frameHandle = requestAnimationFrame(sample);
        }
        frameHandle = requestAnimationFrame(sample);
      });
      return points;
    }, initial.sessionId);
    await pageA.keyboard.up('d');
    expect(frames.length).toBeGreaterThanOrEqual(30);
    expect(frames.at(-1)!.x - frames[0]!.x).toBeGreaterThan(20);
    // Record motion between patches and independently require intermediate
    // positions. Software-rendered CI can run below 30 FPS, so demanding a
    // minimum count of frames per server tick would test the host's GPU budget.
    const betweenPatchFrames = frames.slice(1).filter((point, index) =>
      point.authoritativeX === frames[index]!.authoritativeX && Math.abs(point.x - frames[index]!.x) > 0.01,
    ).length;
    const authoritativePositions = frames.map((point) => point.authoritativeX);
    const interpolatedFrames = frames.filter((point) =>
      point.x > authoritativePositions[0]! && point.x < point.authoritativeX &&
      authoritativePositions.every((position) => Math.abs(point.x - position) > 0.01),
    ).length;
    await testInfo.attach('prediction-and-interpolation.json', {
      body: JSON.stringify({ responsiveness, betweenPatchFrames, interpolatedFrames, frameCount: frames.length, frames }, null, 2),
      contentType: 'application/json',
    });
    expect(interpolatedFrames).toBeGreaterThan(8);
    await expect.poll(async () => {
      const local = (await snapshot(pageA)).local;
      const remote = (await snapshot(pageB)).players.find((entry) => entry.id === initial.sessionId);
      return local && remote ? Math.abs(local.authoritative.x - remote.authoritativeX) : Infinity;
    }).toBeLessThan(0.1);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('unexpected WebSocket interruption reconnects to the same player and room', async ({ page }) => {
  await observeSockets(page);
  const initial = await enter(page, 'Reconnect');
  await interruptSocket(page);
  await expect.poll(async () => (await snapshot(page)).reconnectCount, { timeout: 15_000 }).toBeGreaterThan(0);
  const restored = await snapshot(page);
  expect(restored.roomId).toBe(initial.roomId);
  expect(restored.sessionId).toBe(initial.sessionId);
  expect(restored.players.length).toBe(1);
  const startX = restored.local!.authoritative.x;
  await page.keyboard.down('d');
  await expect.poll(async () => (await snapshot(page)).local!.authoritative.x).toBeGreaterThan(startX + 10);
  await page.keyboard.up('d');
});

test('leaving during reconnect cancels retries and never reopens a ghost connection', async ({ page }) => {
  await observeSockets(page);
  await enter(page, 'Cancel reconnect');
  await interruptSocket(page);
  await expect.poll(async () => (await snapshot(page)).status).toBe('reconnecting');
  await page.locator('#leave-room').click();
  await expect.poll(async () => (await snapshot(page)).status).toBe('disconnected');
  await page.waitForTimeout(2_000);
  const state = await snapshot(page);
  expect(state.status).toBe('disconnected');
  expect(state.local).toBeNull();
  expect(state.players).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).__LAB_TEST_SOCKETS__?.filter((socket) =>
    socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING,
  ).length)).toBe(0);
  await expect(page.locator('#create-room')).toBeEnabled();
});

test('Android viewport supports simultaneous joystick and run touches without scrolling', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  try {
    const page = await context.newPage();
    const initial = await enter(page, 'Android touch');
    const joystick = await page.locator('#joystick').boundingBox();
    const run = await page.locator('#run-button').boundingBox();
    expect(joystick).not.toBeNull();
    expect(run).not.toBeNull();
    const touch = await context.newCDPSession(page);
    const origin = { x: joystick!.x + joystick!.width / 2, y: joystick!.y + joystick!.height / 2, id: 1 };
    const right = { ...origin, x: origin.x + joystick!.width * 0.35 };
    const runPoint = { x: run!.x + run!.width / 2, y: run!.y + run!.height / 2, id: 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [origin] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right, runPoint] });
    await expect.poll(async () => (await snapshot(page)).input).toMatchObject({ run: true, moveY: 0 });
    expect((await snapshot(page)).input.moveX).toBeGreaterThan(0.5);
    await expect.poll(async () => (await snapshot(page)).local!.authoritative.x).toBeGreaterThan(initial.local!.authoritative.x + 20);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await snapshot(page)).input).toEqual({ moveX: 0, moveY: 0, run: false });
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, scale: visualViewport?.scale }))).toEqual({ x: 0, y: 0, scale: 1 });
    await touch.detach();
  } finally {
    await context.close();
  }
});
