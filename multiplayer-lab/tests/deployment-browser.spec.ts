import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const BUILT_ENDPOINT = 'wss://lab-validation.invalid';
const LOCAL_BACKEND = 'http://127.0.0.1:2571';
const LOCAL_FRONTEND = 'http://127.0.0.1:5176';

type FixtureWindow = Window & { __LAB_FIXTURE_REQUESTED_WEBSOCKETS__: string[] };

async function forwardProductionTransport(context: BrowserContext): Promise<string[]> {
  const requests: string[] = [];
  await context.route('https://lab-validation.invalid/**', async (route) => {
    const original = new URL(route.request().url());
    requests.push(original.href);
    const response = await route.fetch({ url: `${LOCAL_BACKEND}${original.pathname}${original.search}` });
    await route.fulfill({ response });
  });
  await context.addInitScript(({ endpoint, localBackend }) => {
    const requested: string[] = [];
    (window as unknown as FixtureWindow).__LAB_FIXTURE_REQUESTED_WEBSOCKETS__ = requested;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const original = new URL(String(url));
        const fixtureTarget = original.origin === endpoint
          ? `ws://${new URL(localBackend).host}${original.pathname}${original.search}`
          : original.href;
        // Native construction preserves the SDK's synchronous invalid-protocol
        // fallback and transports real Colyseus frames to the compiled server.
        // Playwright 1.63 connectToServer() has no destination-URL override.
        super(fixtureTarget, protocols);
        requested.push(original.href);
      }
    };
  }, { endpoint: BUILT_ENDPOINT, localBackend: LOCAL_BACKEND });
  return requests;
}

async function enter(page: Page, name: string, roomCode?: string): Promise<string> {
  await page.goto(LOCAL_FRONTEND);
  await page.locator('#nickname').fill(name);
  if (roomCode) {
    await page.locator('#room-code').fill(roomCode);
    await page.locator('#join-room').click();
  } else {
    await page.locator('#create-room').click();
  }
  await expect(page.locator('#connection-status')).toHaveAttribute('data-state', 'connected');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#hud-authority')).not.toHaveText('—');
  expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, '__LAB_DEBUG__'))).toBe(false);
  return (await page.locator('#room-code').inputValue()).trim();
}

async function authoritativeX(page: Page): Promise<number> {
  const position = await page.locator('#hud-authority').innerText();
  return Number(position.split(',')[0]);
}

/** Read actual displayed blue-player pixels, without development state hooks. */
async function bluePlayerCentroid(page: Page): Promise<{ x: number; y: number; pixels: number } | null> {
  const screenshot = await page.locator('canvas').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot decode the canvas screenshot');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    let xSum = 0;
    let ySum = 0;
    for (let pixel = 0; pixel < pixels.length; pixel += 4) {
      // First room member's visible fill is #60a5fa; exclude antialiased edges.
      if (Math.abs(pixels[pixel]! - 96) <= 5 && Math.abs(pixels[pixel + 1]! - 165) <= 5 &&
          Math.abs(pixels[pixel + 2]! - 250) <= 5 && pixels[pixel + 3]! >= 250) {
        const index = pixel / 4;
        xSum += index % canvas.width;
        ySum += Math.floor(index / canvas.width);
        count++;
      }
    }
    return count ? { x: xSum / count, y: ySum / count, pixels: count } : null;
  }, screenshot.toString('base64'));
}

test('compiled production client and server support desktop plus portrait multiplayer', async ({ browser, request }, testInfo) => {
  const frontendHealth = await request.get(`${LOCAL_FRONTEND}/healthz`);
  expect(frontendHealth.status()).toBe(200);
  expect(await frontendHealth.json()).toMatchObject({ status: 'ok', service: 'jiwoos-multiplayer-lab-client' });
  const backendHealth = await request.get(`${LOCAL_BACKEND}/healthz`);
  expect(backendHealth.status()).toBe(200);
  expect(await backendHealth.json()).toMatchObject({ status: 'ok', latencyMs: 0 });

  const desktopContext = await browser.newContext({ viewport: { width: 900, height: 720 } });
  const portraitContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  try {
    const desktopRequests = await forwardProductionTransport(desktopContext);
    const portraitRequests = await forwardProductionTransport(portraitContext);
    const desktop = await desktopContext.newPage();
    const portrait = await portraitContext.newPage();
    const errors: string[] = [];
    desktop.on('pageerror', (error) => errors.push(error.message));
    portrait.on('pageerror', (error) => errors.push(error.message));
    const roomCode = await enter(desktop, 'Built desktop');
    expect(roomCode).not.toBe('');
    expect(await enter(portrait, 'Built portrait', roomCode)).toBe(roomCode);
    await expect(desktop.locator('#hud-players')).toHaveText('2');
    await expect(portrait.locator('#hud-players')).toHaveText('2');

    for (const id of ['#joystick', '#run-button']) {
      await expect(portrait.locator(id)).toBeVisible();
      const bounds = await portrait.locator(id).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    }
    expect(await portrait.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await expect.poll(async () => (await bluePlayerCentroid(portrait))?.pixels ?? 0).toBeGreaterThan(10);
    const before = (await bluePlayerCentroid(portrait))!;
    const initialX = await authoritativeX(desktop);
    const observerOwnX = await authoritativeX(portrait);
    await desktop.keyboard.down('d');
    await expect.poll(() => authoritativeX(desktop)).toBeGreaterThan(initialX + 50);
    await desktop.keyboard.up('d');
    // Only A moves: B's HUD remains its own position while A's visible circle
    // moves in B's rendered canvas after authoritative state propagation.
    await expect.poll(async () => (await bluePlayerCentroid(portrait))?.x ?? before.x).toBeGreaterThan(before.x + 10);
    expect(await authoritativeX(portrait)).toBe(observerOwnX);
    const after = (await bluePlayerCentroid(portrait))!;

    for (const [page, restRequests] of [[desktop, desktopRequests], [portrait, portraitRequests]] as const) {
      expect(restRequests.length).toBeGreaterThan(0);
      expect(restRequests.every((url) => new URL(url).origin === 'https://lab-validation.invalid')).toBe(true);
      const sockets = await page.evaluate(() => (window as unknown as FixtureWindow).__LAB_FIXTURE_REQUESTED_WEBSOCKETS__);
      expect(sockets.length).toBeGreaterThan(0);
      expect(sockets.every((url) => new URL(url).origin === BUILT_ENDPOINT)).toBe(true);
    }
    expect(errors).toEqual([]);
    await testInfo.attach('production-artifact-evidence.json', {
      body: JSON.stringify({ roomCode, initialX, finalX: await authoritativeX(desktop), observerOwnX, before, after,
        configuredEndpoint: BUILT_ENDPOINT, fixtureForwarding: true, publicTlsValidated: false, productionLatencyMs: 0 }, null, 2),
      contentType: 'application/json',
    });
  } finally {
    await desktopContext.close();
    await portraitContext.close();
  }
});
