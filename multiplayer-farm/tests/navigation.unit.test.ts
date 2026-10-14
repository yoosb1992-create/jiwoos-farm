import test from "node:test";
import assert from "node:assert/strict";
import { TouchNavigator } from "../client/navigation.js";
import type { RenderPlayer } from "../client/network.js";
import { FarmState, WorldEntity } from "../shared/schema.js";

test("touch tool waits for a newly acknowledged stop, then confirmed facing, and acts once", () => {
  const actions: unknown[] = [];
  const navigator = new TouchNavigator(() => {}, target => actions.push(target));
  const state = new FarmState();
  const soil=new WorldEntity();Object.assign(soil,{id:"soil",kind:"soil",area:"farm",x:39.5*32,y:40.5*32});state.entities.set(soil.id,soil);
  const me: RenderPlayer = {
    id: "farmer", nickname: "Farmer", color: "#fff", connected: true, local: true,
    x: 40.5 * 32, y: 40.5 * 32, authoritativeX: 40.5 * 32, authoritativeY: 40.5 * 32,
    area: "farm", facing: "down", moving: false, running: false, stamina: 100, actionTicks: 0,
  };
  const neutral = { moveX: 0, moveY: 0, run: false };
  navigator.choose({ entityId:"soil", x: 39.5 * 32, y: 40.5 * 32 }, me, state, "water");
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
  navigator.choose({ entityId:"soil", x: 39.5 * 32, y: 40.5 * 32 }, me, state, "water");
  navigator.step(6, me, state, neutral, { sentInputs: 110, acknowledgedInputs: 103 });
  assert.equal(actions.length, 1);
  navigator.cancel();
  navigator.step(7, me, state, neutral, { sentInputs: 112, acknowledgedInputs: 111 });
  assert.equal(actions.length, 1);
});

test("ground taps never queue a tool; replaced, removed or disconnected targets cannot fire later",()=>{
  const actions:unknown[]=[],nav=new TouchNavigator(()=>{},t=>actions.push(t));
  const state=new FarmState(),tree=new WorldEntity();Object.assign(tree,{id:"tree",kind:"tree",area:"farm",x:39.5*32,y:40.5*32});state.entities.set(tree.id,tree);
  const me={id:"a",local:true,x:40.5*32,y:40.5*32,authoritativeX:40.5*32,authoritativeY:40.5*32,area:"farm",facing:"left",moving:false} as RenderPlayer;
  const stop={moveX:0,moveY:0,run:false};
  for(const tool of ["axe","pickaxe","scythe","hoe","pine_cone","sproutberry_seed","water"]) {
    nav.choose({x:me.x,y:me.y},me,state,tool);nav.step(performance.now(),me,state,stop);assert(!nav.target);assert.equal(actions.length,0);
  }
  nav.choose({entityId:tree.id,x:tree.x,y:tree.y},me,state);nav.step(performance.now(),me,state,stop,{sentInputs:100,acknowledgedInputs:90});
  nav.choose({x:me.x,y:me.y},me,state);nav.step(performance.now(),me,state,stop,{sentInputs:101,acknowledgedInputs:101});assert.equal(actions.length,0);
  nav.choose({entityId:tree.id,x:tree.x,y:tree.y},me,state);state.entities.delete(tree.id);nav.step(performance.now(),me,state,stop);assert(!nav.target);assert.equal(actions.length,0);
  state.entities.set(tree.id,tree);nav.choose({entityId:tree.id,x:tree.x,y:tree.y},me,state);
  nav.step(performance.now(),undefined,undefined,stop);nav.step(performance.now(),me,state,stop);assert.equal(actions.length,0);
});
