import { editorHeaders } from "./editor-auth.js";
import { test,expect } from "@playwright/test";
import { waitForFarmInput } from "./nature-target.js";

test("five tree ages: juvenile cutting, species stumps, three-hit clearing and reload",async({page},info)=>{
  test.setTimeout(150000);
  await page.setViewportSize({width:800,height:960});
  const backend="http://127.0.0.1:2575",layout=await(await page.request.get(`${backend}/api/blueprints/defaults`)).json(),m=layout.maps.farm;
  // The five authored ages are the subjects; random starter nature must not
  // obstruct the cleared-stump walking assertion.
  delete m.world2;m.objects=[];m.collisionRegions=[];m.terrainRegions=[];m.warps=[];m.baseTileType="soil";m.farmAreas=[];
  Object.assign(m.spawns.find((s:any)=>s.id==="farm_entry"),{tileX:40.5,tileY:40.5,facing:"left"});
  const points:Array<[number,number]>=[[38.5,40.5],[40.5,42.5],[42.5,40.5],[44.5,42.5],[46.5,40.5]];
  const species=["tree_cherry","tree_bamboo","tree_birch","tree_pine","tree_metasequoia"];
  for(let stage=0;stage<5;stage++)m.objects.push({id:`age-${stage}`,assetId:species[stage],kind:"tree",
    position:{tileX:points[stage]![0],tileY:points[stage]![1]},tree:{species:species[stage],stage,chop:true,regrow:stage===0}});
  const response=await page.request.post(`${backend}/api/blueprints`,{headers:await editorHeaders(page),data:layout});expect(response.ok()).toBe(true);
  const draft=await response.json();
  expect((await page.request.post(`${backend}/api/blueprints/${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`},data:{layout,revision:draft.revision,publish:true}})).ok()).toBe(true);
  await page.addInitScript(id=>{localStorage.setItem("farm-active-blueprint",id);localStorage.setItem("farm-zoom","1.2");},draft.id);
  await page.goto("/");await page.locator("#nickname").fill("그루터기 검증");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:20000});
  await page.waitForFunction(()=>(window.__FARM_DEBUG__ as any).scene().objects.has("age-0"));
  await waitForFarmInput(page);
  const tap=async(id:string)=>{
    await page.waitForFunction(()=>{
      const d=window.__FARM_DEBUG__ as any,s=d.snapshot(),p=s.players.find((p:any)=>p.local);
      return s.status==="connected"&&p&&!d.scene().feedback.busy(p.id);
    });
    const p=await page.evaluate(id=>{const v=(window.__FARM_DEBUG__ as any).scene().objects.get(id);return window.__FARM_DEBUG__.screenPoint(v.x,v.y-3);},id);
    await page.touchscreen.tap(p.x,p.y);
  };
  const hitAndExpect=async(id:string,wanted:string|undefined)=>{
    const read=()=>page.evaluate(id=>{
      const e=window.__FARM_DEBUG__.state()?.entities[id];
      return {value:e&&`${e.kind}:${e.hp}`,connection:window.__FARM_DEBUG__.snapshot().reconnectCount};
    },id);
    let before=await read();
    for(let attempt=0;attempt<3;attempt++) {
      await tap(id);
      await expect.poll(async()=>{const s=await read();return s.value===wanted||s.connection!==before.connection;},{timeout:15000}).toBe(true);
      if((await read()).value===wanted)return;
      // The existing reconnect policy cancels a queued walk-and-use command.
      // Repeat a touch ONLY after a proven reconnect and unchanged target HP;
      // never retry damage blindly or conceal a missed/duplicate server hit.
      await waitForFarmInput(page);
      const after=await read();if(after.value===wanted)return;
      expect(after.value).toBe(before.value);expect(after.connection).toBeGreaterThan(before.connection);
      before=after;
    }
    throw Error(`Repeated reconnects prevented a settled hit on ${id}`);
  };
  await page.locator("#tool").selectOption("pickaxe");
  await expect(async()=>{await tap("age-0");await expect(page.locator("#notice")).toContainText("이 도구로는 처리할 수 없어요");}).toPass({timeout:35000,intervals:[300]});
  await page.locator("#tool").selectOption("axe");
  for(let stage=0;stage<5;stage++) {
    const id=`age-${stage}`,hits=[1,2,3,5,7][stage]!;
    for(let hit=1;hit<=hits;hit++) {
      await hitAndExpect(id,hit<hits?`tree:${hits-hit}`:stage<2?undefined:"stump:3");
    }
    await page.waitForFunction(id=>{
      const s=(window.__FARM_DEBUG__ as any).scene();return !s.feedback.hiddenObject(id,s.time.now);
    },id);
    if(stage<2)expect(await page.evaluate(id=>(window.__FARM_DEBUG__ as any).scene().objects.has(id),id)).toBe(false);
    else expect(await page.evaluate(id=>(window.__FARM_DEBUG__ as any).scene().objects.get(id)?.body.texture.key,id))
      .toBe(`${species[stage]}_stump_${["","","mature","giant","guardian"][stage]}`);
    await page.screenshot({path:info.outputPath(`felled-stage-${stage}.png`)});
    if(stage===2) {
      for(let hit=0;hit<3;hit++) {
        await hitAndExpect(id,hit<2?`stump:${2-hit}`:undefined);
      }
      // Walk directly through the cleared cell. A neighboring giant canopy can
      // cover it visually, so use movement input rather than selecting a crown.
      await page.locator("#tool").selectOption("hand");
      await page.locator("#tool").evaluate(e=>(e as HTMLElement).blur());
      await page.waitForFunction(()=>{
        const d=window.__FARM_DEBUG__ as any,s=d.snapshot(),p=s.players.find((p:any)=>p.local);
        return s.status==="connected"&&p&&!d.scene().actionBusy(p.id);
      });
      await expect.poll(async()=>{
        const delta=await page.evaluate(p=>{const me=window.__FARM_DEBUG__.snapshot().players.find(p=>p.local)!;return {x:p[0]*32-me.authoritativeX,y:p[1]*32-me.authoritativeY};},points[stage]!);
        const distance=Math.hypot(delta.x,delta.y);if(distance<10)return distance;
        const key=Math.abs(delta.x)>Math.abs(delta.y)?delta.x>0?"ArrowRight":"ArrowLeft":delta.y>0?"ArrowDown":"ArrowUp";
        await page.keyboard.down(key);await page.waitForTimeout(100);await page.keyboard.up(key);
        const released=await page.evaluate(()=>{const s=window.__FARM_DEBUG__.snapshot();return {connection:s.reconnectCount,input:s.sentInputs+1};});
        // Measure the next correction only after the server consumes the stop
        // input. Fixed sleeps can repeatedly steer from a stale position in CI.
        await page.waitForFunction(r=>{
          const s=window.__FARM_DEBUG__.snapshot(),p=s.players.find(p=>p.local);
          return s.reconnectCount!==r.connection||(s.status==="connected"&&p&&!p.moving&&s.acknowledgedInputs>=r.input);
        },released,{timeout:10000});
        if(await page.evaluate(r=>window.__FARM_DEBUG__.snapshot().reconnectCount!==r.connection,released))await waitForFarmInput(page);
        return distance;
      },{timeout:25000,intervals:[50]}).toBeLessThan(10);
      await expect.poll(()=>page.evaluate(p=>{const me=window.__FARM_DEBUG__.snapshot().players.find(p=>p.local)!;return Math.hypot(me.authoritativeX-p[0]*32,me.authoritativeY-p[1]*32);},points[stage]!),{timeout:15000}).toBeLessThan(12);
      await page.screenshot({path:info.outputPath("cleared-stump-walkthrough.png")});
      await page.locator("#tool").selectOption("axe");
    }
  }
  await page.reload();await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:20000});
  await waitForFarmInput(page);
  const saved=await page.evaluate(()=>(window.__FARM_DEBUG__ as any).state().entities);
  expect(saved["age-0"]).toBeUndefined();expect(saved["age-1"]).toBeUndefined();expect(saved["age-2"]).toBeUndefined();
  expect(saved["age-3"]!.asset).toBe("tree_pine_stump_giant");expect(saved["age-4"]!.asset).toBe("tree_metasequoia_stump_guardian");
});
