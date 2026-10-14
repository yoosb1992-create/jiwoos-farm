import { test, expect, type Page } from "@playwright/test";
import { editorHeaders } from "./editor-auth.js";
import { explicitToolAt, waitForFarmInput } from "./nature-target.js";

test.use({deviceScaleFactor:3});
async function openField(page:Page) {
  const api="http://127.0.0.1:2575",layout=await(await page.request.get(`${api}/api/blueprints/defaults`)).json(),map=layout.maps.farm;
  delete map.world2;Object.assign(map,{objects:[],collisionRegions:[],terrainRegions:[],warps:[],baseTileType:"soil",farmAreas:[{startX:30,endX:48,startY:30,endY:48}]});
  Object.assign(map.spawns.find((s:any)=>s.id==="farm_entry"),{tileX:40.5,tileY:40.5,facing:"left"});
  const draft=await(await page.request.post(`${api}/api/blueprints`,{headers:await editorHeaders(page),data:layout})).json();
  expect((await page.request.post(`${api}/api/blueprints/${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`},data:{layout,revision:draft.revision,publish:true}})).ok()).toBe(true);
  await page.addInitScript(id=>{localStorage.setItem("farm-active-blueprint",id);localStorage.setItem("farm-zoom","1");},draft.id);
  await page.goto("/");await page.locator("#nickname").fill("좌표 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden();await waitForFarmInput(page);
}

test("real phone tap after pinch waters the upper planted cell, never the lower crop; reload keeps coordinates",async({page},info)=>{
  test.setTimeout(120000);await openField(page);
  for(const y of [39,40]) {
    await explicitToolAt(page,37,y,"hoe");
    await expect.poll(()=>page.evaluate(y=>window.__FARM_DEBUG__.state()?.entities[`soil-farm-37-${y}`]?.kind,y)).toBe("soil");
    await explicitToolAt(page,37,y,"sproutberry_seed");
    await expect.poll(()=>page.evaluate(y=>window.__FARM_DEBUG__.state()?.entities[`soil-farm-37-${y}`]?.kind,y)).toBe("crop");
  }
  const cdp=await page.context().newCDPSession(page);
  const zoom=await page.evaluate(()=>(window.__FARM_DEBUG__ as any).scene().cameras.main.zoom);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:140,y:350,id:0},{x:230,y:350,id:1}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:110,y:350,id:0},{x:260,y:350,id:1}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>(window.__FARM_DEBUG__ as any).scene().cameras.main.zoom)).toBeGreaterThan(zoom);
  await waitForFarmInput(page);await page.locator("#tool").selectOption("water");
  await page.locator("#tool").evaluate(e=>(e as HTMLElement).blur());
  const p=await page.evaluate(()=>window.__FARM_DEBUG__.screenPoint(37.5*32,39.5*32));
  expect(await page.evaluate(p=>(window.__FARM_DEBUG__ as any).pickWorld(p.x,p.y).entityId,p)).toBe("soil-farm-37-39");
  await page.touchscreen.tap(p.x,p.y);
  await expect.poll(()=>page.evaluate(()=>(window.__FARM_DEBUG__.state()?.entities["soil-farm-37-39"] as any)?.watered),{timeout:15000}).toBe(true);
  expect(await page.evaluate(()=>(window.__FARM_DEBUG__.state()?.entities["soil-farm-37-40"] as any)?.watered)).toBe(false);
  await page.screenshot({path:info.outputPath("adjacent-plots-after-water.png")});
  await page.reload();await expect(page.locator("#login")).toBeVisible();await page.locator("#resume").click();await waitForFarmInput(page);
  for(const y of [39,40]) {
    const e=await page.evaluate(y=>window.__FARM_DEBUG__.state()?.entities[`soil-farm-37-${y}`],y);
    expect(e).toMatchObject({kind:"crop",stage:0,x:37.5*32,y:(y+.5)*32,watered:y===39});
  }
});

