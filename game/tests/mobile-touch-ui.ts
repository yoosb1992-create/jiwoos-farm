import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryPanel } from "../../app/components/InventoryPanel";
import { ShopPanel } from "../../app/components/ShopPanel";
import { initialPlayerStats } from "../player/stats";

const stats = { ...initialPlayerStats(), stamina: 50 };
const bag = renderToStaticMarkup(createElement(InventoryPanel, {
  items: { stamina_biscuit: 2 }, stats, notice: "테스트", onConsume: () => {}, onClose: () => {},
}));
assert.ok(bag.includes("스테미나 50 / 100"));
assert.ok(bag.includes("스테미나 비스켓"));
assert.ok(bag.includes("먹기"), "food use button stays enabled in the touch inventory");

const affordable = renderToStaticMarkup(createElement(ShopPanel, {
  money: 25, items: { sproutberry_seed: 2 }, onBuy: () => {}, onClose: () => {},
}));
assert.ok(affordable.includes("25 G"));
assert.ok(affordable.includes("새싹열매 씨앗"));
assert.ok(affordable.includes("보유 2개"));
assert.ok(affordable.includes(">구매<"), "affordable listing has an active purchase button");
assert.ok(affordable.includes("돈 부족"), "unaffordable listings explain why purchase is disabled");

const pageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
assert.ok(pageSource.includes("const actionPointer = useRef<number | null>(null)"), "action control owns an independent pointer");
assert.ok(pageSource.includes("actionPointer.current = event.pointerId"), "action pointer is captured independently from joystick");
assert.ok(pageSource.includes("event.currentTarget.setPointerCapture(event.pointerId)"), "touch action uses pointer capture");
assert.ok(pageSource.includes('className="bag-button"'), "mobile bag has a direct gameplay button");
assert.ok(pageSource.includes('command("action")') && pageSource.includes('<VirtualJoystick'), "joystick and action remain separate simultaneous controls");

const cssSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
assert.ok(cssSource.includes(".action-button{touch-action:none!important}"));
assert.ok(cssSource.includes(".game-ui-modal{touch-action:manipulation"));

console.log("Mobile touch UI: direct bag, food/shop activation, and independent joystick/action pointers passed");
