export type ToolKey = "hoe" | "seed" | "water" | "hand" | "axe";
export interface HudState {
  villageOpen?:boolean;
  villagers?:{id:string;name:string;points:number;level:string;location:string;activity:string}[];
  quests?: import("./quests/engine").QuestView[];
  npcBusy?:boolean;
  dialogue?: import("./npc/dialogue").DialogueView;
  selectedCrop?: import("./data/crops").CropId;
  seedCounts?: Record<string, number>;
  money: number;
  seeds: number;
  harvest: number;
  resources?: { wood: number; stone: number; wild_herb: number };
  selectedTool: ToolKey;
  objective: string;
  message: string;
  progress: number;
  day: number;
  timeText: string;
  sleepPrompt: boolean;
  transitioning: boolean;
  shopOpen: boolean;
  mapId?: string;
  mapName: string;
}
export const initialHud: HudState = {
  money: GAME_CONFIG.startingMoney, seeds: GAME_CONFIG.startingSeedCount, harvest: 0, selectedTool: "hoe",
  objective: "첫 밭을 갈아 보세요", message: "갈색 밭 가까이에서 괭이를 사용하세요.", progress: 0,
  day: 1, timeText: "오전 6:00", sleepPrompt: false, transitioning: false, shopOpen: false, mapName: "지우네 농장",
};
export const gameEvents = new EventTarget();
import { GAME_CONFIG } from "./config";
