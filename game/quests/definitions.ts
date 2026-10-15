import type { ItemId } from "../data/items";
export type QuestStatus="locked"|"available"|"active"|"completed"|"rewarded";
export interface QuestDefinition {id:string;name:string;giver:string;description:string;requires:string[];objective:{kind:"greet";npcIds:string[]}|{kind:"deliver";itemId:ItemId;amount:number};reward:{money:number;items:Partial<Record<ItemId,number>>;friendship:number}}
export const QUEST_DEFINITIONS:readonly QuestDefinition[]=[
 {id:"village_hello",name:"우리 마을에 인사해요",giver:"boram",description:"의뢰를 받은 뒤 다온, 보람, 솔이에게 인사하고 보람에게 돌아오세요.",requires:[],objective:{kind:"greet",npcIds:["daon","boram","soli"]},reward:{money:20,items:{morningcarrot_seed:2},friendship:10}},
 {id:"first_basket",name:"새봄 상점의 첫 수확",giver:"daon",description:"새싹열매 1개를 다온에게 전달하세요. 전달한 작물은 인벤토리에서 빠집니다.",requires:["village_hello"],objective:{kind:"deliver",itemId:"sproutberry",amount:1},reward:{money:40,items:{sunpotato_seed:2},friendship:15}},
 {id:"pond_picnic",name:"솔이의 연못 소풍",giver:"soli",description:"아침당근 1개를 솔이에게 전달하세요. 전달한 작물은 인벤토리에서 빠집니다.",requires:["village_hello"],objective:{kind:"deliver",itemId:"morningcarrot",amount:1},reward:{money:60,items:{heartberry_seed:2},friendship:20}}
];
export const getQuest=(id:string)=>QUEST_DEFINITIONS.find(q=>q.id===id);
