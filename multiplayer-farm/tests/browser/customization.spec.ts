import {test,expect,type Page} from "@playwright/test";
import {waitForFarmInput} from "./nature-target.js";
const localLook=(p:Page)=>p.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>p.local)?.appearance);
const customize=async(p:Page)=>{await p.locator("#menu").click();await p.getByRole("button",{name:"캐릭터 꾸미기",exact:true}).click();};
test("v2.8: appearance draft, all viewports, permission separation, peer update and another device",async({page,browser},info)=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await page.locator("#new-appearance").click();
  await page.getByLabel("헤어스타일",{exact:true}).selectOption("ponytail");
  await page.getByLabel("헤어 색상",{exact:true}).selectOption("rose");
  await page.getByLabel("상의",{exact:true}).selectOption("blue");
  await page.getByLabel("하의",{exact:true}).selectOption("denim");
  await page.getByLabel("신발",{exact:true}).selectOption("cream");
  await page.getByLabel("성별",{exact:true}).selectOption("female");
  await page.getByLabel("키",{exact:true}).selectOption("tall");
  await page.locator("#appearance-save").click();await page.locator("#nickname").fill("꾸미기 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:25000});await waitForFarmInput(page);
  const original=await localLook(page);expect(original?.hair).toBe("ponytail");expect(original?.height).toBe("tall");
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("farm-v26-session")!));
  const peerContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const another=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true});
  try {
    const peer=await peerContext.newPage();await peer.goto("/");await peer.locator("#nickname").fill("일반 가족");
    await peer.locator("#farm-code").fill(saved.farmId);await peer.locator("#join-farm").click();
    await expect(peer.locator("#login")).toBeHidden({timeout:25000});
    await expect.poll(()=>peer.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>!p.local)?.appearance)).toEqual(original);
    // A forged display preference (even a forged local isOwner flag) never
    // grants the guest owner authority or a working editor.
    await peer.evaluate(()=>{localStorage.setItem("farm-developer-ui-v1","true");const s=JSON.parse(localStorage.getItem("farm-v26-session")!);s.isOwner=true;localStorage.setItem("farm-v26-session",JSON.stringify(s));});
    await peer.locator("#menu").click();
    await expect(peer.getByRole("button",{name:"개발자 도구",exact:true})).toHaveCount(0);
    await peer.getByRole("button",{name:"⚙ 소리·화면 설정"}).click();await expect(peer.locator("#developer-toggle")).toBeDisabled();
    await peer.locator("#panel-close").click();
    await page.locator("#menu").click();await expect(page.getByRole("button",{name:"개발자 도구",exact:true})).toHaveCount(0);
    await page.getByRole("button",{name:"⚙ 소리·화면 설정"}).click();await expect(page.locator("#developer-toggle")).toBeEnabled();
    await page.locator("#developer-toggle").click();await page.locator("#panel-close").click();await page.locator("#menu").click();
    await page.getByRole("button",{name:"개발자 도구",exact:true}).click();await expect(page.getByRole("button",{name:"월드 편집기"})).toBeVisible();
    await page.getByRole("button",{name:"Network HUD"}).click();await expect(page.locator("#hud")).toBeVisible();
    await page.locator("#menu").click();await page.getByRole("button",{name:"⚙ 소리·화면 설정"}).click();await page.locator("#developer-toggle").click();
    await expect(page.locator("#hud")).toBeHidden();await page.locator("#panel-close").click();
    await customize(page);
    await page.getByLabel("헤어스타일",{exact:true}).selectOption("long");
    expect(await localLook(page)).toEqual(original);
    await page.getByRole("button",{name:"취소",exact:true}).click();expect(await localLook(page)).toEqual(original);
    await customize(page);
    for(const viewport of [{width:344,height:882},{width:768,height:1024},{width:844,height:390},{width:1280,height:900}]){
      await page.setViewportSize(viewport);
      expect(await page.locator("#panel-body").evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
      await page.getByRole("button",{name:"뒷모습",exact:true}).click();
      await page.screenshot({path:info.outputPath(`customize-${viewport.width}.png`)});
    }
    await page.getByLabel("헤어스타일",{exact:true}).selectOption("bun");
    await page.getByLabel("키",{exact:true}).selectOption("short");await page.locator("#appearance-save").click();
    await expect(page.locator("#panel")).toBeHidden();
    await expect.poll(()=>localLook(page)).toEqual({...original,hair:"bun",height:"short"});
    await expect.poll(()=>peer.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>!p.local)?.appearance)).toEqual({...original,hair:"bun",height:"short"});
    // New browser context: use the visible credential handoff, never copy a
    // local appearance cache or re-create a same-named member.
    await page.close();
    const device=await another.newPage();await device.goto("/");await device.locator(".player-recovery summary").click();
    await device.locator("#resume-code").fill(saved.token);await device.locator("#import-player").click();
    await expect(device.locator("#login")).toBeHidden({timeout:25000});
    await expect.poll(()=>localLook(device)).toEqual({...original,hair:"bun",height:"short"});
    await peer.goto("/editor.html");await expect(peer.getByRole("heading",{name:"월드 편집 권한이 필요해요"})).toBeVisible();
  }finally{await peerContext.close();await another.close();}
  expect(errors).toEqual([]);
});

