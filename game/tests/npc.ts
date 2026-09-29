import { strict as assert } from "node:assert";
import { MapRegistry } from "../maps/MapRegistry";
import { NpcController, scheduleAt } from "../npc/NpcController";
import { NPC_DEFINITIONS, validateNpcs } from "../npc/definitions";
import { npcRoute, npcCellSafe } from "../npc/navigation";
import type { NpcDefinition } from "../npc/types";
const maps=new MapRegistry();
const fixture:NpcDefinition={id:"test",name:"test",displayName:"주민",personality:"차분함",speed:32,fallbackColor:0,
 asset:{assetId:"npc-test",textureKey:"npc-test",source:null,frameSize:{width:32,height:36},displayScale:{x:1,y:1},origin:{x:.5,y:.5}},
 dialogue:{first:["안녕"],general:[["좋은 날"]],morning:[],afternoon:[],evening:[],progress:[]},
 schedule:[{minute:360,mapId:"town",from:{x:10,y:12},to:{x:12,y:12},facing:"down",activity:"산책"},{minute:600,mapId:"road",from:{x:10,y:5},to:{x:10,y:8},facing:"up",activity:"산책",days:[1]}]};
assert.deepEqual(validateNpcs([fixture,...NPC_DEFINITIONS],maps),[]);
assert.equal(scheduleAt(fixture,1,599)?.mapId,"town"); assert.equal(scheduleAt(fixture,1,600)?.mapId,"road");
assert.equal(scheduleAt(fixture,2,600)?.mapId,"town");
const controller=new NpcController([fixture],maps);
assert.equal(controller.sample(1,361)[0].x,352); assert.equal(controller.sample(1,361)[0].moving,true);
assert.equal(controller.sample(1,370)[0].moving,false);
assert.deepEqual(controller.sample(1,601),new NpcController([fixture],maps).sample(1,601));
assert.equal(controller.sample(1,600)[0].mapId,"road");
assert.deepEqual(npcRoute(maps.require("road"),{x:2,y:5},{x:10,y:5}),[]);
for(const p of npcRoute(maps.require("town"),{x:18,y:5},{x:28,y:5})) assert.equal(npcCellSafe(maps.require("town"),{x:Math.floor(p.x/32),y:Math.floor(p.y/32)}),true);
assert.ok(validateNpcs([{...fixture,speed:0}],maps).length);
console.log("NPC foundation: definitions, deterministic schedule/day/map transitions and collision-safe routes passed");

import { readAssetPng } from "./png";
for(const n of NPC_DEFINITIONS) {
  const png=readAssetPng(n.asset.source!.path); assert.deepEqual([png.width,png.height],[256,144]);
  for(let row=0;row<4;row++) {
    const frames=[];
    for(let col=0;col<8;col++) {
      const bytes=[];let opaque=0;
      for(let y=0;y<36;y++) for(let x=0;x<32;x++) {
        const i=((row*36+y)*png.width+col*32+x)*4;
        bytes.push(...png.pixels.subarray(i,i+4));if(png.pixels[i+3]>128)opaque++;
        if(y===35)assert.equal(png.pixels[i+3],0,"feet stay inside frame");
      }
      assert.ok(opaque>80);frames.push(Buffer.from(bytes).toString("base64"));
    }
    assert.ok(new Set(frames.slice(4)).size>=3,"walk poses differ");
  }
  for(let minute=360;minute<=1430;minute+=.5) {
    const p=new NpcController([n],maps).sample(1,minute)[0];assert.ok(p);
    assert.equal(npcCellSafe(maps.require(p.mapId),{x:Math.floor(p.x/32),y:Math.floor(p.y/32)}),true);
  }
}
