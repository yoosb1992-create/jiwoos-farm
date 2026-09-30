import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  PLAYER_ASSET,
  WORLD_OBJECT_ASSETS,
  WORLD_OVERLAY_DEPTH,
  depthFromGroundAnchor,
  depthFromWorldY,
} from "../assets/definitions";

assert.ok(depthFromWorldY(200) < depthFromWorldY(300), "world depth follows ground Y");
const tree = WORLD_OBJECT_ASSETS.tree;
const treeBehind = depthFromGroundAnchor({ x: 0, y: 200 }, tree);
const playerFront = depthFromGroundAnchor({ x: 0, y: 240 }, PLAYER_ASSET);
assert.ok(treeBehind < playerFront, "an actor with the lower ground anchor renders in front");
assert.ok(WORLD_OVERLAY_DEPTH > depthFromWorldY(26 * 32 + 200), "labels/UI stay above the playable farm y-sort range");

const worldSource = readFileSync(new URL("../rendering/WorldRenderer.ts", import.meta.url), "utf8");
const sceneSource = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const npcSource = readFileSync(new URL("../npc/NpcRenderer.ts", import.meta.url), "utf8");
const remoteSource = readFileSync(new URL("../family/RemotePlayers.ts", import.meta.url), "utf8");

assert.ok(worldSource.includes("worldViews"), "world sprites are separated from the terrain container so actors can interleave");
assert.ok(worldSource.includes("depthFromGroundAnchor(position, asset, finalDisplaySize)"), "map objects use their authored ground anchor");
assert.ok(worldSource.includes("depthFromGroundAnchor({ x, y }, asset)"), "placed objects/buildings/animals use y-sort depth");
assert.ok(sceneSource.includes("updatePlayerDepth()"), "local player refreshes depth while moving");
assert.ok(!sceneSource.includes(".setOrigin(playerAsset.origin.x, playerAsset.origin.y).setDepth(20)"), "local player no longer uses fixed depth 20");
assert.ok(npcSource.includes("depthFromGroundAnchor"), "NPCs join the same y-sort contract");
assert.ok(remoteSource.includes("depthFromGroundAnchor"), "remote Family players join the same y-sort contract");

console.log("Ground-anchor Y-sort: world objects, local/remote players and NPCs share one depth contract");
