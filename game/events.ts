export type ToolKey = "hoe" | "seed" | "water" | "hand";
export interface HudState {
  money: number;
  seeds: number;
  harvest: number;
  selectedTool: ToolKey;
  objective: string;
  message: string;
  progress: number;
  day: number;
  timeText: string;
  sleepPrompt: boolean;
  transitioning: boolean;
}
export const initialHud: HudState = {
  money: GAME_CONFIG.startingMoney, seeds: GAME_CONFIG.startingSeedCount, harvest: 0, selectedTool: "hoe",
  objective: "첫 밭을 갈아 보세요", message: "갈색 밭 가까이에서 괭이를 사용하세요.", progress: 0,
  day: 1, timeText: "오전 6:00", sleepPrompt: false, transitioning: false,
};
export const gameEvents = new EventTarget();
import { GAME_CONFIG } from "./config";
