import { test, expect } from "@playwright/test";

test("tablet/phone tools: wrong-tool attempt, felling, transparent bouncing drops, magnet and scythe",async({page},info)=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:800,height:960});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const backend="http://127.0.0.1:2575";
  const layout=await(await page.request.get(`${backend}/api/blueprints/defaults`)).json();
  const map=layout.maps.farm;
  delete map.world2;map.objects=[];map.collisionRegions=[];map.terrainRegions=[];map.warps=[];
  map.baseTileType="grass";map.farmAreas=[];
  Object.assign(map.spawns.find((s:{id:string})=>s.id==="farm_entry"),{tileX:40.5,tileY:40.5,facing:"right"});
  map.objects.push(
    {id:"fx-tree",assetId:"tree_oak",position:{tileX:42.5,tileY:40.5},kind:"tree",tree:{species:"tree_oak",stage:2,chop:true,regrow:true}},
    {id:"fx-rock",assetId:"farm_stone_a",position:{tileX:38.5,tileY:40.5},kind:"rock"},
    {id:"fx-grass",assetId:"farm_tall_grass",position:{tileX:40.5,tileY:42.5},kind:"gather"},
    {id:"fx-flower",assetId:"farm_white_wildflower",position:{tileX:42.5,tileY:42.5},kind:"gather"},
  );
  const response=await page.request.post(`${backend}/api/blueprints`,{data:layout});expect(response.ok()).toBe(true);
  const draft=await response.json();
  expect((await page.request.post(`${backend}/api/blueprints/${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`},data:{layout,revision:draft.revision,publish:true}})).ok()).toBe(true);
  await page.addInitScript(id=>{localStorage.setItem("farm-active-blueprint",id);localStorage.setItem("farm-zoom","1.4");},draft.id);
  await page.goto("/");await page.locator("#nickname").fill("도구 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected");
  // Scene startup loads real art; never tap a placeholder before world picking is ready.
  await page.waitForFunction(()=>(window.__FARM_DEBUG__ as any).scene().objects.has("fx-tree"));
  await page.waitForTimeout(2200);
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected");
  const tap=async(id:string,tool:string)=>{
    await page.locator("#tool").selectOption(tool);
    const p=await page.evaluate(id=>{const e=(window.__FARM_DEBUG__.state().entities as any)[id];return window.__FARM_DEBUG__.screenPoint(e.x,e.y-5);},id);
    await page.touchscreen.tap(p.x,p.y);
  };
  const kind=(id:string)=>page.evaluate(id=>window.__FARM_DEBUG__.state().entities[id]?.kind,id);
  const hp=(id:string)=>page.evaluate(id=>window.__FARM_DEBUG__.state().entities[id]?.hp,id);
  await tap("fx-tree","pickaxe");
  await expect(page.locator("#notice")).toContainText("이 도구로는 처리할 수 없어요");
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
  const joystick=await page.locator("#joystick").boundingBox();expect(joystick).toBeTruthy();
  await page.mouse.move(joystick!.x+joystick!.width/2,joystick!.y+joystick!.height/2);
  await page.mouse.down();await page.mouse.move(joystick!.x+joystick!.width-8,joystick!.y+joystick!.height/2);
  await page.waitForTimeout(700);await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>Object.values(window.__FARM_DEBUG__.state().entities).filter((e:any)=>e.kind==="drop").length)).toBe(0);
  await tap("fx-flower","scythe");await expect(page.locator("#notice")).toContainText("이 도구로는 처리할 수 없어요");expect(await kind("fx-flower")).toBe("gather");
  await page.waitForTimeout(430);await tap("fx-grass","scythe");await expect.poll(()=>kind("fx-grass")).toBeUndefined();
  await tap("fx-rock","axe");await expect(page.locator("#notice")).toContainText("이 도구로는 처리할 수 없어요");expect(await kind("fx-rock")).toBe("rock");
  await page.waitForTimeout(430);await tap("fx-rock","pickaxe");await expect.poll(()=>kind("fx-rock")).toBeUndefined();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('[data-tool="scythe"]')).toBeVisible();
  await expect(page.locator("#quickslots button")).toHaveCount(7);
  expect(await page.locator("#toolbar").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("phone-scythe.png")});
  expect(errors).toEqual([]);
});
