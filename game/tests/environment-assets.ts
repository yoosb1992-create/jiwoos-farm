import { strict as assert } from "node:assert";
import { AssetManager } from "../assets/AssetManager";
import { CROP_ASSETS, ITEM_ASSETS, TILE_ASSETS, WORLD_OBJECT_ASSETS } from "../assets/definitions";
import { readAssetPng } from "./png";

const visuals = [...Object.values(TILE_ASSETS), ...Object.values(WORLD_OBJECT_ASSETS), ...Object.values(CROP_ASSETS)];
const active = [...visuals, ...Object.values(ITEM_ASSETS)].filter((asset) => asset.source?.kind === "image");
for (const asset of active) {
  const png = readAssetPng(asset.source!.path);
  const size = "frameSize" in asset ? asset.frameSize : { width: 32, height: 32 };
  assert.equal(png.width, size.width, asset.assetId); assert.equal(png.height, size.height, asset.assetId);
  const alpha = png.pixels.filter((_, index) => index % 4 === 3);
  assert.ok(alpha.some((value) => value > 0), `${asset.assetId}: nonempty`);
  if (asset.assetId.startsWith("tile_")) {
    assert.ok(alpha.every((value) => value === 255));
    const pixel = (x: number, y: number) => png.pixels.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4);
    for (let i = 0; i < 32; i++) {
      assert.deepEqual(pixel(0, i), pixel(31, i), `${asset.assetId}: horizontal seam`);
      assert.deepEqual(pixel(i, 0), pixel(i, 31), `${asset.assetId}: vertical seam`);
    }
  } else assert.ok(alpha.some((value) => value === 0), `${asset.assetId}: transparent background`);
}
// Missing (including decoder failures) must recover; successfully loaded textures must stay intact.
for (const loaded of [false, true]) {
  const keys = new Set(loaded ? visuals.map((a) => a.textureKey) : []);
  const generated: string[] = [], queued: string[] = [];
  const graphics: any = new Proxy({}, { get: (_target, method) => (...args: any[]) => {
    if (method === "generateTexture") { keys.add(args[0]); generated.push(args[0]); }
    return graphics;
  } });
  const manager = new AssetManager({
    textures: { exists: (key: string) => keys.has(key), remove: (key: string) => keys.delete(key) },
    add: { graphics: () => graphics },
    load: { image: (key: string) => queued.push(key), spritesheet: () => undefined },
  } as never);
  manager.preload(); manager.createFallbackTextures();
  for (const asset of active) assert.ok(queued.includes(asset.textureKey), `${asset.assetId}: preload`);
  for (const asset of visuals) {
    assert.ok(keys.has(asset.textureKey), `${asset.assetId}: fallback`);
    assert.equal(generated.includes(asset.textureKey), !loaded, `${asset.assetId}: preserve loaded PNG`);
  }
}
console.log(`Environment assets: ${active.length} PNGs decoded; sizes, alpha, seams, loading and fallback passed`);
