import test from "node:test";
import assert from "node:assert/strict";
import { TouchNavigator } from "../client/navigation.js";
import type { RenderPlayer } from "../client/network.js";
import { FarmState } from "../shared/schema.js";

test("touch tool waits for a newly acknowledged stop, then confirmed facing, and acts once", () => {
  const actions: unknown[] = [];
  const navigator = new TouchNavigator(() => {}, target => actions.push(target));
  const state = new FarmState();
  const me: RenderPlayer = {
    id: "farmer", nickname: "Farmer", color: "#fff", connected: true, local: true,
    x: 40.5 * 32, y: 40.5 * 32, authoritativeX: 40.5 * 32, authoritativeY: 40.5 * 32,
    area: "farm", facing: "down", moving: false, running: false, stamina: 100, actionTicks: 0,
  };
  const neutral = { moveX: 0, moveY: 0, run: false };
  navigator.choose({ x: 39.5 * 32, y: 40.5 * 32 }, me, state, "hoe");
  // The visible patch is stationary, but inputs 91..100 are still in flight.
  assert.deepEqual(navigator.step(1, me, state, neutral, { sentInputs: 100, acknowledgedInputs: 90 }), neutral);
  assert.deepEqual(navigator.step(2, me, state, neutral, { sentInputs: 101, acknowledgedInputs: 100 }), neutral);
  assert.equal(actions.length, 0);
  const turn = navigator.step(3, me, state, neutral, { sentInputs: 102, acknowledgedInputs: 101 });
  assert.equal(turn.faceX, -1);
  assert.equal(actions.length, 0);
  me.facing = "left";
  navigator.step(4, me, state, neutral, { sentInputs: 103, acknowledgedInputs: 102 });
  navigator.step(5, me, state, neutral, { sentInputs: 104, acknowledgedInputs: 103 });
  assert.equal(actions.length, 1);
  // A second tap requires its own stop acknowledgement; the old fence cannot
  // make it execute while newer manual movement is still in transit.
  navigator.choose({ x: 39.5 * 32, y: 40.5 * 32 }, me, state, "water");
  navigator.step(6, me, state, neutral, { sentInputs: 110, acknowledgedInputs: 103 });
  assert.equal(actions.length, 1);
  navigator.cancel();
  navigator.step(7, me, state, neutral, { sentInputs: 112, acknowledgedInputs: 111 });
  assert.equal(actions.length, 1);
});
