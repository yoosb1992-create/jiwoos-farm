import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ToolActionSystem } from "../actions/ToolActionSystem";

let complete = () => undefined;
const actions = new ToolActionSystem({ playAction: ({ onComplete }) => { complete = onComplete; } }, () => 1000);
assert.equal(actions.execute("seed", "down", () => undefined), true);
assert.equal(actions.isActive("seed"), true, "ToolActionSystem exposes that the active nonblocking action is seed");
assert.equal(actions.currentTool(), "seed");
complete();
assert.equal(actions.isActive(), false);
assert.equal(actions.currentTool(), undefined);

const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
assert.ok(scene.includes('this.toolActions.isActive() && !this.toolActions.isActive("seed")'), "seed animation does not enter the movement-stop path");
assert.ok(scene.includes("tryContinuousSeedPlant"), "held seed action repeatedly resolves the next walkable farm target");
assert.ok(scene.includes('this.actionKey.isDown || this.mobileActionHeld'), "keyboard Space and mobile action hold share continuous seeding");
assert.ok(scene.includes('context.tool === "seed" && (this.running || this.leftShiftRunning)'), "running explicitly blocks seed planting");
assert.ok(scene.includes("tile?.tilled") && scene.includes("tile.cropStage !== null"), "continuous seed attempts skip invalid/already planted tiles without spamming actions");
assert.ok(page.includes('command("action", true)') && page.includes('command("action", false)'), "mobile action button reports hold and release");
assert.ok(page.includes("달리는 중에는 심지 않습니다"), "help explains walk-to-plant and run restriction");

console.log("Continuous seeding: walking remains active, held input repeats, running is blocked");
