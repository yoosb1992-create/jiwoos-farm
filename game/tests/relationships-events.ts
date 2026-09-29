import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NpcRelationshipActions } from "../../app/components/NpcRelationshipActions";
import { NpcDialogue } from "../../app/components/NpcDialogue";
import { FamilyProgress } from "../../server/family/progress";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { Inventory, normalizeSaveData } from "../domain";
import { NPC_DEFINITIONS } from "../npc/definitions";
import { GIFT_RULES, giftPreference, giftToNpc } from "../npc/gifts";
import { normalizeProgress, relationshipLevel, RELATIONSHIP_RULES } from "../npc/progress";
import { NpcController } from "../npc/NpcController";
import { MapRegistry } from "../maps/MapRegistry";
import { RELATIONSHIP_EVENT_DEFINITIONS } from "../relationship-events/definitions";
import { advanceRelationshipEvent, completeRelationshipEvent, relationshipEventEligibilityError, startRelationshipEvent } from "../relationship-events/system";
import type { RelationshipEventContext } from "../relationship-events/types";
import { familyTestDB } from "./family-db";

for (const npc of NPC_DEFINITIONS) assert.ok(npc.giftPreferences.loved.length + npc.giftPreferences.neutral.length + npc.giftPreferences.disliked.length > 0);
assert.deepEqual(GIFT_RULES.points, { loved: 25, neutral: 10, disliked: 0 });
const progress = normalizeProgress(null), inventory = new Inventory({ items: { morningcarrot: 2, wood: 1, moon_mushroom: 1 } });
assert.equal(giftPreference("boram", "morningcarrot"), "loved");
assert.equal(giftPreference("boram", "wood"), "neutral");
assert.equal(giftPreference("boram", "moon_mushroom"), "disliked");
assert.deepEqual(giftToNpc(progress, inventory, "boram", "morningcarrot", 1), { error: null, preference: "loved", points: 25 });
assert.equal(inventory.count("morningcarrot"), 1); assert.equal(progress.relationships.boram.points, 25);
const afterFirstGift = structuredClone({ progress, inventory: inventory.serialize() });
assert.match(giftToNpc(progress, inventory, "boram", "morningcarrot", 1).error!, /이미/);
assert.deepEqual({ progress, inventory: inventory.serialize() }, afterFirstGift, "duplicate daily gift changes nothing");
assert.deepEqual(giftToNpc(progress, inventory, "boram", "wood", 2), { error: null, preference: "neutral", points: 10 });
assert.equal(progress.relationships.boram.points, 35); assert.equal(inventory.count("wood"), 0);
assert.deepEqual(giftToNpc(progress, inventory, "boram", "moon_mushroom", 3), { error: null, preference: "disliked", points: 0 });
assert.equal(progress.relationships.boram.points, 35); assert.equal(inventory.count("moon_mushroom"), 0);
const beforeMissing = structuredClone({ progress, inventory: inventory.serialize() });
assert.match(giftToNpc(progress, inventory, "boram", "fairy_bloom", 4).error!, /없/);
assert.deepEqual({ progress, inventory: inventory.serialize() }, beforeMissing);
progress.relationships.boram.points = 999; inventory.add("morningcarrot");
assert.equal(giftToNpc(progress, inventory, "boram", "morningcarrot", 4).error, null);
assert.equal(progress.relationships.boram.points, RELATIONSHIP_RULES.maxPoints); assert.equal(relationshipLevel(1000), "좋은 친구");

const eventProgress = normalizeProgress(null), boramEvent = RELATIONSHIP_EVENT_DEFINITIONS.boram_soil_note;
const boramContext: RelationshipEventContext = { daySerial: 1, timeMinutes: 360, mapId: "farm", weather: "clear" };
eventProgress.relationships.boram.points = 19;
assert.match(relationshipEventEligibilityError(boramEvent, eventProgress, boramContext)!, /호감도/);
eventProgress.relationships.boram.points = 20;
assert.equal(relationshipEventEligibilityError(boramEvent, eventProgress, boramContext), null);
assert.ok(relationshipEventEligibilityError(boramEvent, eventProgress, { ...boramContext, mapId: "town" }));
assert.ok(relationshipEventEligibilityError(boramEvent, eventProgress, { ...boramContext, daySerial: 29 }));
assert.ok(relationshipEventEligibilityError(boramEvent, eventProgress, { ...boramContext, timeMinutes: 700 }));

