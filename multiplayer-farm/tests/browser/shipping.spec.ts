import { test, expect, type Page } from "@playwright/test";
import { editorHeaders } from "./editor-auth.js";
import { waitForFarmInput } from "./nature-target.js";
import { newWorld2 } from "../../shared/world2.js";
const api="http://127.0.0.1:2575";
async function enter(page:Page,shop=false){
 const layout=await(await page.request.get(`${api}/api/blueprints/defaults`)).json();
 const farm=layout.maps.farm;
 if(shop){
  farm.objects=[];farm.baseTileType="stone_floor";farm.terrainRegions=[];farm.collisionRegions=[];farm.farmAreas=[];farm.world2=newWorld2();
  Object.assign(farm.spawns.find((s:{id:string})=>s.id==="farm_entry"),{tileX:10.5,tileY:9.5});
  farm.warps=[{id:"store-entry",area:{startX:10,endX:11,startY:10,endY:11},targetMapId:"general_store",targetSpawnId:layout.maps.general_store.spawns[0].id}];
 }else{
  farm.world2.events.push({id:"shipping-supplies",name:"출하 테스트 수확물",area:{startX:57,endX:64,startY:35,endY:40},trigger:"enter",condition:"",once:true,action:"item",value:"sunpotato",quantity:99});
  farm.world2.events.push({...farm.world2.events.at(-1),id:"shipping-extra",quantity:38});
 }
 const response=await page.request.post(`${api}/api/blueprints`,{headers:await editorHeaders(page),data:layout});expect(response.ok(),await response.text()).toBe(true);const draft=await response.json();
 expect((await page.request.post(`${api}/api/blueprints/${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`},data:{layout,revision:draft.revision,publish:true}})).ok()).toBe(true);
 await page.addInitScript(id=>{localStorage.setItem("farm-active-blueprint",id);localStorage.setItem("farm-zoom","0.6");},draft.id);
 await page.goto("/");await page.locator("#nickname").fill("출하 농부");await page.locator("#create-farm").click();await expect(page.locator("#login")).toBeHidden({timeout:20000});await waitForFarmInput(page);
}
async function tapCrate(page:Page){
 const point=await page.evaluate(()=>{const e=Object.values(window.__FARM_DEBUG__.state().entities).find(e=>e.kind==="shipping")! as unknown as {x:number;y:number};return window.__FARM_DEBUG__.screenPoint(e.x,e.y-12);});
 await page.touchscreen.tap(point.x,point.y);
 await expect(page.locator("#panel")).toHaveAttribute("data-panel","shipping",{timeout:18000});
}
async function confirm(page:Page){await page.locator("#quantity-dialog .quantity-confirm").click();await expect(page.locator("#quantity-dialog")).not.toBeVisible();}

test("mobile crate touch, numeric validation, cancellation, partial return, reload and next-day report",async({page},info)=>{
 test.setTimeout(100000);await enter(page);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.locator("#tool").selectOption("axe");
 await page.screenshot({path:info.outputPath("shipping-house-right.png")});
 await waitForFarmInput(page);await tapCrate(page);
 const item=page.locator('.commerce-item[data-item="sunpotato"]').filter({has:page.getByRole("button",{name:"출하 수량 선택"})});
 await expect(item).toContainText("보유 137개");await item.getByRole("button").click();
 const dialog=page.locator("#quantity-dialog"),input=dialog.getByRole("textbox",{name:"선택 수량"});
 await expect(input).toHaveAttribute("inputmode","numeric");
 for(const bad of ["0","-1","1.5","abc","138"]){await input.fill(bad);await expect(dialog.locator(".quantity-confirm")).toBeDisabled();}
 await input.fill("37");await expect(dialog).toContainText("2,220 G");
 await dialog.getByRole("button",{name:"취소",exact:true}).click();await expect(item).toContainText("보유 137개");
 await item.getByRole("button").click();await input.fill("37");
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath("shipping-quantity-mobile.png")});await confirm(page);
 await expect(item).toContainText("보유 100개");await expect(page.locator("#wallet")).toHaveText("120 G");
 await page.getByRole("button",{name:"회수 수량 선택"}).click();await input.fill("7");await confirm(page);await expect(item).toContainText("보유 107개");
 await page.locator("#panel-close").click();await page.reload();await page.locator("#resume").click();await expect(page.locator("#login")).toBeHidden({timeout:20000});await waitForFarmInput(page);await tapCrate(page);
 await expect(page.locator("#panel-body")).toContainText("30개 · 개당 60 G");
 await page.locator("#panel-close").click();await page.locator("#menu").click();await page.getByRole("button",{name:"농장 및 가족",exact:true}).click();await page.getByRole("button",{name:"잠자기 투표",exact:true}).click();await page.getByRole("button",{name:"잠자기",exact:true}).click();
 await expect(page.locator("#panel")).toHaveAttribute("data-panel","shipping-report");await expect(page.locator("#panel-body")).toContainText("총 1,800 G 지급 완료");await expect(page.locator("#wallet")).toHaveText("1920 G");
 expect(errors).toEqual([]);
});

test("mobile shop uses common quantity dialog, affordability, immediate prices and explicit confirmation",async({page})=>{
 test.setTimeout(65000);await enter(page,true);await page.locator("#action").tap();
 await expect.poll(()=>page.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>p.local)?.area)).toBe("general_store");
 await waitForFarmInput(page);await page.locator("#action").tap();await expect(page.locator("#panel")).toHaveAttribute("data-panel","shop");
 await page.locator('.commerce-item[data-item="stamina_biscuit"]').getByRole("button").click();
 const dialog=page.locator("#quantity-dialog"),input=dialog.getByRole("textbox");
 await input.fill("13");await expect(dialog.locator(".quantity-confirm")).toBeDisabled();await expect(dialog).toContainText("최대 수량은 12");
 await input.fill("5");await expect(dialog).toContainText("총 구매 가격: 50 G");await expect(page.locator("#wallet")).toHaveText("120 G");await confirm(page);await expect(page.locator("#wallet")).toHaveText("70 G");
 await expect(page.locator('.commerce-item[data-item="stamina_biscuit"]')).toContainText("보유 10개");
});
