import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

assert.ok(scene.includes('event.code === "ShiftLeft"'), "desktop running is bound specifically to left Shift");
assert.ok(scene.includes("this.leftShiftRunning = true"), "left Shift keydown starts running");
assert.ok(scene.includes("this.leftShiftRunning = false"), "left Shift keyup/blur stops running");
assert.ok(scene.includes("this.running || this.leftShiftRunning ? 1.65 : 1"), "keyboard and mobile run share the same speed multiplier");

assert.ok(page.includes('className="mobile-menu-summary"'), "objective summary is shared by desktop and mobile menu");
assert.ok(!page.includes('className="mobile-menu-summary mobile-menu-only"'), "desktop no longer hides the menu summary");
assert.ok(page.includes('onOpenEditor(); }}>{testMode ? "← 편집기로 돌아가기" : "🛠 맵 편집"}'), "map editor lives in the shared hamburger menu");
assert.ok(page.includes('onHome(); }}>{family ? "농장 나가기" : "처음으로"}'), "home/leave lives in the shared hamburger menu");
assert.ok(page.includes("<kbd>왼쪽 Shift</kbd>로 달리기"), "help documents left Shift running");

assert.ok(css.includes(".desktop-left-ui{display:none}"), "separate desktop utility UI stays hidden");
assert.ok(css.includes(".mobile-menu-toggle{display:block"), "hamburger is visible on desktop too");
assert.ok(css.includes(".save-row.open{display:flex}"), "shared menu only opens from the hamburger");
assert.ok(css.includes(".save-row .family-status{position:static"), "Family status is contained inside the hamburger panel");

console.log("Desktop hamburger/run: left Shift running and shared utility menu passed");
