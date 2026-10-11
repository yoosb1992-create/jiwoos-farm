import { test,expect } from "@playwright/test";

// Deterministic contact sheets use the real Phaser renderer and shipped art.
// Rules/receipts are covered by authority tests; this isolates animation phases
// so a screenshot cannot accidentally capture the idle pose between actions.
test("tool choreography: four directions, connected hands and six continuous phases",async({page},info)=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:2420});
  await page.goto("/");await page.locator("#nickname").fill("동작 검증");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:20000});
  await page.waitForFunction(()=>(window.__FARM_DEBUG__ as any).scene().textures.exists("farmer-down-head"));
  await page.evaluate(()=>{
    const s=(window.__FARM_DEBUG__ as any).scene();s.scene.pause();
    s.children.list.forEach((o:any)=>o.setVisible?.(false));s.feedback.clear();
    s.cameras.main.stopFollow().removeBounds().setOrigin(0,0).setScroll(0,0).setZoom(2);
    for(const e of document.querySelectorAll<HTMLElement>("body > :not(#arena):not(script)"))e.style.visibility="hidden";
    document.querySelector<HTMLElement>("#arena")!.style.visibility="visible";
    s.cameras.main.setBackgroundColor("#9eae82");
  });
  for(const facing of ["right","down","left","up"]) {
    const result=await page.evaluate(async facing=>{
      const rigModule="/client/tool-animation.ts",timingModule="/shared/interaction.ts";
      const {ToolAnimationRig,TOOL_ANCHORS}=await import(rigModule),{actionTiming,toolMotion}=await import(timingModule);
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
            if(last && Math.hypot(rig.hands[0].x-last.x,rig.hands[0].y-last.y)>16)errors.push(`${row}/${col} wrist discontinuity`);
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
            if(col===3 && !["watering","refill"].includes(toolMotion(e)) && Math.hypot(tip.x-rig.contact.x,tip.y-rig.contact.y)>.001)errors.push(`${row} missed surface`);
          }
        }
      });
      (window as any).__qaRigs=rigs;(window as any).__qaLabels=texts;return errors;
    },facing);
    expect(result).toEqual([]);
    await page.waitForTimeout(80);
    await page.screenshot({path:info.outputPath(`tool-phases-${facing}.png`)});
  }
});
