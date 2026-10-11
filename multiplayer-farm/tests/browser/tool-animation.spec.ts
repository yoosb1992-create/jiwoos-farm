import { test,expect } from "@playwright/test";

// Deterministic contact sheets use the real Phaser renderer and shipped art.
// Rules/receipts are covered by authority tests; this isolates animation phases
// so a screenshot cannot accidentally capture the idle pose between actions.
test("original farmer choreography: four directions, unchanged source pixels and attached tools",async({page},info)=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:2420});
  await page.goto("/");await page.locator("#nickname").fill("동작 검증");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:20000});
  await page.waitForFunction(()=>(window.__FARM_DEBUG__ as any).scene().textures.exists("farmer-action-down-idle"));
  await page.evaluate(()=>{
    const s=(window.__FARM_DEBUG__ as any).scene();s.scene.pause();
    s.children.list.forEach((o:any)=>o.setVisible?.(false));s.feedback.clear();
    s.cameras.main.stopFollow().removeBounds().setOrigin(0,0).setScroll(0,0).setZoom(2);
    for(const e of document.querySelectorAll<HTMLElement>("body > :not(#arena):not(script)"))e.style.visibility="hidden";
    document.querySelector<HTMLElement>("#arena")!.style.visibility="visible";
    s.cameras.main.setBackgroundColor("#9eae82");
  });
  const failures:string[]=[];
  for(const facing of ["right","down","left","up"]) {
    const result=await page.evaluate(async facing=>{
      const rigModule="/client/tool-animation.ts",timingModule="/shared/interaction.ts";
      const {ToolAnimationRig,TOOL_ANCHORS}=await import(rigModule),{actionTiming,toolMotion}=await import(timingModule);
      const artModule="/client/tool-animation-art.ts",{FARMER_FRAMES,farmerKey}=await import(artModule);
      const s=(window.__FARM_DEBUG__ as any).scene();
      const old=(window as any).__qaRigs??[];old.forEach((r:any)=>r.destroy());
      const labels=(window as any).__qaLabels??[];labels.forEach((l:any)=>l.destroy());
      const rigs:any[]=[],texts:any[]=[],errors:string[]=[];
      const cases=[
        {tool:"axe",kind:"tree",asset:"tree_oak",action:"hitTree"},
        {tool:"axe",kind:"twig",asset:"farm_twig_a",action:"clearTwig"},
        {tool:"pickaxe",kind:"rock",asset:"mine_copper",action:"hitRock"},
        {tool:"scythe",kind:"gather",asset:"farm_tall_grass",action:"cutGrass"},
        {tool:"water",kind:"crop",asset:"crop_sproutberry_sprout",action:"waterCrop"},
        {tool:"hoe",kind:"soil",asset:"tile_farm_empty",action:"tillTile"},
        {tool:"hand",kind:"gather",asset:"farm_white_wildflower",action:"gather"},
        {tool:"pickaxe",kind:"rock",asset:"farm_stone_a",action:"hitRock"},
        {tool:"scythe",kind:"gather",asset:"farm_pink_wildflower",action:"cutGrass"},
        {tool:"axe",kind:"gather",asset:"farm_pink_wildflower",action:"destroyFlower"},
        {tool:"pickaxe",kind:"gather",asset:"farm_pink_wildflower",action:"destroyFlower"},
      ];
      const dir={x:facing==="left"?-1:facing==="right"?1:0,y:facing==="up"?-1:facing==="down"?1:0};
      cases.forEach((c,row)=>{
        const stages=["ready","lift","windup","contact","follow","recover"];
        for(let col=0;col<6;col++) {
          const x=70+col*112,y=140+row*100;
          const e={...c,id:`qa-${row}-${col}`,actorId:"qa",area:"farm",x,y,facing,outcome:"hit",drops:[],
            target:{id:"target",kind:c.kind,asset:c.asset,x:x+dir.x*42,y:y+dir.y*42,stage:2,species:"tree_oak",item:c.kind==="gather"?"wildflower_white":"",quantity:1},
            point:{x:x+dir.x*42,y:y+dir.y*42}};
          const t=actionTiming(e),ms=[0,t.windup*.45,t.windup,t.impact,t.follow,t.duration-80][col];
          const rig=new ToolAnimationRig(s);rig.start(e);
          let last:{x:number;y:number}|undefined;
          for(let frame=0;frame<ms;frame+=16) {
            rig.update(frame,x,y);
            const pose=rig.currentPose,frameInfo=FARMER_FRAMES[facing][pose];
            const palm=rig.body.getWorldTransformMatrix().transformPoint(frameInfo.hand[0]-rig.body.displayOriginX,frameInfo.hand[1]-rig.body.displayOriginY);
            if(Math.hypot(rig.hands[0].x-palm.x,rig.hands[0].y-palm.y)>.001)errors.push(`${row}/${col} detached from original palm`);
            last={...rig.hands[0]};
          }
          rig.update(ms,x,y);rigs.push(rig);
          // At t=0 the normal actor remains underneath the rig's fade-in.
          if(col===0){const image=s.add.image(x,y,"player",["down","up","left","right"].indexOf(facing)*4).setOrigin(.5,70/72).setScale(1.05);texts.push(image);}
          texts.push(s.add.text(x-43,y-64,`${c.tool}/${c.kind}\n${stages[col]} ${Math.round(ms)}ms`,{fontSize:"9px",color:"#263521"}).setDepth(30000));
          if(c.tool!=="hand") {
            const anchor=TOOL_ANCHORS[c.tool],matrix=rig.tool.getWorldTransformMatrix();
            const actual=matrix.transformPoint(anchor.second.x-rig.tool.displayOriginX,anchor.second.y-rig.tool.displayOriginY);
            if(Math.hypot(actual.x-rig.hands[1].x,actual.y-rig.hands[1].y)>.001)errors.push(`${row}/${col} second grip`);
            const tip=matrix.transformPoint(anchor.tip.x-rig.tool.displayOriginX,anchor.tip.y-rig.tool.displayOriginY);
            if(Math.hypot(tip.x-rig.nozzle.x,tip.y-rig.nozzle.y)>.001)errors.push(`${row}/${col} nozzle/head`);
            if(col===3 && !["watering","refill"].includes(toolMotion(e)) && Math.hypot(tip.x-rig.contact.x,tip.y-rig.contact.y)>4)errors.push(`${facing}/${row} missed surface ${Math.hypot(tip.x-rig.contact.x,tip.y-rig.contact.y).toFixed(2)}px`);
          }
        }
      });
      // Every visible action pixel must have the exact RGB of its source frame.
      for(const pose of ["idle","raised","strike","bow","carry"]) {
        const def=FARMER_FRAMES[facing][pose],canvas=document.createElement("canvas");canvas.width=48;canvas.height=72;
        const c=canvas.getContext("2d")!;c.drawImage(s.textures.get("player").getSourceImage(),def.column*48,def.row*72,48,72,0,0,48,72);
        const original=c.getImageData(0,0,48,72).data,actual=s.textures.get(farmerKey(facing,pose)).context.getImageData(0,0,48,72).data;
        for(let i=0;i<actual.length;i+=4)if(actual[i+3]===255 && (actual[i]!==original[i]||actual[i+1]!==original[i+1]||actual[i+2]!==original[i+2])){errors.push(`${pose} recolored source pixel`);break;}
      }
      (window as any).__qaRigs=rigs;(window as any).__qaLabels=texts;return errors;
    },facing);
    failures.push(...result);
    await page.waitForTimeout(80);
    await page.screenshot({path:info.outputPath(`tool-phases-${facing}.png`)});
  }
  await page.evaluate(async()=>{
    (window as any).__qaRigs.forEach((r:any)=>r.destroy());(window as any).__qaLabels.forEach((r:any)=>r.destroy());
    const mod="/shared/nature.ts",{TREE_SPECIES,stumpSprite,STUMP_SIZES}=await import(mod);
    const s=(window.__FARM_DEBUG__ as any).scene();
    TREE_SPECIES.forEach((species:any,row:number)=>{
      const y=160+row*130;
      s.add.text(20,y-90,species.id,{fontSize:"12px",color:"#263521"});
      for(let col=0;col<3;col++){
        const x=120+col*190,key=stumpSprite(species.id,col+2),size=STUMP_SIZES[col];
        s.add.image(x,y,key).setOrigin(.5,.92).setDisplaySize(size[0],size[1]);
        s.add.image(x+58,y,"player",0).setOrigin(.5,70/72).setScale(1.05);
        s.add.text(x-40,y+15,["mature","giant","guardian"][col],{fontSize:"10px",color:"#263521"});
      }
    });
  });
  await page.waitForTimeout(60);await page.screenshot({path:info.outputPath("stumps-eight-species-three-ages.png")});
  expect(failures).toEqual([]);
});
