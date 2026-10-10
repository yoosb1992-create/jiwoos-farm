import type { MapData } from "./content.js";
import { hasZone, terrainAt, waterTerrain } from "./world2.js";
/** v2.6 original content. Plain data, shared by the authority and the field guide. */
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_DAYS = 28;
export const SEASON_INFO: Record<
  Season,
  {
    name: string;
    icon: string;
    grass: number;
    foliage: number;
    flower: number;
    sky: string;
    note: string;
  }
> = {
  spring: {
    name: "봄",
    icon: "✿",
    grass: 0x99bc71,
    foliage: 0xd9f3bb,
    flower: 0xf5b5c2,
    sky: "#edf4db",
    note: "작은 씨앗으로 시작하는 계절",
  },
  summer: {
    name: "여름",
    icon: "☀",
    grass: 0x75a75d,
    foliage: 0xb7e896,
    flower: 0xffd777,
    sky: "#e3f2df",
    note: "초록 그늘과 긴 저녁",
  },
  autumn: {
    name: "가을",
    icon: "❧",
    grass: 0xb3a164,
    foliage: 0xf3b878,
    flower: 0xe6a075,
    sky: "#f7e8cd",
    note: "풍성한 수확과 버섯 산책",
  },
  winter: {
    name: "겨울",
    icon: "❄",
    grass: 0xcbdcde,
    foliage: 0xdeeeee,
    flower: 0xd3e2ed,
    sky: "#e6eef4",
    note: "설근 채소, 광산과 따뜻한 공방",
  },
};
export function calendar(day: number) {
  const d = Math.max(0, day - 1);
  return {
    season: SEASONS[Math.floor(d / SEASON_DAYS) % 4]!,
    day: (d % SEASON_DAYS) + 1,
    year: Math.floor(d / (SEASON_DAYS * 4)) + 1,
  };
}
export const ALL_SEASONS: Season[] = [...SEASONS];
export interface CropDef {
  id: string;
  name: string;
  growthDays: number;
  seedItemId: string;
  harvestItemId: string;
  sellPrice: number;
  seedPrice: number;
  seasons: Season[];
  regrowDays: number;
  energy: number;
  rarity: string;
  description: string;
  color: number;
  shape: string;
}
function crop(
  id: string,
  name: string,
  season: Season | Season[],
  days: number,
  price: number,
  sale: number,
  color: number,
  shape: string,
  regrow = 0,
  energy = 12,
): CropDef {
  return {
    id,
    name,
    growthDays: days,
    seedItemId: `${id}_seed`,
    harvestItemId: id,
    sellPrice: sale,
    seedPrice: price,
    seasons: Array.isArray(season) ? season : [season],
    regrowDays: regrow,
    energy,
    rarity: sale >= 140 ? "진귀" : sale >= 75 ? "특별" : "보통",
    color,
    shape,
    description: `${name}의 향이 식탁을 채워요. ${days}일 성장${regrow ? ` 후 ${regrow}일마다 재수확` : ""}. 매일 물을 주세요.`,
  };
}
export const EXPANSION_CROPS: CropDef[] = [
  crop(
    "sproutberry",
    "새싹열매",
    ["spring", "summer"],
    3,
    10,
    35,
    0xe76f8c,
    "berry",
  ),
  crop("sunpotato", "햇살감자", "spring", 4, 18, 60, 0xd6b073, "root"),
  crop("heartberry", "하트딸기", "spring", 5, 45, 65, 0xdc5b68, "berry", 3),
  crop(
    "morningcarrot",
    "아침당근",
    ["spring", "autumn"],
    3,
    14,
    45,
    0xef9c4d,
    "root",
  ),
  crop("cloudturnip", "구름무", "spring", 4, 20, 65, 0xf2e6cf, "root"),
  crop("ribboncabbage", "리본양배추", "spring", 6, 35, 110, 0xa3c870, "leaf"),
  crop("dewflower", "이슬꽃", "spring", 5, 28, 90, 0xe9b3cf, "flower", 0, 5),
  crop("rubytomato", "홍빛토마토", "summer", 6, 50, 65, 0xe35c4d, "berry", 3),
  crop(
    "goldcorn",
    "노을옥수수",
    ["summer", "autumn"],
    7,
    60,
    75,
    0xf2cc54,
    "corn",
    4,
  ),
  crop("bluepearl", "푸른구슬열매", "summer", 7, 75, 90, 0x6e89c4, "berry", 3),
  crop("sunpepper", "햇불고추", "summer", 5, 35, 52, 0xe45b42, "root", 3),
  crop("sunwheel", "해바퀴꽃", "summer", 8, 65, 190, 0xf5bf39, "flower", 0, 5),
  crop("ambermelon", "호박빛참외", "summer", 9, 80, 240, 0xf0cf77, "melon"),
  crop("moonpumpkin", "달빛호박", "autumn", 9, 85, 270, 0xe5a057, "melon"),
  crop(
    "velveteggplant",
    "보랏빛가지",
    "autumn",
    6,
    50,
    75,
    0x9565aa,
    "root",
    4,
  ),
  crop("honeyyam", "꿀고구마", "autumn", 5, 35, 110, 0xc7828a, "root"),
  crop("duskgrape", "노을포도", "autumn", 8, 90, 110, 0x9678b6, "berry", 4),
  crop("redbell", "빨간방울열매", "autumn", 7, 65, 85, 0xc9586a, "berry", 3),
  crop("snowradish", "눈꽃무", "winter", 5, 25, 85, 0xe1e8e8, "root"),
  crop("frostkale", "서리잎채소", "winter", 6, 40, 120, 0x8daebe, "leaf"),
  crop(
    "winterstar",
    "겨울별꽃",
    "winter",
    8,
    70,
    210,
    0xb9c5ee,
    "flower",
    0,
    5,
  ),

  // v2.7 content expansion: broader seasonal seed choices and flower crops.
  crop("pinktulip", "분홍튤립", "spring", 5, 28, 82, 0xf39ab1, "flower", 0, 4),
  crop("sweetpea", "향기완두", "spring", 5, 32, 58, 0xb997df, "berry", 3, 10),
  crop("springonion", "봄햇양파", "spring", 4, 18, 52, 0xe8e2c6, "root"),
  crop("coolcucumber", "초록오이", "summer", 6, 40, 58, 0x79b96d, "berry", 3, 12),
  crop("watermelon", "여름수박", "summer", 10, 95, 280, 0x5daa62, "melon"),
  crop("lavender", "보랏빛라벤더", "summer", 7, 42, 125, 0x9a7dc7, "flower", 4, 5),
  crop("rubybeet", "루비비트", "autumn", 5, 30, 92, 0xb84f69, "root"),
  crop("chrysanthemum", "황금국화", "autumn", 7, 45, 145, 0xe7b84b, "flower", 0, 5),
  crop("scarletbean", "노을콩", "autumn", 7, 50, 72, 0xc86f5a, "berry", 3, 12),
  crop("icelettuce", "얼음상추", "winter", 5, 28, 82, 0xa9c8b2, "leaf"),
  crop("snowpea", "눈완두", "winter", 6, 36, 64, 0x9bc7b0, "berry", 3, 10),
  crop("frostflower", "서리꽃", "winter", 7, 48, 155, 0xd3d8f4, "flower", 0, 5),
];
export interface ForageDef {
  id: string;
  name: string;
  seasons: Season[];
  price: number;
  energy: number;
  asset: string;
  color: number;
  description: string;
}
export const FORAGE: ForageDef[] = [
  {
    id: "wild_herb",
    name: "들풀 허브",
    seasons: ALL_SEASONS,
    price: 16,
    energy: 12,
    asset: "forest_herb",
    color: 0x9fbd6e,
    description: "사계절 숲 가장자리에서 자라요. 차와 요리에 사용해요.",
  },
  {
    id: "fairy_bloom",
    name: "요정꽃",
    seasons: ["spring", "summer"],
    price: 48,
    energy: 8,
    asset: "forest_fairy_bloom",
    color: 0xd7a4e5,
    description: "요정의 숲에 드문드문 피는 빛나는 꽃.",
  },
  {
    id: "moon_mushroom",
    name: "달버섯",
    seasons: ["autumn", "winter"],
    price: 42,
    energy: 16,
    asset: "forest_moon_mushroom",
    color: 0xb6a5d6,
    description: "서늘해지면 나타나는 은은한 숲의 선물.",
  },
  {
    id: "dawn_petals",
    name: "새벽꽃잎",
    seasons: ["spring"],
    price: 24,
    energy: 6,
    asset: "forest_fairy_bloom",
    color: 0xf0b4c1,
    description: "봄바람과 함께 떨어진 분홍 꽃잎.",
  },
  {
    id: "clover_shoot",
    name: "토끼풀순",
    seasons: ["spring"],
    price: 20,
    energy: 12,
    asset: "forest_herb",
    color: 0x9dc971,
    description: "겨울을 이기고 자란 부드러운 새순.",
  },
  {
    id: "river_mint",
    name: "물가박하",
    seasons: ["summer"],
    price: 30,
    energy: 18,
    asset: "forest_herb",
    color: 0x78bea6,
    description: "여름 물가의 시원한 향. 허브차 재료.",
  },
  {
    id: "sun_berry",
    name: "산햇살열매",
    seasons: ["summer"],
    price: 38,
    energy: 20,
    asset: "forest_fairy_bloom",
    color: 0xe9aa69,
    description: "햇빛을 듬뿍 받은 달콤한 산열매.",
  },
  {
    id: "amber_mushroom",
    name: "호박버섯",
    seasons: ["autumn"],
    price: 36,
    energy: 18,
    asset: "forest_moon_mushroom",
    color: 0xe5ac63,
    description: "낙엽 아래에서 찾는 가을의 감칠맛.",
  },
  {
    id: "forest_chestnut",
    name: "숲알밤",
    seasons: ["autumn"],
    price: 32,
    energy: 16,
    asset: "item_pine_cone",
    color: 0xb68b5f,
    description: "구워 먹으면 고소한 가을 열매.",
  },
  {
    id: "snow_bloom",
    name: "설화풀",
    seasons: ["winter"],
    price: 38,
    energy: 15,
    asset: "forest_fairy_bloom",
    color: 0xdbe6f6,
    description: "눈 속에서도 푸른 빛을 잃지 않는 약초.",
  },
  {
    id: "ice_crystal",
    name: "얼음수정",
    seasons: ["winter"],
    price: 60,
    energy: 0,
    asset: "forest_ore",
    color: 0xa6d7e9,
    description: "겨울 숲에서만 발견되는 반짝이는 결정.",
  },
  {
    id: "winter_root",
    name: "겨울뿌리",
    seasons: ["winter"],
    price: 27,
    energy: 18,
    asset: "forest_herb",
    color: 0xd4b8a0,
    description: "동물 먹이와 겨울 요리를 떠올리게 하는 든든한 뿌리.",
  },
];
export type WaterKind = "pond" | "river" | "forest" | "sea" | "cave";
export const WATER_NAMES: Record<WaterKind, string> = {
  pond: "농장 연못",
  river: "들꽃강",
  forest: "숲 호수",
  sea: "물결해안",
  cave: "광산 5층 호수",
};
export interface FishDef {
  id: string;
  name: string;
  seasons: Season[];
  waters: WaterKind[];
  from: number;
  to: number;
  weather: string;
  difficulty: number;
  price: number;
  rarity: string;
  cm: [number, number];
  color: string;
  description: string;
}
const fish = (
  id: string,
  name: string,
  seasons: Season[],
  waters: WaterKind[],
  difficulty: number,
  price: number,
  from = 360,
  to = 1440,
  weather = "any",
  color = "#a1bcaa",
): FishDef => ({
  id: `fish_${id}`,
  name,
  seasons,
  waters,
  from,
  to,
  weather,
  difficulty,
  price,
  rarity:
    difficulty >= 0.8
      ? "전설"
      : difficulty >= 0.6
        ? "희귀"
        : difficulty >= 0.4
          ? "특별"
          : "보통",
  cm: [Math.round(8 + difficulty * 20), Math.round(15 + difficulty * 95)],
  color,
  description: `${waters.map((w) => WATER_NAMES[w]).join(" · ")}에서 만나요. ${weather === "rain" ? "비 오는 날" : from >= 1080 ? "저녁의" : "물결의"} 움직임을 차분하게 따라가 보세요.`,
});
export const FISH_CATALOG: FishDef[] = [
  fish("minnow", "은물송사리", ALL_SEASONS, ["pond", "river"], 0.12, 22),
  fish(
    "crucian",
    "둥근붕어",
    ["spring", "summer", "autumn"],
    ["pond"],
    0.25,
    40,
  ),
  fish("carp", "금비늘잉어", ["spring", "autumn"], ["pond", "river"], 0.48, 85),
  fish(
    "catfish",
    "빗방울메기",
    ["summer", "autumn"],
    ["river"],
    0.56,
    120,
    900,
    1440,
    "rain",
  ),
  fish("petal", "꽃잎피라미", ["spring"], ["river"], 0.28, 48),
  fish("dew", "이슬은어", ["spring"], ["forest"], 0.36, 65, 360, 720),
  fish("jade", "비취송어", ["spring"], ["forest"], 0.62, 145),
  fish("blossom", "벚빛도미", ["spring"], ["sea"], 0.53, 110),
  fish("sunfin", "해지느러미", ["summer"], ["pond"], 0.34, 60),
  fish("ribbon", "푸른리본고기", ["summer"], ["sea"], 0.56, 130),
  fish("glass", "유리빙어", ["summer"], ["forest"], 0.43, 95),
  fish("lantern", "등불장어", ["summer"], ["river"], 0.72, 200, 1080),
  fish("amber", "호박비늘어", ["autumn"], ["pond"], 0.38, 80),
  fish("maple", "단풍송어", ["autumn"], ["river"], 0.52, 115),
  fish("mist", "안개농어", ["autumn"], ["sea"], 0.66, 175, 360, 720),
  fish("moon", "달그림자어", ["autumn"], ["forest"], 0.82, 320, 1080),
  fish("snow", "눈송이빙어", ["winter"], ["pond", "river"], 0.25, 55),
  fish("silver", "은서리송어", ["winter"], ["forest"], 0.48, 120),
  fish("aurora", "오로라대구", ["winter"], ["sea"], 0.65, 180),
  fish("star", "겨울별가오리", ["winter"], ["sea"], 0.88, 380, 1080),
  fish("pebble", "자갈망둑", ALL_SEASONS, ["sea"], 0.2, 32),
  fish("moss", "이끼비늘어", ALL_SEASONS, ["forest"], 0.24, 38),
  fish("cave", "동굴눈고기", ALL_SEASONS, ["cave"], 0.42, 90),
  fish("crystal", "수정꼬리어", ALL_SEASONS, ["cave"], 0.84, 350, 1080),
];
export const FISHING_SPOTS: Array<{
  area: string;
  water: WaterKind;
  x: number;
  y: number;
  w: number;
  h: number;
}> = [
  { area: "farm", water: "pond", x: 24, y: 13, w: 6, h: 2 },
  { area: "road", water: "river", x: 5, y: 4, w: 2, h: 7 },
  { area: "forest", water: "forest", x: 1, y: 15, w: 5, h: 3 },
  { area: "coast", water: "sea", x: 5, y: 9, w: 20, h: 3 },
  { area: "mine5", water: "cave", x: 16, y: 13, w: 7, h: 2 },
];
export function fishingSpot(
  area: string,
  x: number,
  y: number,
  maps?: Record<string, MapData>,
) {
  const map = maps?.[area];
  if (map?.world2) {
    const tx = Math.floor(x / 32),
      ty = Math.floor(y / 32);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (
          Math.abs(dx) + Math.abs(dy) <= 2 &&
          hasZone(map, "fishing", tx + dx, ty + dy) &&
          waterTerrain(terrainAt(map, tx + dx, ty + dy))
        )
          return {
            area,
            water: map.world2.fishing.waterType,
            x: tx + dx,
            y: ty + dy,
            w: 1,
            h: 1,
          };
    return undefined;
  }
  return FISHING_SPOTS.find(
    (s) =>
      s.area === area &&
      x / 32 >= s.x &&
      x / 32 < s.x + s.w &&
      y / 32 >= s.y &&
      y / 32 < s.y + s.h,
  );
}
export const ANIMALS = {
  chicken: {
    name: "달걀닭",
    price: 100,
    produce: "egg",
    asset: "chicken",
    icon: "🐔",
  },
  cow: {
    name: "햇살젖소",
    price: 650,
    produce: "milk",
    asset: "animal_cow",
    icon: "🐄",
  },
  sheep: {
    name: "구름양",
    price: 450,
    produce: "wool",
    asset: "animal_sheep",
    icon: "🐑",
  },
} as const;
export const DECORATIONS = {
  decor_planter: { name: "꽃 화분", asset: "flower_bed", price: 45, wood: 2 },
  decor_bench: { name: "산책 벤치", asset: "bench", price: 75, wood: 5 },
  decor_lamp: {
    name: "별빛 가로등",
    asset: "rustic_lamp",
    price: 100,
    wood: 5,
  },
  decor_fence: {
    name: "정원 울타리",
    asset: "fence_horizontal",
    price: 25,
    wood: 2,
  },
  decor_scarecrow: {
    name: "리본 허수아비",
    asset: "decor_scarecrow",
    price: 60,
    wood: 4,
  },
} as const;
export const FESTIVALS = [
  {
    id: "petal_letters",
    season: "spring",
    day: 12,
    name: "꽃편지의 날",
    npc: "haneul",
    from: 600,
    to: 1260,
    color: "#f4b7c7",
    gift: "dewflower_seed",
    quantity: 5,
    description:
      "서로에게 작은 꽃편지를 건네는 광장 행사. 하늘 할아버지가 당신의 편지를 기다려요.",
  },
  {
    id: "lantern_tide",
    season: "summer",
    day: 18,
    name: "물결등불 밤",
    npc: "haneul",
    from: 1080,
    to: 1430,
    color: "#efc266",
    gift: "herb_tea",
    quantity: 3,
    description:
      "광장에 등을 켜고 올해의 소원을 나눠요. 밤 낚시 이야기도 들을 수 있어요.",
  },
  {
    id: "golden_table",
    season: "autumn",
    day: 20,
    name: "황금식탁 잔치",
    npc: "haneul",
    from: 660,
    to: 1320,
    color: "#df9a59",
    gift: "harvest_stew",
    quantity: 3,
    description:
      "한 해의 수확을 축하하는 긴 식탁. 작은 농장도 잔치의 주인공이에요.",
  },
  {
    id: "snow_wishes",
    season: "winter",
    day: 16,
    name: "눈별 소원제",
    npc: "haneul",
    from: 900,
    to: 1380,
    color: "#b8d7ee",
    gift: "winterstar_seed",
    quantity: 5,
    description:
      "눈별 장식을 나무에 달고 새봄을 기다려요. 따뜻한 인사와 선물이 있어요.",
  },
] as const;
export function festivalOn(day: number) {
  const c = calendar(day);
  return FESTIVALS.find((f) => f.season === c.season && f.day === c.day);
}
export const QUESTS = [
  {
    id: "first_soil",
    title: "흙과 첫인사",
    text: "괭이로 밭 3칸을 갈아 보세요",
    stat: "till",
    goal: 3,
    gold: 40,
  },
  {
    id: "first_seed",
    title: "작은 약속",
    text: "계절 씨앗을 3개 심으세요",
    stat: "plant",
    goal: 3,
    gold: 50,
  },
  {
    id: "water_song",
    title: "물방울의 노래",
    text: "작물에 5번 물을 주세요",
    stat: "water",
    goal: 5,
    gold: 50,
  },
  {
    id: "first_harvest",
    title: "우리 집 첫 수확",
    text: "작물 3개를 수확하세요",
    stat: "harvest",
    goal: 3,
    gold: 100,
  },
  {
    id: "first_fish",
    title: "손끝의 물결",
    text: "낚시로 물고기를 1마리 낚으세요",
    stat: "fish",
    goal: 1,
    gold: 90,
  },
  {
    id: "mine_light",
    title: "돌 속의 빛",
    text: "바위 3개를 깨세요",
    stat: "mine",
    goal: 3,
    gold: 75,
  },
  {
    id: "neighbours",
    title: "이웃이 되는 일",
    text: "주민과 4번 인사하세요 (하루 각 1회)",
    stat: "talk",
    goal: 4,
    gold: 70,
  },
  {
    id: "forest_basket",
    title: "산책 바구니",
    text: "채집물 6개를 채집하세요",
    stat: "gather",
    goal: 6,
    gold: 80,
  },
  {
    id: "animal_friend",
    title: "포근한 가족",
    text: "동물을 3번 쓰다듬으세요",
    stat: "pet",
    goal: 3,
    gold: 80,
  },
] as const;
