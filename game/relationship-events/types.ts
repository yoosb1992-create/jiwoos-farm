import type { ItemId } from "../data/items";
import type { MapId } from "../maps/types";
import type { Season } from "../world/calendar";
import type { WeatherId } from "../weather/types";

export type RelationshipEventId = "boram_soil_note" | "soli_rainy_pond";
export type RelationshipEventStep =
  | { kind: "dialogue"; speaker: string; lines: readonly string[] }
  | { kind: "notice"; text: string }
  | { kind: "wait"; gameMinutes: number }
  | { kind: "complete" };

export interface RelationshipEventDefinition {
  id: RelationshipEventId; title: string; npcId: string; minRelationshipPoints: number; mapId: MapId;
  seasons?: readonly Season[]; days?: readonly number[]; minDaySerial?: number;
  timeRange?: { start: number; end: number }; weather?: readonly WeatherId[];
  requiredQuestIds?: readonly string[]; requiredEventIds?: readonly RelationshipEventId[]; once: boolean;
  scene: readonly RelationshipEventStep[];
  rewards?: { money?: number; items?: Partial<Record<ItemId, number>>; friendship?: number; unlockFlag?: string };
}

export interface RelationshipEventContext { daySerial: number; timeMinutes: number; mapId: MapId; weather: WeatherId }
export interface RelationshipEventRunView {
  eventId: RelationshipEventId; title: string; npcId: string; name: string; image: string; lines: string[]; index: number;
}
