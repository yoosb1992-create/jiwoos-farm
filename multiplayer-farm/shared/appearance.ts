/** Cosmetics never participate in movement, collision, reach or game rules. */
export const APPEARANCE_OPTIONS = {
  gender: { male: "남성형", female: "여성형" },
  hair: { original: "기본 머리", short: "짧은 머리", parted: "가르마", bob: "단발", long: "장발", wave: "웨이브", ponytail: "포니테일", bun: "묶은 머리" },
  hairColor: { original: "밤갈색", black: "먹빛", chestnut: "초코", gold: "꿀빛", silver: "은빛", rose: "장밋빛", sage: "세이지" },
  skinColor: { peach: "복숭아", porcelain: "밝은 살구", warm: "따뜻한 베이지", tan: "햇살빛", brown: "갈색", deep: "깊은 갈색", umber: "짙은 갈색" },
  eyeShape: { original: "기본 눈", round: "동그란 눈", large: "큰 눈", narrow: "가늘고 긴 눈", gentle: "살짝 처진 눈", sharp: "날카로운 눈" },
  eyeColor: { black: "검정", brown: "갈색", blue: "파랑", green: "초록", gray: "회색", amber: "호박색" },
  eyebrowStyle: { original: "기본 눈썹", straight: "일자 눈썹", round: "둥근 눈썹", raised: "올라간 눈썹", gentle: "처진 눈썹" },
  noseStyle: { original: "기본 코", small: "작은 코", round: "둥근 코", pointed: "뾰족한 코", long: "살짝 긴 코" },
  earStyle: { normal: "일반 귀", small: "작은 귀", large: "큰 귀", pointed: "뾰족한 귀", long: "길고 뾰족한 귀" },
  top: { original: "기본 작업복", cream: "크림", sage: "풀잎", blue: "하늘", rose: "장미", plum: "자두", ochre: "해바라기" },
  bottom: { original: "기본 바지", denim: "청바지", charcoal: "차콜", cream: "크림", forest: "숲색" },
  shoeStyle: { boots: "기본 농장 부츠", sneakers: "운동화", wellies: "고무장화", sandals: "샌들" },
  shoeColor: { original: "기본 갈색", brown: "가죽색", red: "벽돌색", blue: "남색", cream: "아이보리" },
} as const;
export const COLOR_PALETTES = {
  hairColor: { original: "#845039", black: "#343342", chestnut: "#624132", gold: "#d9ac62", silver: "#bbc3cd", rose: "#b27388", sage: "#809578" },
  skinColor: { peach: "#efb58e", porcelain: "#f7d5b5", warm: "#dca779", tan: "#c18b60", brown: "#a96e49", deep: "#805238", umber: "#593a2d" },
  eyeColor: { black: "#292936", brown: "#794a2d", blue: "#438ac2", green: "#528a52", gray: "#87989d", amber: "#be842e" },
  top: { original: "#94714a", cream: "#dfc99a", sage: "#8ca36b", blue: "#719fb7", rose: "#c58085", plum: "#9678a5", ochre: "#cdac56" },
  bottom: { original: "#745236", denim: "#547f99", charcoal: "#54545f", cream: "#ccbca0", forest: "#566f56" },
  shoeColor: { original: "#62402e", brown: "#906044", red: "#a5594e", blue: "#445b80", cream: "#cfc3ac" },
} as const;
export type AppearanceField = keyof typeof APPEARANCE_OPTIONS;
export type ColorSlot = keyof typeof COLOR_PALETTES | "eyebrowColor";
/** Palette tokens remain stable. Optional sRGB overrides are the extension
 * point for future RGB/HSV editors; no CSS, URLs or unbounded color payloads. */
export type Appearance = { version: 2; height: number; customColors?: Partial<Record<ColorSlot,string>> }
  & { [K in AppearanceField]: keyof typeof APPEARANCE_OPTIONS[K] };
