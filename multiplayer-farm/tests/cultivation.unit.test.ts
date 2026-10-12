import test from "node:test";
import assert from "node:assert/strict";
import { legacyLayout } from "../shared/layout.js";
import { isFarmable } from "../shared/applyMovement.js";
import { newWorld,newMember,entity,type Actor } from "../shared/world.js";
import { applyAction } from "../shared/actions.js";
import { newWorld2,setCell,terrainCode,ZONES } from "../shared/world2.js";
import { TilledGroundIndex } from "../client/tilled-ground.js";

function fixture() {
  const l=legacyLayout(),map=l.maps.farm!;
  Object.assign(map,{width:32,height:32,baseTileType:"grass",terrainRegions:[],farmAreas:[],collisionRegions:[],objects:[],spawns:[],warps:[],world2:newWorld2()});
  const w=newWorld(4,l);w.entities={};w.members.a=newMember("a","A");
  const a:Actor={id:"a",area:"farm",x:10.5*32,y:9.5*32,facing:"down",running:false,stamina:100};
  return {w,a,map:w.layout!.maps.farm!,act:(type:string)=>applyAction(w,a,{actionId:crypto.randomUUID(),type},{now:Date.now(),online:["a"],votes:new Set()})};
}
test("saved grass, dark grass and soil are cultivable independently of building permissions",()=>{
  for(const ground of ["grass","dark_grass","soil","sand","snow"]) {
    const {w,map,act}=fixture();setCell(map,"terrain",10,10,terrainCode(ground));setCell(map,"zones",10,10,ZONES["no-placement"]);
    assert(isFarmable("farm",10,10,w.layout!.maps),ground);assert(act("tillTile").ok);
  }
  for(const ground of ["water","shallow_water","deep_water","cliff","hill","stone_path","dirt_path","wood_floor"]) {
    const {w,map}=fixture();setCell(map,"terrain",10,10,terrainCode(ground));setCell(map,"zones",10,10,ZONES.farmable);
    assert(!isFarmable("farm",10,10,w.layout!.maps),ground);
  }
});
test("occupied natural/fixture cells reject cultivation and become usable after removal",()=>{
  for(const kind of ["tree","stump","rock","twig","gather","chest","craft","machine","decoration","crop"]) {
    const {w,act}=fixture();w.entities.obstacle=entity("obstacle","farm",kind,10.5*32,10.5*32,"tree_pine");
    assert.throws(()=>act("tillTile"),kind);delete w.entities.obstacle;
    assert(act("tillTile").ok,kind);
  }
  const {w,map,act}=fixture();setCell(map,"collision",10,10,1);assert.throws(()=>act("tillTile"));
  setCell(map,"collision",10,10,0);map.spawns.push({id:"door",tileX:10,tileY:10,facing:"down"});assert.throws(()=>act("tillTile"));
  assert.equal(Object.keys(w.entities).length,0);
});
test("four-neighbor masks preserve crop, wilted and wet connections; only local adjacency changes",()=>{
  const plot=(x:number,y:number,kind="soil")=>({area:"farm",x:(x+.5)*32,y:(y+.5)*32,kind});
  const entities=new Map([["a",plot(1,1)],["b",plot(2,1,"crop")],["c",plot(2,2,"withered")],["d",plot(5,5)]]);
  const index=new TilledGroundIndex();index.sync(entities,1);
  assert.equal(index.mask(entities.get("a")!),2);assert.equal(index.mask(entities.get("b")!),12);assert.equal(index.mask(entities.get("c")!),1);
  assert.equal(index.sync(entities,1),0);
  entities.get("b")!.kind="soil";assert.equal(index.sync(entities,2),0);
  entities.delete("b");assert.equal(index.sync(entities,3),5);assert.equal(index.mask(entities.get("a")!),0);assert.equal(index.mask(entities.get("c")!),0);
});
