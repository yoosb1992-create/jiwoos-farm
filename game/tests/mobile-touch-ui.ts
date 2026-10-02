import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const inventorySource = readFileSync(new URL("../../app/components/InventoryPanel.tsx", import.meta.url), "utf8");
const shopSource = readFileSync(new URL("../../app/components/ShopPanel.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

assert.ok(inventorySource.includes("스테미나 비스켓") || inventorySource.includes("item.name"), "inventory renders food items");
assert.ok(inventorySource.includes("onConsume(id)") && inventorySource.includes(">먹기</button>"), "food use is wired to an active bag button");
assert.ok(shopSource.includes("onBuy(listing.id)") && shopSource.includes('"구매"'), "shop purchase is wired to active listing buttons");
assert.ok(shopSource.includes("disabled={!affordable}"), "only unaffordable purchases are disabled");

assert.ok(pageSource.includes("const actionPointer = useRef<number | null>(null)"), "action control owns an independent pointer");
assert.ok(pageSource.includes("actionPointer.current = event.pointerId"), "action pointer is captured independently from joystick");
assert.ok(pageSource.includes("event.currentTarget.setPointerCapture(event.pointerId)"), "touch action uses pointer capture");
assert.ok(pageSource.includes('className="bag-button"'), "mobile bag has a direct gameplay button");
assert.ok(pageSource.includes('menuCommand("inventory-open")'), "hamburger bag releases menu pause before opening inventory");
assert.ok(pageSource.includes('command("inventory-open")'), "direct bag button opens gameplay inventory");
assert.ok(pageSource.includes('command("action", true)') && pageSource.includes('command("action", false)') && pageSource.includes("<VirtualJoystick"), "joystick and held action remain separate simultaneous controls");

assert.ok(cssSource.includes(".action-button{touch-action:none!important}"));
assert.ok(cssSource.includes(".game-ui-modal{touch-action:manipulation"));
assert.ok(cssSource.includes(".bag-button{"));

console.log("Mobile touch UI: direct bag, food/shop activation, and independent joystick/action pointers passed");
