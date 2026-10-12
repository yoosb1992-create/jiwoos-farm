import { chestInventory, chestStorageKey, type ChestStores } from "../shared/chest-storage.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { matchMaker } from "@colyseus/core";
import { fixture, action, delay, join, until } from "./helpers.js";
import type { FarmRoom } from "../server/FarmRoom.js";
import type { World } from "../shared/world.js";

test("real room: bulk transfers and batch crafting commit once, concurrent withdrawal conserves stock, reconnect retains it", async () => {
  const f = await fixture();
  try {
    const room = matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const world = () => (room as unknown as { world: World }).world;
    const bag = (id: string) => world().members[id]!.inventory;
    const chest = room.state.entities.get("family_chest")!;
    const otherId = "second-household-chest";
    world().entities[otherId] = { ...world().entities[chest.id]!, id: otherId, x: chest.x + 16 };
    let familyStores: ChestStores | undefined;
    f.C.onMessage("personal", p => { familyStores = p.chestStores; });
    for (const peer of [f.A, f.B, f.C]) Object.assign(room.state.players.get(peer.sessionId)!, {area:"farmhouse", x:chest.x, y:chest.y+48});
    bag(f.a.playerId).wood = 3001;
    const depositId = randomUUID();
    const deposit = {actionId:depositId,targetId:chest.id,itemId:"wood",quantityMode:"all" as const};
    const first = await action(f.A, "depositChest", deposit);
    assert.equal(first.ok, true);
    assert.equal((await action(f.A,"depositChest",deposit)).revision, first.revision);
    assert.equal(chestInventory(world(), chest.id).wood, 3001); assert.equal(bag(f.a.playerId).wood, undefined);
    await until(() => familyStores?.[chestStorageKey(chest.id)]?.wood === 3001);
    bag(f.b.playerId).stone = 9;
    assert.equal((await action(f.B, "depositChest", { targetId: otherId, itemId: "stone", quantityMode: "all" })).ok, true);
    assert.deepEqual(chestInventory(world(), otherId), { stone: 9 });
    assert.equal(chestInventory(world(), chest.id).wood, 3001);
    await delay(230);
    const contested = await Promise.all([f.A,f.B].map(peer => action(peer,"withdrawChest",{targetId:chest.id,itemId:"wood",quantityMode:"all"})));
    assert.equal(contested.filter(r=>r.ok).length,1);
    const winner = contested[0]!.ok ? f.A : f.B, member = contested[0]!.ok ? f.a : f.b;
    assert.equal(chestInventory(world(), chest.id).wood, undefined);
    assert.equal((bag(f.a.playerId).wood??0)+(bag(f.b.playerId).wood??0),3001);
    await delay(230);
    assert.equal((await action(winner,"depositChest",{targetId:chest.id,itemId:"wood",quantityMode:"half"})).ok,true);
    assert.equal(chestInventory(world(), chest.id).wood,1501); assert.equal(bag(member.playerId).wood,1500);
    const table=room.state.entities.get("crafting_table")!;
    Object.assign(room.state.players.get(winner.sessionId)!,{x:table.x,y:table.y+48});
    await delay(230);
    const craft={actionId:randomUUID(),targetId:table.id,itemId:"wood_plank",quantity:5};
    const crafted=await action(winner,"craftItem",craft);
    assert.equal(crafted.ok,true);
    assert.equal((await action(winner,"craftItem",craft)).revision,crafted.revision);
    assert.equal(bag(member.playerId).wood,1490); assert.equal(bag(member.playerId).wood_plank,5);
    await winner.leave();
    const restored=await join(f.url,member);
    try {
      let personal: {chestStores:ChestStores;chestStorageKeys:Record<string,string>;member:{inventory:Record<string,number>}}|undefined;
      restored.onMessage("personal",p=>{personal=p;}); restored.send("personal");
      await until(()=>!!personal);
      assert.equal(personal!.chestStores[personal!.chestStorageKeys[chest.id]!]!.wood,1501); assert.equal(personal!.member.inventory.wood_plank,5);
      assert.deepEqual(personal!.chestStores[personal!.chestStorageKeys[otherId]!], { stone: 9 });
    } finally {await restored.leave();}
  } finally {await f.close();}
});

test("real room: bedside votes, withdrawal of consent and duplicate final vote advance exactly one day", async () => {
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const bed=room.state.entities.get("bed")!;
    for(const peer of [f.A,f.B,f.C])Object.assign(room.state.players.get(peer.sessionId)!,{area:"farmhouse",x:bed.x,y:bed.y+48});
    const sleep={targetId:bed.id,day:1,value:true};
    assert.equal((await action(f.A,"sleepVote",sleep)).ok,true); assert.equal(room.state.day,1);
    await delay(230);
    assert.equal((await action(f.A,"sleepVote",{...sleep,value:false})).ok,true); assert.equal(room.state.votes,0);
    await delay(230);
    assert.equal((await action(f.A,"sleepVote",sleep)).ok,true);
    assert.equal((await action(f.B,"sleepVote",sleep)).ok,true); assert.equal(room.state.day,1);
    const last={...sleep,actionId:randomUUID()};
    const completed=await action(f.C,"sleepVote",last);
    assert.equal(completed.ok,true); assert.equal(room.state.day,2); assert.equal(room.state.votes,0);
    assert.equal((await action(f.C,"sleepVote",last)).revision,completed.revision);
    assert.equal(room.state.day,2);
    await delay(230);
    assert.equal((await action(f.C,"sleepVote",sleep)).ok,false); assert.equal(room.state.day,2);
  } finally {await f.close();}
});
