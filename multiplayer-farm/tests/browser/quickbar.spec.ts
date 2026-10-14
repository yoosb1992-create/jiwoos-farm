import {test,expect,type Page} from "@playwright/test";
import {waitForFarmInput} from "./nature-target.js";

const slot=(page:Page,n:number)=>page.locator(`#quickslots [data-slot-id="${n}"]`);
test("selected owned tool survives a reconnect with delayed personal inventory",async({page})=>{
  test.setTimeout(60000);
  let delayPersonal=false;
  await page.routeWebSocket("ws://127.0.0.1:2575/**",ws=>{
    const server=ws.connectToServer();
    server.onMessage(message=>{
      if(delayPersonal && Buffer.from(message).includes(Buffer.from("personal")))
        setTimeout(()=>ws.send(message),1200);
      else ws.send(message);
    });
  });
  await page.addInitScript(()=>{
    const sockets:WebSocket[]=[],Native=window.WebSocket;
    window.WebSocket=class extends Native {
      constructor(...args:ConstructorParameters<typeof WebSocket>){
        // Preserve the native rejection of the SDK's Node-only headers probe;
        // Playwright's routed socket otherwise accepts it then fails remotely.
        if(args[1] && typeof args[1]==="object" && !Array.isArray(args[1]))throw new TypeError("Browser protocols required");
        super(...args);sockets.push(this);
      }
    };
    Object.assign(window,{dropQuickbarConnection:()=>sockets.filter(s=>s.url.includes(":2575/")).forEach(s=>s.close(4010,"temporary network loss"))});
  });
  await page.goto("/");await page.locator("#nickname").fill("재접속 도구");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:25000});
  await waitForFarmInput(page);await page.locator("#tool").selectOption("axe");
  delayPersonal=true;
  await page.evaluate(()=>(window as unknown as {dropQuickbarConnection():void}).dropQuickbarConnection());
  // A missing personal packet is not evidence that the owned axe was removed.
  await expect(page.locator("#tool")).toBeDisabled({timeout:15000});
  await expect(page.locator("#action")).toBeDisabled();
  await expect(slot(page,4)).toHaveAttribute("data-tool","");
  await expect(page.locator("#tool")).toBeEnabled({timeout:15000});
  await expect(page.locator("#tool")).toHaveValue("axe");
  await expect(slot(page,4)).toHaveAttribute("data-tool","axe");
});

