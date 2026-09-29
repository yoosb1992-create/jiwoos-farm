import { strict as assert } from "node:assert";
import {
  MOBILE_CONTROL_STORAGE_KEY, clampMobileControlPlacement, defaultMobileControlSettings,
  loadMobileControlSettings, resetMobileControlSettings, runHeldForPointerPhase, saveMobileControlSettings,
} from "../input/mobileControlLayout";
import { mergeMovementInput } from "../input/MovementInput";

const viewport = { width: 390, height: 844 };
const defaults = defaultMobileControlSettings(viewport);
assert.equal(defaults.portrait.action.y, defaults.portrait.run.y, "행동과 달리기는 기본적으로 같은 행이어야 함");
assert.ok(defaults.portrait.joystick.x < defaults.portrait.run.x, "조이스틱은 왼쪽, 버튼은 오른쪽이어야 함");
const memory = new Map<string, string>();
const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) };
const custom = structuredClone(defaults); custom.portrait.action = { x: .72, y: .62, size: 135, opacity: 45 };
saveMobileControlSettings(storage, custom);
assert.deepEqual(loadMobileControlSettings(storage, viewport), custom, "기기별 설정은 reload 후 유지되어야 함");
memory.set(MOBILE_CONTROL_STORAGE_KEY, "{broken");
assert.deepEqual(loadMobileControlSettings(storage, viewport), defaults, "손상된 localStorage는 기본값으로 복구해야 함");
memory.set(MOBILE_CONTROL_STORAGE_KEY, JSON.stringify({ version: 1, portrait: {}, landscape: {} }));
assert.deepEqual(loadMobileControlSettings(storage, viewport), defaults, "부분 설정도 안전하게 기본값으로 복구해야 함");
saveMobileControlSettings(storage, custom);
assert.deepEqual(resetMobileControlSettings(storage, viewport), defaults); assert.equal(memory.has(MOBILE_CONTROL_STORAGE_KEY), false);
const clamped = clampMobileControlPlacement("action", { x: -4, y: 8, size: 500, opacity: 2 }, viewport);
assert.equal(clamped.size, 140); assert.equal(clamped.opacity, 40); assert.ok(clamped.x > 0 && clamped.y < 1, "컨트롤은 viewport 밖으로 나갈 수 없어야 함");
assert.deepEqual(mergeMovementInput({ x: 0, y: 0 }, { x: .5, y: -.5 }), { x: .5, y: -.5 }, "달리기와 별개로 조이스틱 방향 변경이 유지되어야 함");
assert.equal(runHeldForPointerPhase("down"), true); assert.equal(runHeldForPointerPhase("up"), false);
assert.equal(runHeldForPointerPhase("cancel"), false); assert.equal(runHeldForPointerPhase("lost-capture"), false, "pointer cancel/lost capture는 달리기를 해제해야 함");
console.log("Mobile controls: defaults, local settings, reset, corruption recovery, clamp and concurrent hold input passed");