test("logical plot picking across phone/tablet sizes, CSS scaling, scroll and zoom; every crop stage shares its ground contact",async({page},info)=>{
  test.setTimeout(90000);await openField(page);
  await page.evaluate(()=>{
    const d=window.__FARM_DEBUG__ as any,s=d.scene(),frame=s.onFrame(performance.now(),16),me=frame.snapshot.players.find((p:any)=>p.local);
    s.scene.pause();s.cameras.main.stopFollow().removeBounds();
    const entities=new Map();
    for(let y=39;y<=41;y++)for(let x=39;x<=41;x++) {
      const stage=(x+y)%4,kind=x===39&&y===39?"soil":x===41&&y===41?"withered":"crop";
      entities.set(`plot-${x}-${y}`,{id:`plot-${x}-${y}`,area:me.area,kind,asset:"tile_farm_empty",crop:"sproutberry",stage,watered:y%2===0,x:(x+.5)*32,y:(y+.5)*32});
    }
    const state={...frame.state.toJSON(),day:1,minute:765,weather:"clear",weatherPlan:"",entities};
    s.onFrame=()=>({snapshot:frame.snapshot,state});s.update(performance.now()+100,16);
    (window as any).__cropFrame={snapshot:frame.snapshot,state};
  });
  for(const [width,height] of [[390,844],[844,390],[800,1280],[1280,800]]) {
    await page.setViewportSize({width:width!,height:height!});
    await page.waitForFunction(()=>{const s=(window.__FARM_DEBUG__ as any).scene();return s.scale.width===innerWidth&&s.scale.height===innerHeight;});
    for(const zoom of [.65,1,2])for(const scaled of [false,true]) {
      const errors=await page.evaluate(({zoom,scaled})=>{
        const d=window.__FARM_DEBUG__ as any,s=d.scene(),c=s.cameras.main,canvas=s.game.canvas;
        canvas.style.transformOrigin="0 0";canvas.style.transform=scaled?"translate(13px, 31px) scale(.83, .71)":"none";
        c.setZoom(zoom).centerOn(40.5*32+19,40.5*32-11);c.preRender();
        const r=canvas.getBoundingClientRect(),errors:string[]=[];
        // Independent projection of displayed pixels, not screenPoint -> its inverse.
        const project=(x:number,y:number)=>({
          x:r.left+(c.x+c.width*c.originX+(x-c.scrollX-c.width*c.originX)*zoom)*r.width/s.scale.width,
          y:r.top+(c.y+c.height*c.originY+(y-c.scrollY-c.height*c.originY)*zoom)*r.height/s.scale.height,
        });
        for(let y=39;y<=41;y++)for(let x=39;x<=41;x++)for(const [dx,dy] of [[0,0],[-14,-14],[14,-14],[-14,14],[14,14],[0,-15],[0,15],[-15,0],[15,0]]) {
          const wx=(x+.5)*32+dx!,wy=(y+.5)*32+dy!,p=project(wx,wy),hit=d.pickWorld(p.x,p.y),screen=d.screenPoint(wx,wy);
          if(hit.entityId!==`plot-${x}-${y}` || Math.abs(hit.x-wx)>.001 || Math.abs(hit.y-wy)>.001 || Math.hypot(screen.x-p.x,screen.y-p.y)>.001)
            errors.push(`${x},${y}:${dx},${dy} => ${JSON.stringify(hit)}`);
        }
        // Straddling the shared edge must switch precisely to the next cell.
        for(const y of [40*32-.1,40*32+.1]) {const p=project(40.5*32,y);if(d.pickWorld(p.x,p.y).entityId!==`plot-40-${Math.floor(y/32)}`)errors.push("shared edge");}
        // Crop foliage outside its own plot must not intercept empty ground.
        const outside=project(40.5*32,39*32-2);if(d.pickWorld(outside.x,outside.y).entityId)errors.push("overhanging foliage");
        return errors;
      },{zoom,scaled});
      expect(errors,`${width}x${height} zoom ${zoom} CSS scaled ${scaled}`).toEqual([]);
    }
  }
  await page.setViewportSize({width:1280,height:1000});
  const anchors=await page.evaluate(async()=>{
    const content="/shared/content.ts",visuals="/shared/crop-visuals.ts";
    const {CROPS,ASSETS}=await import(/* @vite-ignore */content),{CROP_GROUND_OFFSET}=await import(/* @vite-ignore */visuals);
    const s=(window.__FARM_DEBUG__ as any).scene(),frame=(window as any).__cropFrame,entities=new Map();
    s.game.canvas.style.transform="none";s.cameras.main.stopFollow().setZoom(1.2).setOrigin(0,0).setScroll(0,128).preRender();
    for(const el of document.querySelectorAll<HTMLElement>("body > :not(#arena):not(script)"))el.style.visibility="hidden";
    document.querySelector<HTMLElement>("#arena")!.style.visibility="visible";
    for(const [index,crop] of Object.values<any>(CROPS).entries()) {
      const baseX=48+Math.floor(index/11)*352,y=208+(index%11)*64;
      s.add.text(baseX-30,y-29,crop.id,{fontSize:"10px",color:"#ffffff"}).setDepth(9999);
      for(const [col,stage] of [0,1,2,crop.growthDays].entries()) {
        const id=`anchor-${index}-${col}`,x=baseX+col*64;
        entities.set(id,{id,kind:"crop",area:"farm",asset:"tile_farm_empty",crop:crop.id,stage,watered:col%2===1,x,y});
      }
    }
    frame.state.entities=entities;frame.state.revision++;
    s.onFrame=()=>frame;s.update(Math.max(performance.now(),s.lastAtmosphere)+100,16);
    s.cameras.main.stopFollow().setScroll(0,128).preRender();
    const errors:string[]=[],g=s.add.graphics().setDepth(9999);
    for(const [id,e] of entities) {
      const v=s.objects.get(id),b=v.body,origin=ASSETS[b.texture.key].origin;
      const root={x:b.x+(origin.x-b.originX)*b.displayWidth,y:b.y+(origin.y-b.originY)*b.displayHeight};
      if(root.x!==e.x||root.y!==e.y+CROP_GROUND_OFFSET||v.x!==e.x||v.y!==e.y||v.ground.x!==e.x||v.ground.y!==e.y)errors.push(id);
      if(e.stage===0 && (v.seedGlow.x!==b.x||v.seedGlow.y!==b.y||v.seedGlow.originY!==b.originY||!v.seedGlow.visible))errors.push(`${id}:glow`);
      g.lineStyle(.5,0xeaffbf,.8).lineBetween(e.x-3,e.y+CROP_GROUND_OFFSET,e.x+3,e.y+CROP_GROUND_OFFSET);
    }
    return {errors,count:entities.size,crops:Object.keys(CROPS).length};
  });
  expect(anchors.errors).toEqual([]);expect(anchors.count).toBe(anchors.crops*4);
  await page.screenshot({path:info.outputPath("all-crops-ground-anchors.png"),scale:"css"});
  const transitions=await page.evaluate(async()=>{
    const content="/shared/content.ts",{CROPS}=await import(/* @vite-ignore */content);
    const s=(window.__FARM_DEBUG__ as any).scene(),frame=(window as any).__cropFrame;
    const plants=[...frame.state.entities.values()].filter((e:any)=>e.id.endsWith("-0"));
    const original=new Map(plants.map((e:any)=>[e.id,s.objects.get(e.id).body]));
    const errors:string[]=[];let now=Math.max(performance.now(),s.lastAtmosphere)+100;
    for(const stage of [1,2,"mature",0]) {
      for(const e of plants as any[])e.stage=stage==="mature"?CROPS[e.crop].growthDays:stage;
      frame.state.revision++;s.update(now+=100,16);s.cameras.main.stopFollow().setScroll(0,128).preRender();
      for(const e of plants as any[]) {
        const v=s.objects.get(e.id);
        if(v.body!==original.get(e.id)||v.body.x!==e.x||v.body.y!==e.y+6||v.ground.x!==e.x||v.ground.y!==e.y)errors.push(`${e.id}:${stage}`);
        if((stage===0)!==!!v.seedGlow)errors.push(`${e.id}:glow:${stage}`);
      }
    }
    return errors;
  });
  expect(transitions).toEqual([]);
});
