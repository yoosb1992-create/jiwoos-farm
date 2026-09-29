import { getNpc } from "../npc/definitions";
import type { PlayerProgress } from "../npc/progress";
import { calendarDate } from "../world/calendar";
import { getRelationshipEvent, RELATIONSHIP_EVENT_DEFINITIONS } from "./definitions";
import type { RelationshipEventContext, RelationshipEventDefinition, RelationshipEventId, RelationshipEventRunView } from "./types";

export function relationshipEventEligibilityError(definition: RelationshipEventDefinition, progress: PlayerProgress, context: RelationshipEventContext): string | null {
  if (definition.once && progress.seenEventIds.includes(definition.id)) return "이미 완료한 관계 이벤트예요.";
  if ((progress.relationships[definition.npcId]?.points ?? 0) < definition.minRelationshipPoints) return "호감도가 더 필요해요.";
  if (context.mapId !== definition.mapId) return "이 장소에서는 시작할 수 없어요.";
  const date = calendarDate(context.daySerial);
  if (definition.seasons && !definition.seasons.includes(date.season)) return "지금 계절에는 시작할 수 없어요.";
  if (definition.days && !definition.days.includes(date.day)) return "오늘은 이벤트가 열리지 않아요.";
  if (definition.minDaySerial && context.daySerial < definition.minDaySerial) return "아직 이벤트를 시작할 수 없어요.";
  if (definition.timeRange && (context.timeMinutes < definition.timeRange.start || context.timeMinutes > definition.timeRange.end)) return "이벤트 시간이 아니에요.";
  if (definition.weather && !definition.weather.includes(context.weather)) return "오늘 날씨에는 시작할 수 없어요.";
  if (definition.requiredQuestIds?.some(id => progress.quests[id]?.status !== "rewarded")) return "먼저 필요한 의뢰를 완료해 주세요.";
  if (definition.requiredEventIds?.some(id => !progress.seenEventIds.includes(id))) return "먼저 이어지는 관계 이벤트를 완료해 주세요.";
  if (progress.activeEventId && progress.activeEventId !== definition.id) return "진행 중인 관계 이벤트를 먼저 마쳐 주세요.";
  return null;
}

const eventLines = (definition: RelationshipEventDefinition) => definition.scene.flatMap(step =>
  step.kind === "dialogue" ? [...step.lines] : step.kind === "notice" ? [step.text] : step.kind === "wait" ? ["잠시 함께 시간을 보냈습니다."] : []);

export function startRelationshipEvent(progress: PlayerProgress, eventId: unknown, context: RelationshipEventContext): { error: string | null; event?: RelationshipEventRunView } {
  const definition = getRelationshipEvent(eventId);
  if (!definition) return { error: "없는 관계 이벤트예요." };
  const error = relationshipEventEligibilityError(definition, progress, context);
  if (error) return { error };
  const npc = getNpc(definition.npcId);
  if (!npc) return { error: "이벤트 주민을 찾을 수 없어요." };
  const lines = eventLines(definition);
  if (!lines.length) return { error: "이벤트 장면이 비어 있어요." };
  progress.activeEventId = definition.id;
  return { error: null, event: { eventId: definition.id, title: definition.title, npcId: npc.id, name: npc.name, image: npc.asset.source?.path ?? "", lines, index: 0 } };
}

export function completeRelationshipEvent(progress: PlayerProgress, eventId: unknown): string | null {
  const definition = getRelationshipEvent(eventId);
  if (!definition) return "없는 관계 이벤트예요.";
  if (progress.activeEventId !== definition.id) return "먼저 관계 이벤트를 시작해 주세요.";
  if (definition.once && progress.seenEventIds.includes(definition.id)) { progress.activeEventId = null; return "이미 완료한 관계 이벤트예요."; }
  progress.seenEventIds = [...new Set([...progress.seenEventIds, definition.id])];
  progress.activeEventId = null;
  return null;
}

export function availableRelationshipEvents(progress: PlayerProgress, npcId: string, context: RelationshipEventContext) {
  return Object.values(RELATIONSHIP_EVENT_DEFINITIONS).filter(definition => definition.npcId === npcId && !relationshipEventEligibilityError(definition, progress, context));
}

export function advanceRelationshipEvent(view: RelationshipEventRunView): "advanced" | "complete" {
  if (view.index + 1 >= view.lines.length) return "complete";
  view.index += 1;
  return "advanced";
}

export const isRelationshipEventId = (value: unknown): value is RelationshipEventId => !!getRelationshipEvent(value);
