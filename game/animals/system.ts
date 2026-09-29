import type { BuildingsData } from "../buildings/types";
import { BUILDING_DEFINITIONS } from "../buildings/definitions";
import type { Inventory } from "../domain";
import { ANIMAL_DEFINITIONS, isAnimalSpeciesId } from "./definitions";
import type { AnimalInstance, AnimalSpeciesId, RanchState } from "./types";

export const initialRanchState = (): RanchState => ({ animals: [], lastDailyProcessedDaySerial: 0 });
const integer = (value: unknown, fallback: number) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fallback;
export function normalizeRanchState(value: unknown, buildings: BuildingsData): RanchState {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<RanchState> : {};
  const candidates = Array.isArray(raw.animals) ? raw.animals : [], ids = new Set<string>(), animals: AnimalInstance[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const a = candidate as Partial<AnimalInstance>;
    const home = buildings.instances.find(b => b.id === a.homeBuildingId);
    if (!isAnimalSpeciesId(a.species) || typeof a.id !== "string" || !a.id || a.id.length > 80 || ids.has(a.id) ||
        typeof a.name !== "string" || !a.name.trim() || a.name.length > 24 || !home ||
        !ANIMAL_DEFINITIONS[a.species].homeBuildingTypes.includes(home.definitionId)) continue;
    const definition = ANIMAL_DEFINITIONS[a.species];
    animals.push({ id: a.id, species: a.species, name: a.name.trim(), homeBuildingId: home.id,
      ageDays: integer(a.ageDays, 0), friendship: Math.min(definition.friendshipMax, integer(a.friendship, 0)),
      lastPettedDaySerial: integer(a.lastPettedDaySerial, 0), lastFedDaySerial: integer(a.lastFedDaySerial, 0),
      lastProducedDaySerial: integer(a.lastProducedDaySerial, 0),
      produceReady: a.produceReady === definition.produceItemId ? definition.produceItemId : null });
    ids.add(a.id);
  }
  return { animals, lastDailyProcessedDaySerial: integer(raw.lastDailyProcessedDaySerial, 0) };
}
export function buyAnimal(ranch: RanchState, buildings: BuildingsData, money: number, species: unknown,
  homeBuildingId: unknown, instanceId: string, daySerial: number): { error: string | null; money: number; animal?: AnimalInstance } {
  if (!isAnimalSpeciesId(species) || typeof homeBuildingId !== "string") return { error: "구입할 동물 정보가 올바르지 않아요.", money };
  const home = buildings.instances.find(b => b.id === homeBuildingId && b.status === "ready"), definition = ANIMAL_DEFINITIONS[species];
  if (!home || !definition.homeBuildingTypes.includes(home.definitionId)) return { error: "이 동물이 살 수 있는 완성된 건물이 필요해요.", money };
  const building = BUILDING_DEFINITIONS[home.definitionId], residents = ranch.animals.filter(a => a.homeBuildingId === home.id);
  if (!building.animalCapacity || residents.length >= building.animalCapacity || !building.allowedAnimalSpecies?.includes(species))
    return { error: "닭장에 빈자리가 없어요.", money };
  if (money < definition.purchasePrice) return { error: "닭을 구입할 공동 자금이 부족해요.", money };
  if (!instanceId || instanceId.length > 80 || ranch.animals.some(a => a.id === instanceId) || !Number.isSafeInteger(daySerial) || daySerial < 1)
    return { error: "동물 등록 요청이 올바르지 않아요.", money };
  const animal: AnimalInstance = { id: instanceId, species, name: `꼬꼬 ${ranch.animals.length + 1}`, homeBuildingId: home.id,
    ageDays: 0, friendship: 0, lastPettedDaySerial: 0, lastFedDaySerial: 0, lastProducedDaySerial: 0, produceReady: null };
  ranch.animals.push(animal);
  return { error: null, money: money - definition.purchasePrice, animal };
}
export function feedCoop(ranch: RanchState, buildings: BuildingsData, inventory: Inventory, homeBuildingId: unknown, daySerial: number): string | null {
  if (typeof homeBuildingId !== "string" || !buildings.instances.some(b => b.id === homeBuildingId && b.definitionId === "chicken_coop" && b.status === "ready")) return "완성된 닭장에서 먹이를 주세요.";
  const hungry = ranch.animals.filter(a => a.homeBuildingId === homeBuildingId && a.lastFedDaySerial !== daySerial);
  if (!hungry.length) return "오늘 먹일 닭이 없어요.";
  if (inventory.count("animal_feed") < hungry.length) return `동물 먹이가 ${hungry.length}개 필요해요.`;
  if (!inventory.consume("animal_feed", hungry.length)) return "동물 먹이가 부족해요.";
  for (const animal of hungry) animal.lastFedDaySerial = daySerial;
  return null;
}
export function petAnimal(ranch: RanchState, animalId: unknown, daySerial: number): string | null {
  if (typeof animalId !== "string") return "돌볼 동물을 선택해 주세요.";
  const animal = ranch.animals.find(a => a.id === animalId);
  if (!animal) return "없는 동물이에요.";
  if (animal.lastPettedDaySerial === daySerial) return "오늘은 이미 쓰다듬었어요.";
  const definition = ANIMAL_DEFINITIONS[animal.species];
  animal.lastPettedDaySerial = daySerial;
  animal.friendship = Math.min(definition.friendshipMax, animal.friendship + definition.petFriendship);
  return null;
}
export function advanceRanchDay(ranch: RanchState, previousDaySerial: number, newDaySerial: number): boolean {
  if (!Number.isSafeInteger(previousDaySerial) || !Number.isSafeInteger(newDaySerial) || newDaySerial !== previousDaySerial + 1 ||
      ranch.lastDailyProcessedDaySerial >= newDaySerial) return false;
  for (const animal of ranch.animals) {
    animal.ageDays += 1;
    const definition = ANIMAL_DEFINITIONS[animal.species];
    if (animal.lastFedDaySerial === previousDaySerial && !animal.produceReady &&
        newDaySerial - animal.lastProducedDaySerial >= definition.productionDays) {
      animal.produceReady = definition.produceItemId;
      animal.lastProducedDaySerial = newDaySerial;
    }
  }
  ranch.lastDailyProcessedDaySerial = newDaySerial;
  return true;
}
export function collectAnimalProduce(ranch: RanchState, inventory: Inventory, animalId: unknown): string | null {
  if (typeof animalId !== "string") return "생산물을 받을 동물을 선택해 주세요.";
  const animal = ranch.animals.find(a => a.id === animalId);
  if (!animal || !animal.produceReady) return "받을 생산물이 없어요.";
  inventory.add(animal.produceReady, 1);
  animal.produceReady = null;
  return null;
}
