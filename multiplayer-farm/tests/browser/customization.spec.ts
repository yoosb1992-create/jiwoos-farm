import {test,expect,type Page} from "@playwright/test";
import {waitForFarmInput} from "./nature-target.js";
async function choose(p:Page,label:string,value:string){
  const field=p.getByLabel(label,{exact:true});
  const group=p.locator(".character-group").filter({has:field});
  if(await group.count() && !await group.evaluate((e:HTMLDetailsElement)=>e.open))await group.locator("summary").click();
  await field.selectOption(value);
}
const localLook=(p:Page)=>p.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>p.local)?.appearance);
const customize=async(p:Page)=>{await p.locator("#menu").click();await p.getByRole("button",{name:"캐릭터 꾸미기",exact:true}).click();};
test("v2.8: appearance draft, all viewports, permission separation, peer update and another device",async({page,browser},info)=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await page.locator("#new-appearance").click();
  await choose(page,"헤어스타일","ponytail");
  await choose(page,"헤어 색상","rose");
  await choose(page,"상의","blue");
  await choose(page,"하의","denim");
  await choose(page,"신발 색상","cream");
  await choose(page,"성별","female");
  await expect(page.getByLabel("미리보기 동작")).toHaveValue("idle");
  for(const [name,value] of [["피부색","deep"],["눈 모양","large"],["눈동자 색상","green"],["눈썹 모양","straight"],["코 모양","long"],["귀 모양","long"],["신발 종류","sandals"]])
    await choose(page,name!,value!);
  await page.getByLabel("키",{exact:true}).fill("145");
  await page.locator("#appearance-save").click();await page.locator("#nickname").fill("꾸미기 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:25000});await waitForFarmInput(page);
  const original=await localLook(page);expect(original?.hair).toBe("ponytail");expect(original?.height).toBe(145);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("farm-v26-session")!));
  const peerContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const another=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true});
  try {
    const peer=await peerContext.newPage();await peer.goto("/");await peer.locator("#nickname").fill("일반 가족");
    await peer.locator("#farm-code").fill(saved.farmId);await peer.locator("#join-farm").click();
    await expect(peer.locator("#login")).toBeHidden({timeout:25000});
    await expect.poll(()=>peer.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>!p.local)?.appearance)).toEqual(original);
    // A forged display preference (even a forged local isOwner flag) never
    // grants the guest owner authority over the live farm.
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
    await choose(page,"헤어스타일","long");
    expect(await localLook(page)).toEqual(original);
    await page.getByRole("button",{name:"취소",exact:true}).click();expect(await localLook(page)).toEqual(original);
    await customize(page);
    for(const viewport of [{width:344,height:882},{width:768,height:1024},{width:844,height:390},{width:1280,height:900}]){
      await page.setViewportSize(viewport);
      expect(await page.locator("#panel-body").evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
      await page.getByRole("button",{name:"뒷모습",exact:true}).click();
      await page.screenshot({path:info.outputPath(`customize-${viewport.width}.png`)});
    }
    await choose(page,"헤어스타일","bun");
    await page.getByLabel("키",{exact:true}).fill("70");await page.locator("#appearance-save").click();
    await expect(page.locator("#panel")).toBeHidden();
    await expect.poll(()=>localLook(page)).toEqual({...original,hair:"bun",height:70});
    await expect.poll(()=>peer.evaluate(()=>window.__FARM_DEBUG__.snapshot().players.find(p=>!p.local)?.appearance)).toEqual({...original,hair:"bun",height:70});
    // New browser context: use the visible credential handoff, never copy a
    // local appearance cache or re-create a same-named member.
    await page.close();
    const device=await another.newPage();await device.goto("/");await device.locator(".player-recovery summary").click();
    await device.locator("#resume-code").fill(saved.token);await device.locator("#import-player").click();
    await expect(device.locator("#login")).toBeHidden({timeout:25000});
    await expect.poll(()=>localLook(device)).toEqual({...original,hair:"bun",height:70});
    // Everyone may author a device-only starter, but a forged owner preference
    // must still fail the authoritative current-family permission check.
    await peer.goto("/editor.html");
    await expect(peer.locator("#source-label")).toContainText("공식 기본 월드");
    await peer.locator('#source-bar [data-panel="workspace"]').click();
    const denied = peer.waitForResponse(r=>r.url().endsWith("/api/farm-layout"));
    await peer.locator("#load-current").click();
    expect((await denied).status()).toBe(403);
    await expect(peer.locator("#status")).toContainText("소유자");
  }finally{await peerContext.close();await another.close();}
  expect(errors).toEqual([]);
});

