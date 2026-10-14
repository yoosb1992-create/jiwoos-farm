import {test, expect, type Page} from '@playwright/test';
import type {Session} from '../../persistence/store.js';
const api='http://127.0.0.1:2575';
const key='farm-v26-session';
async function create(page:Page,nickname:string):Promise<Session>{
  const response=await page.request.post(`${api}/api/session`,{data:{create:true,nickname,farmName:`${nickname} 농장`}});
  expect(response.ok()).toBe(true);return response.json();
}
async function seed(page:Page,sessions:Session[]){
  await page.addInitScript(values=>{
    if(!localStorage.getItem('entry-fixture')){
      localStorage.setItem('entry-fixture','1');
      localStorage.setItem('farm-v26-session',JSON.stringify(values[0]));
      localStorage.setItem('farm-v26-sessions',JSON.stringify(values));
    }
  },sessions);
}
async function wake(page:Page){await page.evaluate(()=>{
  window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
});}
for(const width of [390,1280])test(`saved identity stays in lobby until explicit selection (${width})`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const first=await create(page,'첫농부'),second=await create(page,'둘농부');
  await seed(page,[first,second]);
  let matches=0;page.on('request',r=>{if(r.url().includes('/matchmake/'))matches++;});
  await page.goto('/');
  await expect(page.locator('#resume')).toBeVisible();
  await expect(page.locator('#saved-farms .item-row')).toHaveCount(2);
  await expect(page.locator('#start-world-select')).toBeVisible();
  await expect(page.locator('#create-farm')).toBeVisible();
  await page.evaluate(()=>(window as unknown as {__FARM_DEBUG__:{scene:{ready:Promise<void>}}}).__FARM_DEBUG__.scene.ready);
  await wake(page);
  // Beyond the old automatic entry delay, after the renderer is fully ready.
  await page.waitForTimeout(8000);
  await expect(page.locator('#login')).toBeVisible();expect(matches).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('farm-v26-session')!))).toEqual(first);
  await page.locator('#resume').click();
  await expect(page.locator('#connection')).toHaveAttribute('data-status','connected');
  await expect.poll(()=>page.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>p.local))).not.toBeUndefined();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('farm-v26-session')!).playerId)).toBe(first.playerId);
  await page.reload();await expect(page.locator('#login')).toBeVisible();
  const before=matches;await wake(page);await page.waitForTimeout(1000);expect(matches).toBe(before);
  await page.locator('#saved-farms .item-row').filter({hasText:second.farmId}).getByRole('button',{name:'이어하기',exact:true}).click();
  await expect(page.locator('#connection')).toHaveAttribute('data-status','connected');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('farm-v26-session')!).playerId)).toBe(second.playerId);
  // Browser back/forward cache restoration deliberately rebuilds an idle lobby.
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await expect(page.locator('#login')).toBeVisible();
  const restored=matches;await wake(page);await page.waitForTimeout(1000);expect(matches).toBe(restored);
});
test('cancelled late matchmaking cannot enter or override the next selected farm',async({page})=>{
  const first=await create(page,'취소농부'),second=await create(page,'선택농부');await seed(page,[first,second]);
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let intercepted=false;
  await page.route('**/matchmake/**',async route=>{
    if(!intercepted){intercepted=true;const response=await route.fetch();await gate;await route.fulfill({response}).catch(()=>{});}
    else await route.continue();
  });
  await page.goto('/');await page.locator('#resume').click();
  await expect.poll(()=>intercepted).toBe(true);
  await page.locator('#cancel-connect').click();release();await wake(page);
  await page.waitForTimeout(1500);
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#connection')).toHaveAttribute('data-status','disconnected');
  await page.locator('#saved-farms .item-row').filter({hasText:second.farmId}).getByRole('button',{name:'이어하기',exact:true}).click();
  await expect(page.locator('#connection')).toHaveAttribute('data-status','connected');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('farm-v26-session')!).playerId)).toBe(second.playerId);
});
test('cancelled personal-code response cannot save or enter an unwanted identity',async({page})=>{
  const identity=await create(page,'개인코드');
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let intercepted=false;
  await page.route('**/api/session',async route=>{
    const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response}).catch(()=>{});
  });
  await page.goto('/');await page.locator('.player-recovery summary').click();
  await page.locator('#resume-code').fill(identity.token);await page.locator('#import-player').click();
  await expect.poll(()=>intercepted).toBe(true);await page.locator('#cancel-connect').click();release();await wake(page);
  await page.waitForTimeout(1500);await expect(page.locator('#login')).toBeVisible();
  expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
  await expect(page.locator('#connection')).not.toHaveAttribute('data-status','connected');
});
