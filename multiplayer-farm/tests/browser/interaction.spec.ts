import { editorHeaders } from "./editor-auth.js";
import { test, expect } from "@playwright/test";
import { waitForFarmInput } from "./nature-target.js";

test("tablet/phone tools: wrong-tool attempt, felling, transparent bouncing drops, magnet and scythe",async({page},info)=>{
  test.setTimeout(150000);
  await page.setViewportSize({width:800,height:960});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const backend="http://127.0.0.1:2575";
  const layout=await(await page.request.get(`${backend}/api/blueprints/defaults`)).json();
  const map=layout.maps.farm;
  delete map.world2;map.objects=[];map.collisionRegions=[];map.terrainRegions=[];map.warps=[];
  map.baseTileType="grass";map.farmAreas=[{startX:35,endX:45,startY:38,endY:46}];
  Object.assign(map.spawns.find((s:{id:string})=>s.id==="farm_entry"),{tileX:40.5,tileY:40.5,facing:"right"});
  map.objects.push(
    {id:"fx-tree",assetId:"tree_oak",position:{tileX:42.5,tileY:40.5},kind:"tree",tree:{species:"tree_oak",stage:2,chop:true,regrow:true}},
    {id:"fx-rock",assetId:"farm_stone_a",position:{tileX:38.5,tileY:40.5},kind:"rock"},
    {id:"fx-grass",assetId:"farm_tall_grass",position:{tileX:40.5,tileY:42.5},kind:"gather"},
    {id:"fx-flower",assetId:"farm_white_wildflower",position:{tileX:42.5,tileY:42.5},kind:"gather"},
    {id:"fx-twig",assetId:"farm_thick_branch",position:{tileX:38.5,tileY:39.5},kind:"twig"},
    {id:"fx-ore",assetId:"mine_copper",position:{tileX:38.5,tileY:42.5},kind:"rock"},
    ...["hand","axe","pickaxe"].map((tool,i)=>({id:`flower-${tool}`,assetId:"farm_pink_wildflower",position:{tileX:36.5+i*2,tileY:44.5},kind:"gather"})),
  );
  const response=await page.request.post(`${backend}/api/blueprints`,{headers:await editorHeaders(page),data:layout});expect(response.ok()).toBe(true);
  const draft=await response.json();
  expect((await page.request.post(`${backend}/api/blueprints/${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`},data:{layout,revision:draft.revision,publish:true}})).ok()).toBe(true);
  await page.addInitScript(id=>{localStorage.setItem("farm-active-blueprint",id);localStorage.setItem("farm-zoom","1.4");},draft.id);
  await page.goto("/");await page.locator("#nickname").fill("도구 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:20000});
  // Scene startup loads real art; never tap a placeholder before world picking is ready.
  await page.waitForFunction(()=>(window.__FARM_DEBUG__ as any).scene().objects.has("fx-tree"));
  await page.evaluate(()=>{
    const s=(window.__FARM_DEBUG__ as any).scene(),original=s.actionFeedback.bind(s);
    (window as any).__committedFx=[];
    s.actionFeedback=(e:any)=>{(window as any).__committedFx.push(e);original(e);};
  });
  await waitForFarmInput(page);
  const tap=async(id:string,tool:string)=>{
    await page.locator("#tool").selectOption(tool);
    // Selection can span a reconnect on a slow renderer. Read the new live
    // target before the single damaging tap; never replay that tap here.
    await waitForFarmInput(page);
    let p:{x:number;y:number}|undefined;
    await expect.poll(async()=>{
      p=await page.evaluate(id=>{
        const view=(window.__FARM_DEBUG__ as any).scene().objects.get(id);
        return view && window.__FARM_DEBUG__.state()?.entities[id] && window.__FARM_DEBUG__.snapshot().status==="connected"
          ? window.__FARM_DEBUG__.screenPoint(view.x,view.y-5) : undefined;
      },id);
      return p;
    },{timeout:25000,message:"A connected, visible target must exist before a tap"}).toBeDefined();
    await page.touchscreen.tap(p!.x,p!.y);
  };
  const kind=(id:string)=>page.evaluate(id=>{
    const state=window.__FARM_DEBUG__.state();return state?state.entities[id]?.kind:"offline";
  },id);
  const hp=(id:string)=>page.evaluate(id=>window.__FARM_DEBUG__.state()?.entities[id]?.hp,id);
  // Cold software-rendered startup can reconnect after input becomes ready.
  // Follow the UI's re-tap instruction only for this harmless failed attempt.
  // Every damaging action below remains single-shot, preserving HP/drop checks.
  await expect(async()=>{
    await tap("fx-tree","pickaxe");
    await expect(page.locator("#notice")).toContainText("이 도구로는 처리할 수 없어요");
  }).toPass({timeout:40000,intervals:[250]});
  await expect(page.locator("#tool")).toHaveValue("pickaxe");expect(await hp("fx-tree")).toBe(3);
  for(const health of [2,1]){await tap("fx-tree","axe");await expect.poll(()=>hp("fx-tree")).toBe(health);await page.waitForTimeout(430);}
  await tap("fx-tree","axe");await expect.poll(()=>kind("fx-tree")).toBe("stump");
  await page.waitForFunction(()=>{const f=(window.__FARM_DEBUG__ as any).scene().feedback;return f.ghosts.some((g:any)=>Math.abs(g.sprites[0].angle)>15);});
  await page.screenshot({path:info.outputPath("tree-felling.png")});
  await expect.poll(()=>page.evaluate(()=>[...(window.__FARM_DEBUG__ as any).scene().objects.entries()].filter(([id,v]:any)=>id.startsWith("drop-")&&v.body.visible).length)).toBe(2);
  expect(await page.evaluate(()=>{
    const s=(window.__FARM_DEBUG__ as any).scene();
    return ["drop-icon-wood","drop-icon-stone","drop-icon-grass","held-scythe"].every(key=>{
      const source=s.textures.get(key).getSourceImage(),c=document.createElement("canvas");c.width=source.width;c.height=source.height;
      const ctx=c.getContext("2d")!;ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
      return data[3]===0&&data.some((v,i)=>i%4===3&&v>0);
    });
  })).toBe(true);
  await page.waitForTimeout(800);await page.screenshot({path:info.outputPath("transparent-drops.png")});
  // Walking alone must collect the wood, even while axe stays selected.
  await waitForFarmInput(page);
  const joystick=await page.locator("#joystick").boundingBox();expect(joystick).toBeTruthy();
  const center={x:joystick!.x+joystick!.width/2,y:joystick!.y+joystick!.height/2};
  await page.mouse.move(center.x,center.y);await page.mouse.down();
  try {
    // Drive the real joystick until authority confirms proximity. A fixed 700ms
    // drag depends on CI frame rate and may stop outside the narrow pickup range.
    await expect.poll(async()=>{
      const delta=await page.evaluate(()=>{
        const drop=Object.values(window.__FARM_DEBUG__.state().entities).find((e:any)=>e.kind==="drop") as any;
        const actor=window.__FARM_DEBUG__.snapshot().local!.authoritative;
        return drop?{x:drop.x-actor.x,y:drop.y-actor.y}:{x:0,y:0};
      });
      const distance=Math.hypot(delta.x,delta.y);
      if(distance>32.001) await page.mouse.move(center.x+40*delta.x/distance,center.y+40*delta.y/distance);
      return distance;
    },{timeout:10000,intervals:[100]}).toBeLessThanOrEqual(32.001);
  } finally { await page.mouse.up(); }
  await expect.poll(()=>page.evaluate(()=>{
    const state=window.__FARM_DEBUG__.state();return state?Object.values(state.entities).filter((e:any)=>e.kind==="drop").length:-1;
  })).toBe(0);
  await tap("fx-flower","scythe");await expect.poll(()=>kind("fx-flower")).toBeUndefined();
  await page.waitForTimeout(430);await tap("fx-grass","scythe");await expect.poll(()=>kind("fx-grass")).toBeUndefined();
  await tap("fx-rock","axe");
  // The same notice remains from the earlier tree attempt. Wait for this
  // rock's committed miss before changing the tool during walk-and-use.
  await expect.poll(()=>page.evaluate(()=>(window as any).__committedFx.filter((e:any)=>
    e.target?.id==="fx-rock"&&e.tool==="axe"&&e.outcome==="fail").length)).toBe(1);
  await expect(page.locator("#notice")).toContainText("이 도구로는 처리할 수 없어요");expect(await kind("fx-rock")).toBe("rock");
  await page.waitForTimeout(430);await tap("fx-rock","pickaxe");await expect.poll(()=>kind("fx-rock")).toBeUndefined();
  await tap("fx-twig","axe");await expect.poll(()=>kind("fx-twig")).toBeUndefined();
  for(const health of [2,1,0]) {
    await tap("fx-ore","pickaxe");
    if(health)await expect.poll(()=>hp("fx-ore")).toBe(health);
    else await expect.poll(()=>kind("fx-ore")).toBeUndefined();
    if(health===1){await page.waitForTimeout(400);await page.screenshot({path:info.outputPath("ore-second-hit.png")});}
  }
  for(const tool of ["hand","axe","pickaxe"]) {
    const id=`flower-${tool}`;await tap(id,tool);await expect.poll(()=>kind(id)).toBeUndefined();
    const result=await page.evaluate(id=>(window as any).__committedFx.find((e:any)=>e.target?.id===id),id);
    expect(result.outcome).toBe("break");expect(result.drops).toHaveLength(tool==="hand"?1:0);
    await expect(page.locator("#tool")).toHaveValue(tool);
  }
  await waitForFarmInput(page);await page.locator("#tool").selectOption("hoe");
  const plot={x:35.5*32,y:43.5*32},soil="soil-farm-35-43";
  const point=await page.evaluate(p=>window.__FARM_DEBUG__.screenPoint(p.x,p.y),plot);
  await page.touchscreen.tap(point.x,point.y);await expect.poll(()=>kind(soil)).toBe("soil");
  await tap(soil,"sproutberry_seed");await expect.poll(()=>kind(soil)).toBe("crop");
  await tap(soil,"water");
  await expect.poll(()=>page.evaluate(id=>(window.__FARM_DEBUG__.state().entities[id] as any)?.watered,soil)).toBe(true);
  await page.waitForFunction(()=>{
    const s=(window.__FARM_DEBUG__ as any).scene();
    return [...s.feedback.swings.values()].some((a:any)=>a.event.tool==="water" && s.time.now-a.start>290 && s.time.now-a.start<600);
  });
  await page.screenshot({path:info.outputPath("watering-from-spout.png")});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('[data-tool="scythe"]')).toBeVisible();
  await expect(page.locator("#quickslots button[data-slot-id]")).toHaveCount(7);
  expect(await page.locator("#toolbar").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("phone-scythe.png")});
  expect(errors).toEqual([]);
});
