/** Cosmetic-only v1 data. No option is used by movement, collision or actions. */
export const APPEARANCE_OPTIONS = {
  gender: { male: "남성형", female: "여성형" },
  height: { short: "작은 키", normal: "보통 키", tall: "큰 키" },
  hair: { original: "기본 머리", short: "짧은 머리", parted: "단정한 가르마", bob: "단발", long: "장발", wave: "웨이브", ponytail: "포니테일", bun: "묶은 머리" },
  hairColor: { original: "밤갈색", black: "먹빛", chestnut: "초코", gold: "꿀빛", silver: "은빛", rose: "장밋빛", sage: "세이지" },
  top: { original: "기본 작업복", cream: "크림", sage: "풀잎", blue: "하늘", rose: "장미", plum: "자두", ochre: "해바라기" },
  bottom: { original: "기본 바지", denim: "청바지", charcoal: "차콜", cream: "크림", forest: "숲색" },
  shoes: { original: "기본 부츠", brown: "가죽 부츠", red: "벽돌색", blue: "남색", cream: "아이보리" },
} as const;
export type Appearance = { version: 1 } & { [K in keyof typeof APPEARANCE_OPTIONS]: keyof typeof APPEARANCE_OPTIONS[K] };
export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({ version: 1, gender: "male", height: "normal", hair: "original", hairColor: "original", top: "original", bottom: "original", shoes: "original" });
export const HEIGHT_SCALE = { short: .9, normal: 1, tall: 1.12 } as const;
export function parseAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("외형 정보가 올바르지 않습니다");
  const a = value as Record<string, unknown>;
  if (a.version !== 1 || Object.keys(a).some(k => k !== "version" && !Object.hasOwn(APPEARANCE_OPTIONS,k))) throw Error("지원하지 않는 외형 버전/항목입니다");
  for (const [key, options] of Object.entries(APPEARANCE_OPTIONS))
    if (typeof a[key] !== "string" || !Object.hasOwn(options, a[key] as string)) throw Error("허용되지 않은 외형 옵션입니다");
  return { version: 1, gender: a.gender, height: a.height, hair: a.hair, hairColor: a.hairColor, top: a.top, bottom: a.bottom, shoes: a.shoes } as Appearance;
}
/** Old saves keep the exact original farmer; malformed saves fail safely. */
export function appearanceOf(value?: unknown): Appearance {
  try { return parseAppearance(typeof value === "string" ? JSON.parse(value) : value); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}
export const appearanceKey = (a: Appearance): string => [a.gender,a.hair,a.hairColor,a.top,a.bottom,a.shoes].join("-");