export const HEIGHT_MIN=70, HEIGHT_MAX=145, HEIGHT_STEP=5;
export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  version: 2, gender: "male", height: 100, hair: "original", hairColor: "original", skinColor: "peach",
  eyeShape: "original", eyeColor: "brown", eyebrowStyle: "original", noseStyle: "original", earStyle: "normal",
  top: "original", bottom: "original", shoeStyle: "boots", shoeColor: "original",
});
const LEGACY_HEIGHT = { short:90, normal:100, tall:110 } as const;
const legacyFields=["gender","height","hair","hairColor","top","bottom","shoes"];
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const valid=(options:object,v:unknown):v is string=>typeof v==="string"&&Object.hasOwn(options,v);
export function parseAppearance(value: unknown): Appearance {
  if(!record(value))throw Error("외형 정보가 올바르지 않습니다");
  let a=value;
  if(a.version===1){
    if(Object.keys(a).some(k=>k!=="version"&&!legacyFields.includes(k))||!valid(LEGACY_HEIGHT,a.height)||!valid(APPEARANCE_OPTIONS.shoeColor,a.shoes))throw Error("허용되지 않은 이전 외형입니다");
    for(const k of ["gender","hair","hairColor","top","bottom"] as const)if(!valid(APPEARANCE_OPTIONS[k],a[k]))throw Error("허용되지 않은 이전 외형입니다");
    a={...DEFAULT_APPEARANCE,...a,version:2,height:LEGACY_HEIGHT[a.height as keyof typeof LEGACY_HEIGHT],shoeColor:a.shoes};
    delete a.shoes;
  }
  if(a.version!==2||Object.keys(a).some(k=>!["version","height","customColors"].includes(k)&&!Object.hasOwn(APPEARANCE_OPTIONS,k)))throw Error("지원하지 않는 외형 버전/항목입니다");
  if(typeof a.height!=="number"||!Number.isFinite(a.height)||a.height<HEIGHT_MIN||a.height>HEIGHT_MAX||a.height%HEIGHT_STEP!==0)throw Error("키는 70~145%, 5% 간격으로 선택해 주세요");
  const result={...DEFAULT_APPEARANCE,height:a.height} as Appearance;
  for(const [key,options] of Object.entries(APPEARANCE_OPTIONS)){
    if(!valid(options,a[key]))throw Error("허용되지 않은 외형 옵션입니다");
    (result as unknown as Record<string,unknown>)[key]=a[key];
  }
  if(a.customColors!==undefined){
    if(!record(a.customColors))throw Error("색상 정보가 올바르지 않습니다");
    const colors:Partial<Record<ColorSlot,string>>={};
    for(const key of [...Object.keys(COLOR_PALETTES),"eyebrowColor"] as ColorSlot[]){
      if(!Object.hasOwn(a.customColors,key))continue;
      const c=a.customColors[key];
      if(typeof c!=="string"||!/^#[\da-f]{6}$/i.test(c))throw Error("허용되지 않은 색상입니다");
      colors[key]=c.toLowerCase();
    }
    if(Object.keys(colors).length!==Object.keys(a.customColors).length)throw Error("허용되지 않은 색상 항목입니다");
    if(Object.keys(colors).length)result.customColors=colors;
  }
  return result;
}
/** Missing saves receive defaults; v1 migrates without touching other data. */
export function appearanceOf(value?: unknown): Appearance {
  try { return parseAppearance(typeof value === "string" ? JSON.parse(value) : value); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}
export function appearanceColor(a:Appearance,slot:ColorSlot):string {
  if(a.customColors?.[slot])return a.customColors[slot]!;
  if(slot==="eyebrowColor")return appearanceColor(a,"hairColor");
  return (COLOR_PALETTES[slot] as Record<string,string>)[a[slot]]!;
}
/** Height is a transform, so moving its slider never allocates new textures. */
export const appearanceKey=(a:Appearance):string=>Object.keys(APPEARANCE_OPTIONS).map(k=>a[k as AppearanceField]).join("-")+
  Object.keys(COLOR_PALETTES).concat("eyebrowColor").map(k=>a.customColors?.[k as ColorSlot]??"").join(".");