const soliEvent = RELATIONSHIP_EVENT_DEFINITIONS.soli_rainy_pond;
const soliContext: RelationshipEventContext = { daySerial: 1, timeMinutes: 900, mapId: "farm", weather: "rain" };
eventProgress.relationships.soli.points = 20;
assert.match(relationshipEventEligibilityError(soliEvent, eventProgress, soliContext)!, /의뢰/);
eventProgress.quests.village_hello = { status: "rewarded", talked: [] };
assert.match(relationshipEventEligibilityError(soliEvent, eventProgress, soliContext)!, /먼저 이어지는/);
eventProgress.seenEventIds.push("boram_soil_note");
assert.equal(relationshipEventEligibilityError(soliEvent, eventProgress, soliContext), null);
assert.ok(relationshipEventEligibilityError(soliEvent, eventProgress, { ...soliContext, weather: "clear" }));
assert.ok(relationshipEventEligibilityError(soliEvent, eventProgress, { ...soliContext, timeMinutes: 700 }));

const interrupted = normalizeProgress({ relationships: { boram: { points: 20 } } });
const started = startRelationshipEvent(interrupted, "boram_soil_note", boramContext);
assert.equal(started.error, null); assert.equal(started.event?.index, 0); assert.equal(interrupted.activeEventId, "boram_soil_note");
assert.equal(advanceRelationshipEvent(started.event!), "advanced");
const restored = normalizeProgress(JSON.parse(JSON.stringify(interrupted)));
assert.equal(restored.activeEventId, "boram_soil_note"); assert.deepEqual(restored.seenEventIds, []);
const restarted = startRelationshipEvent(restored, "boram_soil_note", boramContext);
assert.equal(restarted.event?.index, 0, "interrupted event restarts safely from the beginning");
while (advanceRelationshipEvent(restarted.event!) === "advanced") { /* run all dialogue steps */ }
assert.equal(completeRelationshipEvent(restored, "boram_soil_note"), null);
assert.deepEqual(restored.seenEventIds, ["boram_soil_note"]); assert.equal(restored.activeEventId, null);
assert.match(startRelationshipEvent(restored, "boram_soil_note", boramContext).error!, /이미/);
assert.ok(completeRelationshipEvent(restored, "missing"));
const legacy = normalizeProgress({ relationships: { daon: { points: 77, lastTalkDay: 3, dialogue: { met: true, cursor: 2, lastKey: "general-0" } } }, quests: { village_hello: { status: "active", talked: ["daon"] } } });
assert.equal(legacy.relationships.daon.points, 77); assert.equal(legacy.relationships.daon.lastGiftDaySerial, null); assert.deepEqual(legacy.seenEventIds, []); assert.equal(legacy.activeEventId, null);
const saved = normalizeSaveData({ version: 4, day: 1, playerProgress: restored })!;
assert.deepEqual(saved.playerProgress?.seenEventIds, ["boram_soil_note"]); assert.equal(saved.playerProgress?.activeEventId, null);

const actionsMarkup = renderToStaticMarkup(createElement(NpcRelationshipActions, { items: { morningcarrot: 2 }, eventOptions: [{ id: "boram_soil_note", title: "흙이 들려준 이야기" }], busy: false, onGift: () => {}, onEvent: () => {} }));
for (const text of ["선물하기", "아침당근", "선물", "관계 이벤트", "흙이 들려준 이야기"]) assert.ok(actionsMarkup.includes(text));
const eventMarkup = renderToStaticMarkup(createElement(NpcDialogue, { dialogue: { ...restarted.event!, eventTitle: restarted.event!.title }, onNext: () => {}, onClose: () => {} }));
assert.ok(eventMarkup.includes("관계 이벤트")); assert.ok(eventMarkup.includes("이벤트 완료") || eventMarkup.includes("다음"));