test("mobile quickbar registration, favorites, persistence, silhouettes and connected soil",async({page},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await page.locator("#nickname").fill("슬롯 농부");await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:25000});
  await waitForFarmInput(page);
  await expect(page.locator("#quickslots button")).toHaveCount(8);
  for(const viewport of [{width:390,height:844},{width:320,height:640},{width:844,height:390},{width:768,height:1024}]) {
    await page.setViewportSize(viewport);
    const rects=await page.locator("#quickslots button").evaluateAll(es=>es.map(e=>({id:e.getAttribute("data-slot-id")??"star",x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
    const get=(id:string)=>rects.find(r=>r.id===id)!;
    expect(get("1").y).toBeGreaterThan(get("4").y);expect(get("1").x).toBe(get("4").x);
    expect([get("1").x,get("2").x,get("3").x,get("star").x]).toEqual([get("4").x,get("5").x,get("6").x,get("7").x]);
    for(const r of rects){expect(r.w).toBeGreaterThanOrEqual(44);expect(r.h).toBeGreaterThanOrEqual(44);expect(r.x+r.w).toBeLessThanOrEqual(viewport.width);expect(r.y+r.h).toBeLessThanOrEqual(viewport.height);}
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator("#bag").click();
  await page.getByRole("navigation",{name:"가방 카테고리"}).getByRole("button",{name:"도구",exact:true}).click();
  const axe=page.locator(".life-card").filter({has:page.getByRole("heading",{name:"도끼 ×1",exact:true})});
  await axe.getByRole("button",{name:"4번 등록 제거"}).click();
  await expect(axe).toContainText("등록된 슬롯: 없음");await page.locator("#panel-close").click();
  await expect(slot(page,4)).toHaveAttribute("data-tool","");await slot(page,4).click();
  await page.locator(".quick-item-grid button").filter({hasText:/^낫$/}).click();
  await expect(slot(page,4)).toHaveAttribute("data-tool","scythe");
  await page.locator("#bag").click();await axe.getByRole("button",{name:"단축슬롯 등록"}).click();
  await page.locator(".slot-assignment-grid button").filter({hasText:/^2번/}).click();
  await expect(slot(page,2)).toHaveAttribute("data-tool","axe");
  await axe.getByRole("button",{name:"☆ 즐겨찾기 등록",exact:true}).click();
  await expect(axe.getByRole("button",{name:"★ 즐겨찾기 제거",exact:true})).toBeVisible();
  const scythe=page.locator(".life-card").filter({has:page.getByRole("heading",{name:"낫 ×1",exact:true})});
  await scythe.getByRole("button",{name:"☆ 즐겨찾기 등록",exact:true}).click();
  await expect(scythe.getByRole("button",{name:"★ 즐겨찾기 제거",exact:true})).toBeVisible();
  await page.locator("#panel-close").click();await page.locator("#favorite-toggle").click();
  await expect(page.locator("#favorite-popup")).toBeVisible();
  await page.getByRole("button",{name:"도끼 선택",exact:true}).click();
  await expect(page.locator("#favorite-popup")).toBeHidden();await expect(page.locator("#tool")).toHaveValue("axe");
  await page.locator("#menu").click();await page.getByRole("button",{name:"⚙ 소리·화면 설정"}).click();
  await page.getByRole("button",{name:"세로형",exact:true}).click();await page.locator("#panel-close").click();
  // Settings and the already-mounted layout editor must show the same choice.
  await page.locator("#menu").click();await page.getByRole("button",{name:"조작 배치 편집",exact:true}).click();
  await expect(page.locator("#control-editor").getByRole("button",{name:"세로형",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.locator("#controls-cancel").click();
  await page.locator("#favorite-toggle").click();await expect(page.locator("#favorite-popup")).toHaveAttribute("data-mode","vertical");
  const overlap=await page.evaluate(()=>{
    const popup=document.getElementById("favorite-popup")!.getBoundingClientRect();
    return ["toolbar","top","action","run","joystick","furniture-action"].some(id=>{
      const e=document.getElementById(id)!;if(e.hidden)return false;const r=e.getBoundingClientRect();
      return popup.left<r.right&&popup.right>r.left&&popup.top<r.bottom&&popup.bottom>r.top;
    });
  });expect(overlap).toBe(false);
  for(const mode of ["vertical","expanded"])for(const viewport of [{width:344,height:882},{width:768,height:1024},{width:844,height:390},{width:1280,height:900}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(mode=>{localStorage.setItem("farm-favorite-mode",mode);window.dispatchEvent(new Event("favorite-mode-change"));window.dispatchEvent(new Event("favorite-visibility"));},mode);
    await expect.poll(()=>page.evaluate(()=>{
      const popup=document.getElementById("favorite-popup")!.getBoundingClientRect(),tray=document.getElementById("toolbar")!.getBoundingClientRect(),star=document.getElementById("favorite-toggle")!.getBoundingClientRect();
      const clear=["top","toolbar","action","run","joystick","furniture-action"].every(id=>{
        const e=document.getElementById(id)!;if(e.hidden)return true;const r=e.getBoundingClientRect();
        return !(popup.left<r.right&&popup.right>r.left&&popup.top<r.bottom&&popup.bottom>r.top);
      });
      return clear&&popup.top>=0&&popup.left>=0&&popup.right<=innerWidth&&popup.bottom<=innerHeight&&Math.abs(tray.top-popup.bottom-8)<2&&Math.abs(popup.right-star.right)<2;
    })).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{localStorage.setItem("farm-favorite-mode","vertical");window.dispatchEvent(new Event("favorite-mode-change"));window.dispatchEvent(new Event("favorite-visibility"));});
  await page.screenshot({path:info.outputPath("mobile-slots-favorites.png")});
  await page.reload();await expect(page.locator("#login")).toBeVisible();await page.locator("#resume").click();await expect(page.locator("#connection")).toHaveAttribute("data-status","connected",{timeout:25000});
  await expect(slot(page,2)).toHaveAttribute("data-tool","axe");await expect(slot(page,4)).toHaveAttribute("data-tool","scythe");
  await page.locator("#favorite-toggle").click();await expect(page.locator("#favorite-popup")).toHaveAttribute("data-mode","vertical");
  await expect(page.getByRole("button",{name:"도끼 선택",exact:true})).toHaveClass(/selected/);
  await page.getByRole("button",{name:"닫기",exact:true}).filter({visible:true}).click();
  const iconCheck=await page.evaluate(async()=>{
    const {toolIconSource}=await import("/client/item-icons.ts" as string);
    const results=[];
    for(const id of ["axe","pickaxe","hoe","scythe"]) {
      const image=new Image();image.src=toolIconSource(id);await image.decode();
      const canvas=document.createElement("canvas");canvas.width=canvas.height=32;const c=canvas.getContext("2d")!;c.drawImage(image,0,0);
      const data=c.getImageData(0,0,32,32).data;
      results.push({src:image.src,transparent:data[3]===0&&data[127]===0,painted:data.some((v,i)=>i%4===3&&v>0)});
    }
    return results;
  });expect(new Set(iconCheck.map(i=>i.src)).size).toBe(4);expect(iconCheck.every(i=>i.transparent&&i.painted)).toBe(true);
  // One paused scene checks the real crop underlay and wet/dry tint together.
  // Capture published data atomically; calling onFrame here advances networking
  // and can observe an empty state during a software-renderer backlog reconnect.
  const published=await page.waitForFunction(()=>{
    const debug=window.__FARM_DEBUG__,snapshot=debug.snapshot(),state=debug.state();
    return state&&snapshot.status==="connected"&&snapshot.players.some(p=>p.local)?{snapshot,state}:false;
  });
  const ground=await page.evaluate(frame=>{
    if(!frame||typeof frame!=="object")throw Error("Missing connected renderer fixture");
    const scene=(window.__FARM_DEBUG__ as any).scene();
    const me=frame.snapshot.players.find(p=>p.local)!;scene.scene.pause();
    const entities=new Map();
    for(let i=0;i<3;i++)entities.set(`qa-${i}`,{id:`qa-${i}`,area:me.area,kind:i===1?"crop":i===2?"withered":"soil",asset:"tile_farm_empty",crop:"sproutberry",stage:0,watered:i===1,x:me.x+i*32,y:me.y+64,hp:0,item:"",quantity:0});
    scene.onFrame=()=>({snapshot:frame.snapshot,state:{...frame.state,entities}});scene.update(1000,16);
    return [...entities.keys()].map(id=>{const v=scene.objects.get(id),g=v.ground??v.body;return {texture:g.texture.key,tint:g.tintTopLeft};});
  },await published.jsonValue());expect(ground.map(g=>g.texture)).toEqual(["connected-soil-2","connected-soil-10","connected-soil-8"]);expect(ground[0]!.tint).not.toBe(ground[1]!.tint);
  // 24px contact sheet uses the exact in-game sources, plus a magnified view.
  await page.evaluate(async()=>{
    const {toolIconSource}=await import("/client/item-icons.ts" as string),{paintTilledGround}=await import("/client/tilled-ground.ts" as string);
    const sheet=document.createElement("div");sheet.id="qa-contact";Object.assign(sheet.style,{position:"fixed",inset:"0",zIndex:"99999",background:"#f5ecd6",display:"flex",gap:"22px",flexWrap:"wrap",alignContent:"start",padding:"20px"});
    for(const id of ["axe","pickaxe","hoe","scythe"]) {
      const column=document.createElement("div");column.style.cssText="display:flex;flex-direction:column;align-items:center;gap:12px";column.append(id);
      for(const size of [24,96]){const img=new Image();img.src=toolIconSource(id);img.style.cssText=`width:${size}px;height:${size}px;image-rendering:pixelated`;column.append(img);}sheet.append(column);
    }
    const soil=document.createElement("canvas");soil.width=128;soil.height=96;soil.style.cssText="width:256px;height:192px;image-rendering:pixelated";const c=soil.getContext("2d")!;
    const cells=[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[2,2],[3,2]];
    for(const [x,y] of cells){let mask=0;for(const [dx,dy,bit] of [[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]])if(cells.some(p=>p[0]===x!+dx!&&p[1]===y!+dy!))mask|=bit!;c.save();c.translate(x!*32,y!*32);paintTilledGround(c,mask);c.restore();}
    sheet.append(soil);document.body.append(sheet);
  });
  await page.screenshot({path:info.outputPath("icons-and-connected-soil.png")});
  expect(errors).toEqual([]);
});
