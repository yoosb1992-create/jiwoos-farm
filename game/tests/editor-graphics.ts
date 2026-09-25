import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorCanvas } from "../../app/editor/EditorCanvas";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { TILE_ASSETS, WORLD_OBJECT_ASSETS, type WorldObjectAssetId } from "../assets/definitions";

const map = structuredClone(MAP_DEFINITIONS.farm);
map.objects = (Object.keys(WORLD_OBJECT_ASSETS) as WorldObjectAssetId[]).map((assetId, i) => ({ id: `test-${i}`, assetId, position: { tileX: i * 3, tileY: 5 } }));
const before = JSON.stringify(map);
const markup = renderToStaticMarkup(createElement(EditorCanvas, {
  map, tool: "select", terrain: "grass", objectAssetId: "house", snapMode: "tile", selection: null,
  layers: { terrain: true, objects: true, collision: true, farm: true, spawn: true, warp: true, grid: true },
  onSelect: () => {}, onCommit: () => {}, onBeginContinuous: () => {}, onContinuous: () => {},
}));
for (const asset of Object.values(WORLD_OBJECT_ASSETS)) assert.ok(markup.includes(`href="${asset.source.path}"`), `${asset.assetId}: editor uses shared PNG`);
assert.ok(markup.includes(`href="${TILE_ASSETS.tile_grass.source!.path}"`));
assert.ok(markup.includes('patternUnits="userSpaceOnUse"'));
assert.ok(markup.includes('image-rendering:pixelated'));
assert.equal(JSON.stringify(map), before, "graphics rendering must not modify map documents");
console.log("Editor graphics: shared tile/object images rendered, map document unchanged");
