import type { RelationshipEventDefinition, RelationshipEventId } from "./types";

export const RELATIONSHIP_EVENT_DEFINITIONS: Record<RelationshipEventId, RelationshipEventDefinition> = {
  boram_soil_note: {
    id: "boram_soil_note", title: "흙이 들려준 이야기", npcId: "boram", minRelationshipPoints: 20,
    mapId: "farm", seasons: ["spring"], minDaySerial: 1, timeRange: { start: 360, end: 650 },
    weather: ["clear", "cloudy", "rain"], once: true,
    scene: [
      { kind: "dialogue", speaker: "보람", lines: ["오늘 흙이 유난히 부드러워. 네가 매일 돌본 흔적이 보여.", "서두르지 않아도 농장은 마음을 기억해."] },
      { kind: "notice", text: "보람과 함께 밭 가장자리의 흙을 살펴보았습니다." },
      { kind: "complete" },
    ],
  },
  soli_rainy_pond: {
    id: "soli_rainy_pond", title: "빗방울 연못", npcId: "soli", minRelationshipPoints: 20,
    mapId: "farm", seasons: ["spring"], timeRange: { start: 840, end: 1070 }, weather: ["rain"],
    requiredQuestIds: ["village_hello"], requiredEventIds: ["boram_soil_note"], once: true,
    scene: [
      { kind: "dialogue", speaker: "솔이", lines: ["비 오는 날 연못을 보면 동그란 파문이 계속 태어나!", "다음에는 파문이 몇 번 겹치는지 같이 세어 보자."] },
      { kind: "notice", text: "솔이의 관찰 일기에 빗방울 연못이 기록되었습니다." },
      { kind: "complete" },
    ],
  },
};

export const getRelationshipEvent = (id: unknown) =>
  typeof id === "string" && Object.hasOwn(RELATIONSHIP_EVENT_DEFINITIONS, id)
    ? RELATIONSHIP_EVENT_DEFINITIONS[id as RelationshipEventId]
    : undefined;