test("appearance compositor: every hair, all directions, walking and every tool preserve foot and grip anchors",async({page},info)=>{
  test.setTimeout(60000);await page.setViewportSize({width:1100,height:1200});
  await page.goto("/");await page.locator("#nickname").fill("외형 동작");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:25000});
  const result=await page.evaluate(async()=>{
    const {appearanceTexture,paintCharacterFrame,CHARACTER_SOURCE}=await import("/client/character-art.ts" as string);
    const {APPEARANCE_OPTIONS,DEFAULT_APPEARANCE}=await import("/shared/appearance.ts" as string);
    const {ToolAnimationRig}=await import("/client/tool-animation.ts" as string);
    const {FARMER_FRAMES}=await import("/client/tool-animation-art.ts" as string);
    const {actionTiming}=await import("/shared/interaction.ts" as string);
    const scene=(window.__FARM_DEBUG__ as any).scene();scene.scene.pause();
    const image=new Image();image.src=CHARACTER_SOURCE;await image.decode();
    const sheet=document.createElement("div");sheet.id="appearance-sheet";sheet.style.cssText="position:fixed;inset:0;z-index:9999;background:#f8f1df;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);padding:20px;gap:12px";
    const checks:string[]=[],hairSamples=new Set<string>();
    for(const [hair,label] of Object.entries(APPEARANCE_OPTIONS.hair))for(const facing of ["down","up","left","right"]){
      const a={...DEFAULT_APPEARANCE,hair,hairColor:hair==="original"?"original":"chestnut",gender:hair==="original"?"male":"female",top:hair==="original"?"original":"sage",bottom:hair==="original"?"original":"denim",shoes:hair==="original"?"original":"cream"};
      const cell=document.createElement("div"),title=document.createElement("small");title.textContent=`${label} · ${facing}`;cell.append(title);
      const canvas=document.createElement("canvas");canvas.width=48;canvas.height=72;canvas.style.cssText="height:144px;width:96px;image-rendering:pixelated;display:block";
      paintCharacterFrame(canvas.getContext("2d"),image,["down","up","left","right"].indexOf(facing)*4*48,0,a,facing);cell.append(canvas);sheet.append(cell);
      if(facing==="down")hairSamples.add(canvas.toDataURL());
      const key=appearanceTexture(scene,"player",a);if(!scene.textures.get(key).has(31))checks.push("walk atlas missing");
      for(const tool of ["axe","pickaxe","hoe","scythe","water","hand"]){
        const event={id:"preview",actorId:"preview",area:"farm",x:200,y:300,facing,tool,action:tool==="water"?"waterCrop":"useTool",outcome:"hit",drops:[],point:{x:232,y:300}};
        const rig=new ToolAnimationRig(scene);rig.start(event,{...a,height:"tall"});
        const timing=actionTiming(event);
        for(const t of [0,timing.windup,timing.impact,timing.follow]){
          rig.update(t,200,300,{...a,height:"tall"});const hand=FARMER_FRAMES[facing][rig.currentPose].hand;
          const actual=rig.body.getWorldTransformMatrix().transformPoint(hand[0]-rig.body.displayOriginX,hand[1]-rig.body.displayOriginY);
          if(Math.hypot(actual.x-rig.hands[0].x,actual.y-rig.hands[0].y)>.001)checks.push(`${tool}/${facing} grip`);
          if(rig.body.y!==300)checks.push("foot moved");
        }rig.destroy();
      }
    }
    document.body.append(sheet);return {checks,hairCount:hairSamples.size};
  });
  expect(result.checks).toEqual([]);expect(result.hairCount).toBe(8);
  await page.screenshot({path:info.outputPath("hair-directions.png")});
});
