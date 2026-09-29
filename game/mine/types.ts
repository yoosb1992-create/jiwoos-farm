export type MineResourceKind = "stone" | "copper";
export interface MineFloorState { hits: Record<string, number>; depleted: string[] }
export interface MineDailyState { daySerial: number; floors: Record<string, MineFloorState> }
export interface MineProgress { deepestUnlockedFloor: number }
