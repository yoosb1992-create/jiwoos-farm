import { editorHeaders } from "./editor-auth.js";
import { test, expect, type Page } from "@playwright/test";
import { newWorld2 } from "../../shared/world2.js";
import { waitForFarmInput } from "./nature-target.js";

async function enterHome(page: Page): Promise<void> {
  const api="http://127.0.0.1:2575";
  const layout=await (await page.request.get(`${api}/api/blueprints/defaults`)).json();
  const farm=layout.maps.farm,home=layout.maps.farmhouse;
  delete farm.world2;
  farm.objects=[];farm.baseTileType="stone_floor";farm.terrainRegions=[];farm.collisionRegions=[];farm.farmAreas=[];
  Object.assign(farm.spawns.find((s:{id:string})=>s.id==="farm_entry"),{tileX:10.5,tileY:9.5});
  farm.warps=[{id:"home-entry",area:{startX:10,endX:11,startY:10,endY:11},targetMapId:"farmhouse",targetSpawnId:"entry"}];
  Object.assign(home.spawns.find((s:{id:string})=>s.id==="entry"),{tileX:3,tileY:5.5,facing:"up"});
  // Real authored item events seed this disposable blueprint. No test-only
  // granting command, teleport or client-side inventory edit is introduced.
  home.world2=newWorld2();
  home.world2.events=[
    {id:"supplies",name:"공방 재료",area:{startX:1,endX:20,startY:2,endY:10},trigger:"enter",condition:"",once:true,action:"item",value:"wood",quantity:25},
    {id:"copper",name:"강화 재료",area:{startX:1,endX:20,startY:2,endY:10},trigger:"enter",condition:"",once:true,action:"item",value:"copper_ore",quantity:5},
  ];
  const response=await page.request.post(`${api}/api/blueprints`,{headers:await editorHeaders(page),data:layout});expect(response.ok()).toBe(true);
  const draft=await response.json();
  expect((await page.request.post(`${api}/api/blueprints/${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`},data:{layout,revision:draft.revision,publish:true}})).ok()).toBe(true);
  await page.addInitScript(id=>{localStorage.setItem("farm-active-blueprint",id);localStorage.setItem("farm-zoom","0.75");},draft.id);
  await page.goto("/");await page.locator("#nickname").fill("생활 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:20000});
  await goHome(page);
}
async function goHome(page: Page): Promise<void> {
  await waitForFarmInput(page);
  let connection = await page.evaluate(() => window.__FARM_DEBUG__.snapshot().reconnectCount);
  let recoveryAck: number | undefined, homeAck: number | undefined;
  // v2.8.3 restores the saved room/position. Do not open furniture again when
  // reconnecting inside the house; the caller performs that interaction.
  if (await page.evaluate(() => window.__FARM_DEBUG__.snapshot().players.find(p => p.local)?.area) !== "farmhouse")
    await page.locator("#action").tap();
  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.__FARM_DEBUG__.snapshot());
    if (snapshot.status !== "connected") { homeAck = undefined; return snapshot.status; }
    if (snapshot.reconnectCount !== connection) {
      connection = snapshot.reconnectCount;
      recoveryAck = snapshot.acknowledgedInputs;
      homeAck = undefined;
    }
    const area = snapshot.players.find(p => p.local)?.area;
    if (area === "farmhouse") {
      homeAck ??= snapshot.acknowledgedInputs;
      return snapshot.acknowledgedInputs - homeAck >= 60 ? area : "entering";
    }
    homeAck = undefined;
    // Reconnection deliberately discards volatile movement/actions and asks
    // the player to press again. Repeat once per observed NEW connection,
    // never blindly retry an ignored/invalid entrance on a healthy connection.
    if (recoveryAck !== undefined && snapshot.acknowledgedInputs - recoveryAck >= 60) {
      recoveryAck = undefined;
      await page.locator("#action").tap();
    }
    return area;
  },{timeout:15000,intervals:[150]}).toBe("farmhouse").catch(async error=>{
    const diagnostic=await page.evaluate(()=>({players:window.__FARM_DEBUG__.snapshot().players,notice:document.getElementById("notice")?.textContent,tool:(document.getElementById("tool") as HTMLSelectElement).value}));
    throw Error(`${String(error)}\nEntry diagnostic: ${JSON.stringify(diagnostic)}`);
  });
}
async function tapObject(page:Page,id:string):Promise<void>{
  // A software-rendered screenshot can trigger the existing backlog reconnect.
  // Wait for acknowledged input again before reading the live room's furniture.
  await waitForFarmInput(page);
  let point:{x:number;y:number}|undefined;
  await expect.poll(async()=>{
    point=await page.evaluate(id=>{
      const debug=window.__FARM_DEBUG__;
      const e=debug.state()?.entities[id] as unknown as {x:number;y:number}|undefined;
      return debug.snapshot().status==="connected"&&e?debug.screenPoint(e.x,e.y):undefined;
    },id);
    return !!point;
  },{timeout:25000}).toBe(true);
  await page.touchscreen.tap(point!.x,point!.y);
}
async function confirmQuantity(page:Page) {
  await page.locator("#quantity-dialog .quantity-confirm").click();
  await expect(page.locator("#quantity-dialog")).not.toBeVisible();
}
for(const viewport of [{width:390,height:844},{width:1280,height:900}])test(`household flow ${viewport.width}: transfer, batch craft, upgrade and bedside morning`,async({page,browser},info)=>{
  test.setTimeout(180000);
  await page.setViewportSize(viewport);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await enterHome(page);
  // Empty chest taps must open it, never recover with pickaxe or lift by hand.
  await page.locator("#tool").selectOption("pickaxe");
  const chestId=await page.evaluate(()=>Object.entries(window.__FARM_DEBUG__.state().entities).find(([,e])=>e.kind==="chest")![0]);
  await tapObject(page,chestId);
  await expect(page.locator("#panel")).toHaveAttribute("data-panel","chest");
  const bag=page.getByRole("region",{name:"내 가방",exact:true});
  const chest=page.getByRole("region",{name:"가족 보관함",exact:true});
  const seeds=(region: typeof bag)=>region.locator('[data-item="sproutberry_seed"]');
  await expect(seeds(bag)).toContainText("×12");
  const woodBag=bag.locator('[data-item="wood"]'),woodChest=chest.locator('[data-item="wood"]');
  await woodBag.getByRole("button",{name:"수량 입력",exact:true}).click();
  await page.locator("#quantity-dialog").getByRole("textbox").fill("17");
  await page.locator("#quantity-dialog").getByRole("button",{name:"취소",exact:true}).click();
  await expect(woodBag).toContainText("×25");await expect(woodChest).toHaveCount(0);
  await woodBag.getByRole("button",{name:"수량 입력",exact:true}).click();
  await page.locator("#quantity-dialog").getByRole("textbox").fill("17");
  await confirmQuantity(page);await expect(woodChest).toContainText("×17");await expect(woodBag).toContainText("×8");
  await woodChest.getByRole("button",{name:"수량 입력",exact:true}).click();
  await page.locator("#quantity-dialog").getByRole("textbox").fill("17");
  await confirmQuantity(page);await expect(woodBag).toContainText("×25");

  await seeds(bag).getByRole("button",{name:"1개 넣기",exact:true}).click();await confirmQuantity(page);
  await expect(seeds(chest)).toContainText("×1");
  await seeds(bag).getByRole("button",{name:/절반/}).click();await confirmQuantity(page);
  await expect(seeds(chest)).toContainText("×7");
  await seeds(bag).getByRole("button",{name:/전체/}).click();await confirmQuantity(page);
  await expect(seeds(chest)).toContainText("×12");await expect(seeds(bag)).toHaveCount(0);
  await seeds(chest).getByRole("button",{name:/절반/}).click();await confirmQuantity(page);
  await expect(seeds(bag)).toContainText("×6");
  expect(await page.locator("#panel-body").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await expect(seeds(chest).getByRole("button",{name:/전체/})).toHaveCSS("min-height","44px");
  await page.screenshot({path:info.outputPath(`chest-${viewport.width}.png`)});
  await page.locator("#panel-close").click();
  await page.reload();await expect(page.locator("#login")).toBeVisible();await page.locator("#resume").click();await expect(page.locator("#login")).toBeHidden({timeout:20000});
  await waitForFarmInput(page);
  expect(await page.evaluate(() => window.__FARM_DEBUG__.snapshot().players.find(p => p.local)?.area)).toBe("farmhouse");
  await goHome(page);
  await page.locator("#tool").selectOption("hand");
  await page.locator("#action").tap();await expect(seeds(chest)).toContainText("×6");
  await seeds(chest).getByRole("button",{name:/전체/}).click();await confirmQuantity(page);await expect(seeds(bag)).toContainText("×12");
  await page.locator("#panel-close").click();
  await page.locator("#tool").selectOption("axe");
  await tapObject(page,"crafting_table");
  await expect(page.locator("#panel")).toHaveAttribute("data-panel","craft",{timeout:15000});
  const detail=page.getByRole("region",{name:"선택한 제작법"});
  await expect(detail.locator(".ingredient strong")).toHaveText("25 / 2");
  await page.getByRole("button",{name:"제작 횟수 입력",exact:true}).click();
  await page.locator("#quantity-dialog").getByRole("textbox",{name:"제작 횟수"}).fill("5");
  await expect(page.locator("#quantity-dialog")).toContainText("필요 10개 / 보유 25개");
  await confirmQuantity(page);
  await expect(detail.locator(".ingredient strong")).toHaveText("15 / 2");
  await expect(page.locator(".household-feedback")).toContainText("5개 제작");
  await expect(page.getByRole("region",{name:"도구 강화"})).toHaveCount(0);
  await page.locator('[data-category="upgrade"]').click();
  await expect(detail).toHaveCount(0);
  await page.getByRole("button",{name:"Lv2로 강화",exact:true}).click();
  await expect(page.getByRole("region",{name:"도구 강화"})).toContainText("강화 완료");
  await page.locator('[data-category="all"]').click();
  await expect(page.getByRole("region",{name:"도구 강화"})).toHaveCount(0);
  await page.getByRole("button",{name:/최대 5회 제작/}).click();await confirmQuantity(page);
  await expect(detail.locator(".ingredient strong")).toHaveText("0 / 2");
  await expect(page.getByRole("button",{name:"1회 제작",exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath(`craft-${viewport.width}.png`)});
  await page.locator("#panel-close").click();
  await tapObject(page,"bed");await expect(page.locator("#panel")).toHaveAttribute("data-panel","sleep",{timeout:15000});
  await expect(page.locator(".sleep-card")).toContainText("잠");
  await page.screenshot({path:info.outputPath(`bed-${viewport.width}.png`)});
  await page.getByRole("button",{name:"잠자기",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window.__FARM_DEBUG__.state() as unknown as {day:number}|undefined)?.day)).toBe(2);
  await expect(page.locator("#panel")).not.toBeVisible();
  await waitForFarmInput(page);
  await page.keyboard.press("Space");
  await expect(page.locator("#panel")).toBeVisible();
  await expect(page.locator("#panel")).toHaveAttribute("data-panel","sleep");
  if (viewport.width > 600) {
    await page.locator("#panel-close").click();
    const code = await page.evaluate(() => JSON.parse(localStorage.getItem("farm-v26-session")!).farmId as string);
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    try {
      const peer = await context.newPage();
      await peer.goto("/"); await peer.locator("#nickname").fill("가족 농부");
      await peer.locator("#farm-code").fill(code); await peer.locator("#join-farm").click();
      await expect(peer.locator("#login")).toBeHidden({timeout:20000}); await goHome(peer);
      await expect(page.locator("#connection")).toHaveAttribute("aria-label",/2명/);
      await page.locator("#action").tap();
      await page.getByRole("button",{name:"잠자기에 동의",exact:true}).click();
      await expect(peer.locator("#sleep-status")).toContainText("1/2");
      await expect.poll(()=>page.evaluate(()=>(window.__FARM_DEBUG__.state() as unknown as {day:number}|undefined)?.day)).toBe(2);
      await peer.locator("#sleep-status").tap();
      await expect(peer.locator(".sleep-card")).toContainText("1/2");
      await peer.getByRole("button",{name:"잠자기에 동의",exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>(window.__FARM_DEBUG__.state() as unknown as {day:number}|undefined)?.day)).toBe(3);
      await expect(peer.locator("#sleep-status")).toBeHidden();
    } finally {await context.close();}
  }
  expect(errors).toEqual([]);
});