const { db, close } = familyTestDB(); const now = () => 2_000_000;
try {
  const rooms = new FamilyRooms(db, now), state = new FamilyState(db, now), service = new FamilyProgress(db, now);
  const a = await rooms.create("relation-A", "관계 가족", "A"), b = await rooms.join("relation-B", a.room.inviteCode, "B"), roomId = a.room.id;
  await state.read("relation-A", roomId);
  await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json,?,json(?),?,json(?)),revision=revision+1 WHERE room_id=?")
    .bind(`$.\"${a.room.playerId}\"`, JSON.stringify({ items: { heartberry: 1, wood: 2 } }), `$.\"${b.room.playerId}\"`, JSON.stringify({ items: { heartberry: 1 } }), roomId).run();
  const controller = new NpcController(NPC_DEFINITIONS, new MapRegistry());
  const npcPose = (npcId: string, day = 1, minute = 360) => ({ ...controller.sample(day, minute).find(npc => npc.npcId === npcId)!, selectedTool: "hand" as const, moving: false });
  let aProgress = await service.readProgress("relation-A", roomId);
  const gifted = await service.interact("relation-A", roomId, aProgress.revision, { kind: "gift", npcId: "daon", itemId: "heartberry", points: 999 }, npcPose("daon"));
  aProgress = gifted.progress;
  assert.equal(gifted.progress.data.relationships.daon.points, GIFT_RULES.points.loved);
  assert.equal(gifted.snapshot?.inventory.items.heartberry, 0);
  assert.equal((await state.read("relation-B", roomId)).inventory.items.heartberry, 1);
  assert.equal((await service.readProgress("relation-B", roomId)).data.relationships.daon.points, 0);
  const duplicateState = await state.read("relation-A", roomId);
  await assert.rejects(service.interact("relation-A", roomId, aProgress.revision, { kind: "gift", npcId: "daon", itemId: "wood" }, npcPose("daon")), (error: unknown) => error instanceof FamilyError && error.status === 409);
  assert.deepEqual(await state.read("relation-A", roomId), duplicateState);
  let bProgress = await service.readProgress("relation-B", roomId); const bBefore = await state.read("relation-B", roomId);
  await assert.rejects(service.interact("relation-B", roomId, bProgress.revision, { kind: "gift", npcId: "daon", itemId: "heartberry" }, { ...npcPose("daon"), x: 0, y: 0 }), (error: unknown) => error instanceof FamilyError && error.status === 400);
  assert.deepEqual(await state.read("relation-B", roomId), bBefore);
  assert.equal((await service.readProgress("relation-B", roomId)).data.relationships.daon.points, 0);
  const bGifted = await service.interact("relation-B", roomId, bProgress.revision, { kind: "gift", npcId: "daon", itemId: "heartberry" }, npcPose("daon"));
  bProgress = bGifted.progress; assert.equal(bProgress.data.relationships.daon.points, 25); assert.equal(bGifted.snapshot?.inventory.items.heartberry, 0);
  assert.equal((await service.readProgress("relation-A", roomId)).data.relationships.daon.points, 25, "gift limits and relationships stay personal");
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json,'$.day',2,'$.daySerial',2),revision=revision+1 WHERE room_id=?").bind(roomId).run();
  const giftRevision = aProgress.revision;
  const giftRace = await Promise.allSettled([
    service.interact("relation-A", roomId, giftRevision, { kind: "gift", npcId: "daon", itemId: "wood" }, npcPose("daon", 2)),
    service.interact("relation-A", roomId, giftRevision, { kind: "gift", npcId: "daon", itemId: "wood" }, npcPose("daon", 2)),
  ]);
  assert.equal(giftRace.filter(result => result.status === "fulfilled").length, 1);
  aProgress = await service.readProgress("relation-A", roomId);
  assert.equal(aProgress.data.relationships.daon.points, 35); assert.equal((await state.read("relation-A", roomId)).inventory.items.wood, 1);
  await db.prepare("UPDATE family_player_progress SET progress_json=json_set(progress_json,'$.relationships.boram.points',20),revision=revision+1 WHERE player_id=?").bind(a.room.playerId).run();
  aProgress = await service.readProgress("relation-A", roomId);
  const eventStart = await service.interact("relation-A", roomId, aProgress.revision, { kind: "event-start", eventId: "boram_soil_note" }, npcPose("boram", 2));
  assert.equal(eventStart.event?.eventId, "boram_soil_note"); assert.equal(eventStart.progress.data.activeEventId, "boram_soil_note");
  assert.deepEqual((await service.readProgress("relation-B", roomId)).data.seenEventIds, []);
  const completeRace = await Promise.allSettled([
    service.interact("relation-A", roomId, eventStart.progress.revision, { kind: "event-complete", eventId: "boram_soil_note" }, npcPose("boram", 2)),
    service.interact("relation-A", roomId, eventStart.progress.revision, { kind: "event-complete", eventId: "boram_soil_note" }, npcPose("boram", 2)),
  ]);
  assert.equal(completeRace.filter(result => result.status === "fulfilled").length, 1);
  const completed = await service.readProgress("relation-A", roomId);
  assert.deepEqual(completed.data.seenEventIds, ["boram_soil_note"]); assert.equal(completed.data.activeEventId, null);
  await assert.rejects(service.interact("relation-A", roomId, completed.revision, { kind: "event-complete", eventId: "boram_soil_note" }, npcPose("boram", 2)), (error: unknown) => error instanceof FamilyError && error.status === 409);
  await assert.rejects(service.interact("relation-A", roomId, completed.revision, { kind: "event-start", eventId: "missing" }, npcPose("boram", 2)), (error: unknown) => error instanceof FamilyError && error.status === 400);
  assert.deepEqual((await service.readProgress("relation-B", roomId)).data.seenEventIds, []);
  console.log("Relationships/events: gifts, conditions, runner, saves, personal Family authority and CAS passed");
} finally { close(); }
