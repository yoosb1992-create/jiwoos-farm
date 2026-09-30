import type { NpcDefinition } from "./types";
import type { MapRegistry } from "../maps/MapRegistry";
import { npcCellSafe } from "./navigation";
const asset = (id:string) => ({assetId:`npc_${id}`,textureKey:`npc-${id}`,source:{kind:"spritesheet" as const,path:`/assets/npc/${id}.png`,frameWidth:32,frameHeight:36},frameSize:{width:32,height:36},displayScale:{x:1,y:1},origin:{x:.5,y:.5},groundAnchor:{x:.5,y:31/36}});
const step = (minute:number,mapId:string,x:number,y:number,tx:number,ty:number,activity:string): NpcDefinition["schedule"][number] => ({minute,mapId,from:{x,y},to:{x:tx,y:ty},facing:"down",activity});
export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
 {id:"daon",name:"다온",displayName:"다온 · 상점 주인",personality:"꼼꼼하고 다정한 씨앗 수집가",asset:asset("daon"),fallbackColor:0xb46c42,speed:42,
 schedule:[step(360,"town",18,12,20,12,"가게 열 준비"),step(480,"general_store",4,8,4,6,"씨앗 정리"),step(780,"general_store",4,6,13,7,"진열 살피기"),step(1080,"town",20,12,14,12,"저녁 산책")],
 dialogue:{first:["처음 뵙네요! 새봄 상점의 다온이에요.","씨앗은 작지만 그 안에는 계절 하나가 들어 있지요."],general:[["씨앗 봉투를 종류별로 정리하면 마음도 차분해져요."],["급하게 키우지 않아도 괜찮아요. 하루에 물 한 번이면 충분하니까요."],["오늘도 새봄 상점을 찾아줘서 고마워요."]],morning:[["아침엔 씨앗 봉투가 햇빛을 받아 반짝여요."]],afternoon:[["점심 먹고 진열대를 한 바퀴 둘러보는 중이에요."]],evening:[["오늘 장사는 여기까지. 저녁 바람을 만나러 가요."]],progress:[{minDay:4,lines:["벌써 며칠을 함께 보냈네요. 농장은 잘 자라고 있나요?"]}],relationship:[{minPoints:80,lines:["네가 골라 준 씨앗이라면 안심하고 권할 수 있겠어요."]}]},
 giftPreferences:{loved:["heartberry","fairy_bloom"],neutral:["sproutberry","morningcarrot"],disliked:["stone"]}},
 {id:"boram",name:"보람",displayName:"보람 · 농사 이웃",personality:"느긋하고 실용적인 흙의 관찰자",asset:asset("boram"),fallbackColor:0x75934a,speed:36,
 schedule:[step(360,"farm",7,12,7,16,"밭 둘러보기"),step(660,"road",7,7,10,7,"들꽃길 산책"),step(900,"town",10,12,13,12,"이웃 만나기"),step(1140,"farm",7,16,7,12,"저녁 흙 살피기")],
 dialogue:{first:["나는 보람이야. 근처에서 흙을 돌보며 지내지.","밭이 막막하면 우선 작은 한 칸부터 시작해 봐."],general:[["흙 냄새가 매일 조금씩 달라. 오늘은 포근하네."],["물은 많이보다 꾸준히가 중요해."],["함께 농사지으면 힘든 날도 웃을 일이 생기지."]],morning:[["이슬이 마르기 전에 밭을 한 바퀴 돌고 있어."]],afternoon:[["한낮에는 잠깐 그늘에서 쉬어도 돼."]],evening:[["오늘 돌본 밭은 내일 꼭 대답해 줄 거야."]],progress:[{minDay:3,lines:["며칠째 꾸준히 나오는구나. 벌써 농부의 눈빛인데?"]}],relationship:[{minPoints:80,lines:["이젠 말하지 않아도 네가 흙을 아끼는 게 보여."]}]},
 giftPreferences:{loved:["morningcarrot","wild_herb"],neutral:["wood","stone_block"],disliked:["moon_mushroom"]}},
 {id:"soli",name:"솔이",displayName:"솔이 · 자연 친구",personality:"호기심 많고 다정한 어린 자연 관찰자",asset:asset("soli"),fallbackColor:0x789cab,speed:48,
 schedule:[step(360,"town",10,13,12,13,"새소리 듣기"),step(600,"road",7,4,7,9,"들꽃 관찰"),step(840,"farm",21,13,22,18,"연못 구경"),step(1080,"town",12,13,10,13,"관찰 일기 쓰기")],
 dialogue:{first:["안녕! 나는 솔이야. 오늘 본 새를 그림으로 남기고 있어.","농장에 새로운 꽃이 피면 나한테도 알려 줘!"],general:[["나뭇잎이 바람에 흔들리는 건 인사하는 것 같아."],["작은 씨앗도 자기만의 지도를 갖고 있을까?"],["오늘은 들꽃 색을 세 가지나 찾았어!"]],morning:[["일찍 일어나니까 새들이 먼저 인사했어!"]],afternoon:[["햇빛 아래 연못이 반짝반짝해."]],evening:[["오늘 본 것들을 일기에 그려야지. 내일 또 만나!"]],progress:[{minDay:5,lines:["우리 인사한 날이 제법 많아졌네. 내 그림에도 네 농장이 있어!"]}]},
 giftPreferences:{loved:["fairy_bloom","fish_minnow"],neutral:["wild_herb","egg"],disliked:["stone_block"]}}
];
export const getNpc = (id:string) => NPC_DEFINITIONS.find(n=>n.id===id);
export function validateNpcs(npcs:readonly NpcDefinition[], maps:MapRegistry): string[] {
  const errors:string[]=[], ids=new Set<string>();
  for(const n of npcs) {
    if(!n.id || ids.has(n.id)) errors.push(`duplicate/empty NPC: ${n.id}`); ids.add(n.id);
    if(!Number.isFinite(n.speed)||n.speed<=0||!n.schedule.length) errors.push(`invalid speed/schedule: ${n.id}`);
    if(n.asset.frameSize.width!==32||n.asset.frameSize.height!==36||!n.asset.assetId||!n.asset.textureKey)errors.push(`invalid sprite: ${n.id}`);
    if([n.dialogue.first,...n.dialogue.general,...n.dialogue.morning,...n.dialogue.afternoon,...n.dialogue.evening,...n.dialogue.progress.map(p=>p.lines),...(n.dialogue.relationship??[]).map(p=>p.lines)].some(lines=>!lines.length||lines.some(line=>!line.trim())))errors.push(`empty dialogue: ${n.id}`);
    const gifts=[...n.giftPreferences.loved,...n.giftPreferences.neutral,...n.giftPreferences.disliked];
    if(new Set(gifts).size!==gifts.length)errors.push(`duplicate gift preference: ${n.id}`);
    if(!n.displayName||!n.dialogue.first.length||!n.dialogue.general.length) errors.push(`missing dialogue/name: ${n.id}`);
    for(let i=0;i<n.schedule.length;i++) {
      const s=n.schedule[i],map=maps.get(s.mapId);
      if(!Number.isFinite(s.minute)||s.minute<0||s.minute>1440||(i>0&&s.minute<n.schedule[i-1].minute)) errors.push(`schedule order: ${n.id}`);
      if(!["up","down","left","right"].includes(s.facing)||s.days?.some(day=>!Number.isInteger(day)||day<1||day>28))errors.push(`invalid day/facing: ${n.id}`);
      if(!map||!npcCellSafe(map,s.from)||!npcCellSafe(map,s.to)) errors.push(`unsafe schedule: ${n.id}/${s.minute}`);
    }
  }
  return errors;
}
