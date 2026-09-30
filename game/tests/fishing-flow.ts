import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");

assert.ok(scene.includes('if (this.fishingCast) { this.handleActiveFishingInput(); return; }\n    const point = this.playerAnimations.interactionPoint'),
  "action button handles an active fishing line before resolving a new water target");
assert.ok(scene.includes('if (this.fishingCast) { this.handleActiveFishingInput(); return; }\n    const pose = this.familyPoseForTool(context);'),
  "active cast cannot replay the cast action path");
assert.equal((scene.match(/this\.toolActions\.execute\("fishing_rod"/g) ?? []).length, 1,
  "the fishing rod cast animation is used only for the initial cast");
assert.ok(scene.includes('if (stage === "waiting") { this.say("찌를 던져두었습니다. 입질이 올 때까지 기다려 주세요."); return; }'),
  "pressing action before a bite keeps the existing cast");
assert.ok(scene.includes('if (stage === "bite") {\n      this.fishingMinigame = { castId: cast.id, fishId: cast.fishId };'),
  "pressing action during a bite enters the maze");
assert.ok(scene.includes('if (this.fishingCast) {\n      this.running = false; this.leftShiftRunning = false; this.touchNavigation = undefined;'),
  "player movement is locked while the line is in the water");
assert.ok(scene.includes('if (this.fishingCast && tool !== "fishing_rod")'),
  "tool switching cannot strand an active fishing cast");

console.log("Fishing flow: cast once, wait in place, action-on-bite enters maze");
