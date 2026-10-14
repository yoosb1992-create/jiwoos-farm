import { test, expect } from "@playwright/test";
import { clearWorldBlueprint, waitForFarmInput } from "./nature-target.js";

test("phone rain profiles, cloud transitions, visible lightning, separate thunder and indoor suppression",async({page},info)=>{
  test.setTimeout(90000);
  await clearWorldBlueprint(page,40.5,40.5);
  await page.goto("/");await page.locator("#nickname").fill("날씨 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden();await waitForFarmInput(page);
  const measured=await page.evaluate(async()=>{
    const d=window.__FARM_DEBUG__ as any,s=d.scene(),original=s.onFrame,frame=original(performance.now(),16);
    const source="/shared/weather.ts",{makeWeatherPlan}=await import(/* @vite-ignore */source);
    s.scene.pause();let now=performance.now(),thunder=0;const oldThunder=s.onThunder;s.onThunder=()=>thunder++;
    const state={...frame.state.toJSON(),day:42,minute:880,entities:frame.state.entities,weather:"rain",weatherEvent:""};
    s.onFrame=()=>({snapshot:frame.snapshot,state});
    const values:any[]=[];
    for(const kind of ["drizzle","rain","shower","storm"]) {
      const plan=makeWeatherPlan(3,42,"rain",kind);plan.startMinute=0;plan.endMinute=1440;
      state.weatherPlan=JSON.stringify(plan);
      for(let i=0;i<35;i++)s.update(now+=60,60);
      values.push({kind,count:s.weatherEffects.particleCount,cloud:s.weatherEffects.cloudReduction,ambient:s.sunlight.ambientLight,commands:s.atmosphere.commandBuffer.length});
    }
    const effects=s.weatherEffects,g=s.add.graphics().setDepth(99999);
    const event={id:"42:11",day:42,minute:880,seed:14,lightning:false,strength:.6,thunderDelayMs:0};
    state.weatherEvent=JSON.stringify(event);s.update(now+=60,60);
    const soundOnly={thunder,flash:effects.flashAt};
    effects.setLightningMode("normal");state.weatherEvent=JSON.stringify({...event,id:"42:12",lightning:true,thunderDelayMs:700});s.update(now+=60,60);
    g.clear();effects.draw(g,390,844,now+210,s.sunlight.ambientLight);const lit=g.commandBuffer.length;
    effects.setLightningMode("off");g.clear();effects.draw(g,390,844,now+210,s.sunlight.ambientLight);const unlit=g.commandBuffer.length;
    effects.update(state,"farmhouse",true,now+=60,60);g.clear();effects.draw(g,390,844,now,.2);const indoor=effects.particleCount,indoorCommands=g.commandBuffer.length;
    effects.update(state,"mine_1",true,now+=60,60);g.clear();effects.draw(g,390,844,now,.2);const mine=effects.particleCount;
    effects.resetSession();effects.update(state,"farm",true,now+=60,60);const recoveredThunder=thunder;
    const shower=makeWeatherPlan(3,42,"rain","shower");state.weatherPlan=JSON.stringify(shower);state.minute=shower.endMinute;
    const before=effects.cloudReduction;effects.update(state,"farm",true,now+=16,16);const first=effects.cloudReduction;
    for(let i=0;i<40;i++)effects.update(state,"farm",true,now+=60,60);const end=effects.cloudReduction;
    g.destroy();s.onThunder=oldThunder;s.onFrame=original;s.scene.resume();
    return {values,soundOnly:{thunder:soundOnly.thunder,flashFinite:Number.isFinite(soundOnly.flash)},thunder,recoveredThunder,lit,unlit,indoor,indoorCommands,mine,before,first,end};
  });
  expect(measured.values.map(v=>v.kind)).toEqual(["drizzle","rain","shower","storm"]);
  for(let i=1;i<4;i++){expect(measured.values[i].count).toBeGreaterThan(measured.values[i-1].count);expect(measured.values[i].ambient).toBeLessThan(measured.values[i-1].ambient);}
  expect(measured.values[3].count).toBeLessThanOrEqual(200);expect(measured.soundOnly).toEqual({thunder:1,flashFinite:false});
  expect(measured.thunder).toBe(2);expect(measured.recoveredThunder).toBe(2);expect(measured.lit).toBeGreaterThan(measured.unlit);
  expect(measured.indoor).toBe(0);expect(measured.mine).toBe(0);expect(measured.indoorCommands).toBe(0);
  expect(measured.first).toBeLessThan(measured.before);expect(measured.first).toBeGreaterThan(measured.before*.8);expect(measured.end).toBeLessThan(.01);
  // Record four comparable real Phaser renders with the same authoritative frame.
  for(const kind of ["drizzle","rain","shower","storm"]) {
    await page.evaluate(async kind=>{
      const d=window.__FARM_DEBUG__ as any,s=d.scene(),source="/shared/weather.ts",{makeWeatherPlan}=await import(/* @vite-ignore */source);
      const original=s.onFrame,frame=original(performance.now(),16),plan=makeWeatherPlan(3,42,"rain",kind);plan.startMinute=0;plan.endMinute=1440;
      s.scene.pause();s.onFrame=()=>({snapshot:frame.snapshot,state:{...frame.state.toJSON(),day:42,minute:765,weather:"rain",weatherPlan:JSON.stringify(plan),entities:frame.state.entities}});
      const now=Math.max(performance.now(),s.lastAtmosphere)+60;for(let i=0;i<35;i++)s.update(now+i*60,60);(window as any).__restoreWeather=()=>{s.onFrame=original;s.scene.resume();};
    },kind);
    await page.screenshot({path:info.outputPath(`rain-${kind}.png`)});await page.evaluate(()=>(window as any).__restoreWeather());
  }
  await page.locator("#menu").click();await page.getByRole("button",{name:"⚙ 소리·화면 설정",exact:true}).click();
  await page.locator("#lightning-mode").selectOption("reduced");expect(await page.evaluate(()=>localStorage.getItem("farm-lightning"))).toBe("reduced");
});