test("appearance compositor: every hair, all directions, walking and every tool preserve foot and grip anchors",async({page},info)=>{
  test.setTimeout(60000);await page.setViewportSize({width:1100,height:1200});
  await page.goto("/");await page.locator("#nickname").fill("외형 동작");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:25000});
  const result=await page.evaluate(async()=>{
    const {appearanceTexture,paintCharacterFrame,CHARACTER_SOURCE,characterHand}=await import("/client/character-art.ts" as string);
    const {APPEARANCE_OPTIONS,DEFAULT_APPEARANCE}=await import("/shared/appearance.ts" as string);
    const {ToolAnimationRig}=await import("/client/tool-animation.ts" as string);
    const {FARMER_FRAMES}=await import("/client/tool-animation-art.ts" as string);
    const {actionTiming}=await import("/shared/interaction.ts" as string);
    const scene=(window.__FARM_DEBUG__ as any).scene();scene.scene.pause();
    const image=new Image();image.src=CHARACTER_SOURCE;await image.decode();
    const sheet=document.createElement("div");sheet.id="appearance-sheet";sheet.style.cssText="position:fixed;inset:0;z-index:9999;background:#f8f1df;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);padding:20px;gap:12px";
    const checks:string[]=[],hairSamples=new Set<string>();
    for(const [hair,label] of Object.entries(APPEARANCE_OPTIONS.hair))for(const facing of ["down","up","left","right"]){
      const a={...DEFAULT_APPEARANCE,hair,hairColor:hair==="original"?"original":"chestnut",gender:hair==="original"?"male":"female",top:hair==="original"?"original":"sage",bottom:hair==="original"?"original":"denim",shoeColor:hair==="original"?"original":"cream"};
      const cell=document.createElement("div"),title=document.createElement("small");title.textContent=`${label} · ${facing}`;cell.append(title);
      const canvas=document.createElement("canvas");canvas.width=48;canvas.height=72;canvas.style.cssText="height:144px;width:96px;image-rendering:pixelated;display:block";
      paintCharacterFrame(canvas.getContext("2d"),image,["down","up","left","right"].indexOf(facing)*4*48,0,a,facing);cell.append(canvas);sheet.append(cell);
      if(facing==="down")hairSamples.add(canvas.toDataURL());
      const key=appearanceTexture(scene,"player",a);if(!scene.textures.get(key).has(31))checks.push("walk atlas missing");
      for(const tool of ["axe","pickaxe","hoe","scythe","water","hand"]){
        const event={id:"preview",actorId:"preview",area:"farm",x:200,y:300,facing,tool,action:tool==="water"?"waterCrop":"useTool",outcome:"hit",drops:[],point:{x:232,y:300}};
        const rig=new ToolAnimationRig(scene);rig.start(event,{...a,height:145});
        if(rig.body.visible||rig.palm.visible)checks.push("unbound rig exposed old appearance");
        const timing=actionTiming(event);
        for(const t of [0,timing.windup,timing.impact,timing.follow]){
          rig.update(t,200,300,{...a,height:145});const hand=characterHand({...a,height:145},facing,rig.currentPose);
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

test("v2.8.1 fixed face layers, silhouettes, skin palettes and live texture lifetime",async({page},info)=>{
  test.setTimeout(60000);await page.setViewportSize({width:1320,height:1600});
  await page.goto("/");await page.locator("#nickname").fill("얼굴 파츠 검증");await page.locator("#create-farm").click();
  await expect(page.locator("#login")).toBeHidden({timeout:25000});
  const result=await page.evaluate(async()=>{
    const art=await import("/client/character-art.ts" as string);
    const parts=await import("/client/character-parts.ts" as string);
    const {CHARACTER_MASKS}=await import("/client/character-masks.ts" as string);
    const {APPEARANCE_OPTIONS,DEFAULT_APPEARANCE}=await import("/shared/appearance.ts" as string);
    const scene=(window.__FARM_DEBUG__ as any).scene();scene.scene.pause();
    const source=scene.textures.get("player").getSourceImage();
    const checks:string[]=[],sheet=document.createElement("div");sheet.id="face-parts-sheet";
    sheet.style.cssText="position:absolute;top:0;left:0;right:0;z-index:99999;background:#f1ebdc;color:#304c35;padding:24px;display:grid;grid-template-columns:repeat(8,1fr);gap:12px;align-content:start";
    const paint=(a:any,index:number)=>{
      const canvas=document.createElement("canvas");canvas.width=48;canvas.height=72;
      art.paintCharacterFrame(canvas.getContext("2d"),source,index%16*48,Math.floor(index/16)*72,a,["down","up","left","right"][Math.floor(index%16/4)]);return canvas;
    };
    const pixels=(canvas:HTMLCanvasElement,x=0,y=0,w=48,h=72)=>Array.from(canvas.getContext("2d")!.getImageData(x,y,w,h).data);
    const alpha=(c:HTMLCanvasElement)=>pixels(c).filter((_,i)=>i%4===3).map(a=>a?1:0);
    const silhouetteDiff=(a:any,b:any)=>{const one=alpha(a),two=alpha(b);return one.filter((v,i)=>v!==two[i]).length;};
    for(const key of ["hair","gender","skinColor","eyeShape","eyeColor","eyebrowStyle","noseStyle","earStyle","shoeStyle"]){
      const heading=document.createElement("h3");heading.textContent=key;heading.style.gridColumn="1/-1";sheet.append(heading);
      const front=new Set<string>(),side=new Set<string>();
      for(const value of Object.keys(APPEARANCE_OPTIONS[key])){
        const a={...DEFAULT_APPEARANCE,hair:key==="hair"?value:"short",[key]:value};
        const card=document.createElement("div"),label=document.createElement("div");label.textContent=value;card.append(label);sheet.append(card);
        for(const index of [0,12,4]){
          const canvas=paint(a,index);canvas.style.cssText="image-rendering:pixelated;width:120px;height:180px;display:block";card.append(canvas);
          if(index===0)front.add(canvas.toDataURL());if(index===12)side.add(canvas.toDataURL());
        }
      }
      if(front.size!==Object.keys(APPEARANCE_OPTIONS[key]).length)checks.push(`${key}: front options visually collapse`);
      if(side.size!==Object.keys(APPEARANCE_OPTIONS[key]).length)checks.push(`${key}: side options visually collapse`);
    }
    const a={...DEFAULT_APPEARANCE,hair:"short",skinColor:"deep",earStyle:"long",eyeColor:"blue",eyeShape:"round",eyebrowStyle:"raised"};
    for(const dir of [0,1,2,3]){
      let expected:string|undefined;
      for(const offset of [0,1,2,3,16,17,18,19]){
        const index=dir*4+offset,[x,y]=CHARACTER_MASKS[index].head;
        // The visible eye/skin region follows its explicit head anchor exactly.
        const data=JSON.stringify(pixels(paint(a,index),x-6,y+13,13,7));
        if(expected!==undefined&&data!==expected)checks.push(`face flicker ${index}`);expected=data;
      }
    }
    const headSilhouette=(a:any,dir:number)=>{
      const c=document.createElement("canvas");c.width=48;c.height=72;
      const h=parts.headLayers(a,["down","up","left","right"][dir/4]);
      c.getContext("2d")!.drawImage(h.back,0,0);c.getContext("2d")!.drawImage(h.front,0,0);return c;
    };
    for(const dir of [0,4,8,12]){
      for(const [one,two] of [["bob","long"],["ponytail","bun"]])if(silhouetteDiff(headSilhouette({...a,hair:one},dir),headSilhouette({...a,hair:two},dir))<15)checks.push(`${one}/${two}: silhouette ${dir}`);
      if(silhouetteDiff(paint({...a,earStyle:"normal"},dir),paint({...a,earStyle:"long"},dir))<10)checks.push(`ear silhouette ${dir}`);
    }
    const skinOnly=paint({...a,skinColor:"porcelain"},0),dark=paint(a,0);
    // Clothes and boots outside the face/hand/ear regions cannot be recolored by skin.
    if(JSON.stringify(pixels(skinOnly,19,58,10,6))!==JSON.stringify(pixels(dark,19,58,10,6)))checks.push("skin changed trousers");
    const shared=parts.headLayers(a,"down");if(shared!==parts.headLayers({...a,top:"blue",height:145},"down"))checks.push("garment/height recreated head");
    const texture=art.appearanceTexture(scene,"player",a),count=scene.textures.getTextureKeys().length;
    for(let i=0;i<200;i++)if(art.appearanceTexture(scene,"player",{...a,height:i%2?70:145})!==texture)checks.push("height allocated texture");
    if(scene.textures.getTextureKeys().length!==count)checks.push("cache hit allocated textures");
    const pinned=scene.add.image(0,0,texture).setVisible(false);
    const expired=art.appearanceTexture(scene,"player",{...a,hair:"wave"});
    art.pruneAppearanceTextures(scene,performance.now()+40000);
    if(!scene.textures.exists(texture)||scene.textures.exists(expired))checks.push("texture retirement removed a live reference or leaked an inactive bank");pinned.destroy();
    document.body.append(sheet);return checks;
  });
  await page.locator("#face-parts-sheet").screenshot({path:info.outputPath("face-parts-all-directions.png")});
  expect(result).toEqual([]);
});

test("accordion toggles, full-body preview and fixed height ruler at both extremes",async({page},info)=>{
  await page.goto("/");await page.locator("#new-appearance").click();
  await expect(page.getByLabel("미리보기 동작")).toHaveValue("idle");
  await expect(page.locator("#character-face-preview")).toHaveCount(0);
  await expect(page.locator(".character-face-detail")).toHaveCount(0);
  const hair=page.locator('.character-group[data-group="hair"]');
  await expect(hair.locator("select").first()).toBeHidden();
  await hair.locator("summary").click();await expect(hair.locator("select").first()).toBeVisible();
  await choose(page,"헤어스타일","ponytail");
  await hair.locator("summary").click();await expect(hair.locator("select").first()).toBeHidden();
  await expect(hair.locator("summary")).toContainText("포니테일");
  const sample=()=>page.locator("#character-preview").evaluate((n:HTMLCanvasElement)=>{
    const c=n.getContext("2d")!,data=c.getImageData(0,0,n.width,n.height).data;
    let top=280;for(let y=0;y<245;y++)for(let x=55;x<148;x++){
      const i=(y*240+x)*4;if(data[i+3]!>240&&data[i]!<140&&data[i+1]!<115&&data[i+2]!<110)top=Math.min(top,y);
    }
    return {top,post:Array.from(c.getImageData(193,20,23,245).data)};
  });
  await page.getByLabel("키",{exact:true}).fill("70");await expect(page.locator(".character-height output")).toHaveText("70%");
  await page.waitForTimeout(60);const small=await sample();await page.screenshot({path:info.outputPath("height-70.png")});
  await page.getByLabel("키",{exact:true}).fill("145");await page.waitForTimeout(60);const tall=await sample();
  expect(small.top-tall.top).toBeGreaterThan(90);expect(tall.post).toEqual(small.post);
  await expect(page.locator("#character-face-preview")).toHaveCount(0);await page.screenshot({path:info.outputPath("height-145.png")});
  await page.getByLabel("미리보기 동작").selectOption("run");await page.getByRole("button",{name:"취소",exact:true}).click();
  await page.locator("#new-appearance").click();await expect(page.getByLabel("미리보기 동작")).toHaveValue("idle");
});


test("female preset preserves deliberate choices and has a compact mobile overview",async({page},info)=>{
  await page.goto("/");await page.locator("#new-appearance").click();
  await choose(page,"성별","female");
  await expect(page.getByLabel("헤어스타일",{exact:true})).toHaveValue("bun");
  await expect(page.getByLabel("상의",{exact:true})).toHaveValue("terracotta");
  await page.screenshot({path:info.outputPath("v282-female-mobile.png")});
  await choose(page,"눈 모양","soft");await choose(page,"헤어 색상","rose");
  await choose(page,"성별","male");
  await expect(page.getByLabel("눈 모양",{exact:true})).toHaveValue("soft");
  await expect(page.getByLabel("헤어 색상",{exact:true})).toHaveValue("rose");
  await choose(page,"성별","female");await page.getByRole("button",{name:"기본 외형 복원",exact:true}).click();
  await expect(page.getByLabel("성별",{exact:true})).toHaveValue("female");
  await expect(page.getByLabel("헤어 색상",{exact:true})).toHaveValue("original");
  expect(await page.locator("#panel-body").evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});
