import { TREE_SPECIES, DEBRIS, FARM_GRASS, GARDEN_FLOWERS, treeSprite, inferSpecies, treeSeasonScale, treeRootSprite } from "../../shared/nature.js";
import { ASSETS, type MapObject } from "../../shared/content.js";
import { PAINTED_SPRITES, visualSize, foliageColor } from "../../shared/art-assets.js";
import type { SeasonKey } from "../../shared/world2.js";
import type { Stamp } from "./model.js";
import { terrainCode, ZONES, tileHash } from "../../shared/world2.js";
export const uid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
export const category = (id: string) =>
  id.startsWith("tree") ? "Trees" : /flower|crop_.*_mature/.test(id) ? "Flowers" : id.startsWith("farm_") ? "Nature" :
  /bridge|reed|lily|water_rock/.test(id)
    ? "Water"
    : /house|store|shed|coop|cafe|workshop/.test(id)
      ? "Buildings"
      : /bench|lamp|sign|board|planter/.test(id)
        ? "Village"
        : /tree|bush|flower|grass|rock|mushroom|shrub|fern/.test(id)
          ? "Nature"
          : "Farm";
export const inCategory = (id: string, requested: string) =>
  requested === "전체" || category(id) === requested ||
  (requested === "Nature" && [...DEBRIS, ...FARM_GRASS].some(d => d.id === id));
const labels: Record<string, string> = {
  tree: "큰 나무",
  tree_pine: "소나무",
  tree_cherry: "벚꽃나무",
  tree_maple: "단풍나무",
  tree_birch: "자작나무",
  tree_willow: "버드나무",
  flower_daisy: "들국화",
  flower_poppy: "양귀비꽃",
  flower_bluebell: "푸른방울꽃",
  flower_lavender: "라벤더 덤불",
  farm_twig_a: "마른 나뭇가지 A",
  farm_twig_b: "마른 나뭇가지 B",
  farm_stone_a: "작은 들돌 A",
  farm_stone_b: "작은 들돌 B",
  farm_weed: "잡초",
  farm_wildflower: "야생화",
  house: "농가",
  store: "상점",
  bridge: "작은 목교",
  bridge_wide: "넓은 다리",
  bench: "벤치",
  storage_chest: "보관함",
  crafting_table: "제작대",
  stone_well: "우물",
  flower_bed: "꽃밭",
  chicken_coop: "동물 우리",
  rustic_lamp: "가로등",
  reed: "갈대",
  water_lily: "수련",
  mushroom: "버섯",
  decor_board: "안내판",
  decor_scarecrow: "허수아비",
};
export const label = (id: string) => TREE_SPECIES.find(t=>t.id===id)?.name ?? [...DEBRIS, ...FARM_GRASS].find(d=>d.id===id)?.name ?? GARDEN_FLOWERS.find(f=>f.id===id)?.name ?? PAINTED_SPRITES[id]?.name ?? labels[id] ?? id.replaceAll("_", " ");
export const CATALOG = [
  ...TREE_SPECIES.map(t=>t.id),
  ...DEBRIS.map(d=>d.id),
  ...FARM_GRASS.map(g=>g.id),
  ...GARDEN_FLOWERS.map(f=>f.id),
  ...["pinktulip","lavender","chrysanthemum","sunwheel","frostflower","dewflower","winterstar"].map(c=>`crop_${c}_mature`),
  ...Object.keys(PAINTED_SPRITES),
  ...Object.keys(ASSETS).filter(
    (id) =>
      !/^player$|^npc_|^item_|^crop_|^tile_|^icon_|^effect_|^portrait|^ground_|^ui_/.test(
        id,
      ),
  ),
  "bridge",
  "bridge_wide",
  "reed",
  "water_lily",
  "mushroom",
  "decor_board",
  "decor_scarecrow",
].filter((v, i, a) => a.indexOf(v) === i && !/^tree_.*_(seedling|young|mature|giant|guardian|summer|autumn|winter)$/.test(v));
export function objectFor(assetId: string, x: number, y: number): MapObject {
  const c = category(assetId),
    o: MapObject = {
      id: `o-${uid()}`,
      assetId,
      position: { tileX: x, tileY: y },
      layer: c === "Buildings" ? "Buildings" : "Objects",
      visible: true,
    };
  if (assetId.startsWith("bridge")) {
    o.bridge = true;
    o.width = assetId === "bridge" ? 2 : 4;
    o.height = 5;
    o.layer = "Ground Decoration";
  } else if (assetId.startsWith("tree")) {
    o.kind = "tree";
    o.tree = {
      species: inferSpecies(assetId),
      planted: false,
      stage: 2,
      chop: true,
      stump: false,
      regrow: false,
      drop: "",
    };
  } else if (c === "Buildings") {
    o.width = 7;
    o.height = 7;
    o.collision = { x: -80, y: -28, width: 160, height: 64 };
    o.building = { home: "", shadow: true };
  } else if (assetId === "storage_chest") o.kind = "chest";
  else if (assetId === "crafting_table") o.kind = "craft";
  else if (assetId === "stone_well") o.kind = "well";
  const debris=[...DEBRIS, ...FARM_GRASS].find(d=>d.id===assetId);
  if(debris) o.kind=debris.kind;
  return o;
}
export const images = new Map<string, HTMLImageElement>();
const seasonalImages = new Map<string, HTMLCanvasElement>();
const rootImages = new Map<string, HTMLCanvasElement>();
function rootImage(id: string, ready: () => void) {
  const image=spriteImage(id,ready);
  if(!image?.complete || !image.naturalWidth)return;
  let canvas=rootImages.get(id);
  if(canvas)return canvas;
  canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext("2d")!,fade=ctx.createLinearGradient(0,0,0,canvas.height);
  ctx.drawImage(image,0,0);
  fade.addColorStop(0,"transparent");fade.addColorStop(.78,"transparent");
  fade.addColorStop(.9,"black");fade.addColorStop(1,"black");
  ctx.globalCompositeOperation="destination-in";ctx.fillStyle=fade;ctx.fillRect(0,0,canvas.width,canvas.height);
  rootImages.set(id,canvas);return canvas;
}
function seasonImage(id: string, image: HTMLImageElement, season: SeasonKey) {
  const color = foliageColor(id, season);
  if (color === 0xffffff) return image;
  const key = `${id}:${season}`;
  let canvas = seasonalImages.get(key);
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const c = canvas.getContext("2d")!;
  c.drawImage(image, 0, 0);
  c.globalCompositeOperation = "multiply";
  c.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(image, 0, 0);
  seasonalImages.set(key, canvas);
  if (seasonalImages.size > 32) seasonalImages.delete(seasonalImages.keys().next().value!);
  return canvas;
}
export function spriteImage(id: string, ready: () => void) {
  const src = ASSETS[id]?.source;
  if (!src) return;
  let img = images.get(id);
  if (!img) {
    img = new Image();
    img.onload = ready;
    img.onerror = () => {
      if (src.fallbackPath && img!.src !== new URL(src.fallbackPath, location.href).href)
        img!.src = src.fallbackPath;
    };
    img.src = src.path;
    images.set(id, img);
  }
  return img;
}
export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: MapObject,
  x: number,
  y: number,
  zoom: number,
  ready: () => void,
  alpha = 1,
  season: SeasonKey = "spring",
) {
  const art = o.tree?.stump ? "stump" : o.tree ? treeSprite(inferSpecies(o.tree.species),o.tree.stage,season) : o.assetId.startsWith("tree") ? treeSprite(inferSpecies(o.assetId),2,season) : o.assetId;
  const a = ASSETS[art],
    img = spriteImage(art, ready),
    fw = a?.source?.frameWidth ?? img?.naturalWidth ?? 64,
    fh = a?.source?.frameHeight ?? img?.naturalHeight ?? 96;
  const stage = o.tree && !o.tree.stump ? treeSeasonScale(inferSpecies(o.tree.species),o.tree.stage,season) : 1;
  const logical = visualSize(a, o.scale),
    w = (o.tree ? logical.width * stage / 32 : o.width ?? logical.width / 32) * zoom,
    h = (o.tree ? logical.height * stage / 32 : o.height ?? logical.height / 32) * zoom,
    origin = o.bridge ? { x: 0.5, y: 0.5 } : (a?.origin ?? { x: 0.5, y: 0.8 });
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(((o.rotation ?? 0) * Math.PI) / 180);
  if (o.building?.shadow) {
    ctx.fillStyle = "#28372e26";
    ctx.beginPath();
    ctx.ellipse(0, zoom * 0.15, w * 0.5, zoom * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (img?.complete && img.naturalWidth)
    ctx.drawImage(seasonImage(art, img, season), 0, 0, fw, fh, -w * origin.x, -h * origin.y, w, h);
  else if (o.bridge) {
    ctx.fillStyle = "#b68b58";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = "#73583b";
    ctx.lineWidth = zoom * 0.09;
    for (let i = -h / 2; i < h / 2; i += zoom * 0.45) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, i);
      ctx.lineTo(w / 2, i);
      ctx.stroke();
    }
    ctx.lineWidth = zoom * 0.16;
    for (const xx of [-w * 0.45, w * 0.45]) {
      ctx.beginPath();
      ctx.moveTo(xx, -h / 2);
      ctx.lineTo(xx, h / 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle =
      o.assetId === "mushroom"
        ? "#b76756"
        : o.assetId === "water_lily"
          ? "#95b77a"
          : "#648354";
    ctx.beginPath();
    ctx.ellipse(0, -zoom * 0.3, zoom * 0.48, zoom * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.assetId === "reed") {
      ctx.strokeStyle = "#6e8050";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * zoom * 0.2, 0);
        ctx.lineTo(i * zoom * 0.25, -zoom * 1.3);
        ctx.stroke();
      }
    }
  }
  const rootId=o.tree && !o.tree.stump ? treeRootSprite(inferSpecies(o.tree.species),o.tree.stage,season) : undefined;
  if(rootId) {
    const root=rootImage(rootId,ready), size=visualSize(ASSETS[rootId],o.scale);
    if(root) {
      const rw=size.width/32*zoom,rh=size.height/32*zoom;
      ctx.drawImage(root,-rw*.5,-rh*.94,rw,rh);
    }
  }
  ctx.restore();
  return { x: x - w * origin.x, y: y - h * origin.y, width: w, height: h };
}
export function builtinPrefab(name: string): Stamp {
  const s: Stamp = { name, width: 12, height: 10, tiles: [], objects: [] };
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      const inside = ((x - 5.5) / 4) ** 2 + ((y - 4.5) / 3) ** 2 < 1,
        h = tileHash(7, x, y);
      if (name.includes("연못") && inside) {
        s.tiles.push(
          ["water", x, y, terrainCode("water")],
          ["zones", x, y, ZONES.fishing],
        );
        if (x === 5) s.tiles.push(["collision", x, y, 2]);
      }
      if (name === "농사밭" && x > 1 && x < 10 && y > 1 && y < 8)
        s.tiles.push(
          ["terrain", x, y, terrainCode("soil")],
          ["zones", x, y, ZONES.farmable],
        );
      if (name === "광장" && x > 0 && x < 11 && y > 0 && y < 9)
        s.tiles.push(["terrain", x, y, terrainCode("stone_path")]);
      if (name === "꽃밭" && h % 5 === 0)
        s.objects.push(objectFor("flower_bed", x + 0.5, y + 0.5));
      if (name === "숲 덩어리" && h % 12 === 0)
        s.objects.push(objectFor("tree", x + 0.5, y + 0.5));
    }
  if (name.includes("연못") || name === "다리 구역")
    s.objects.push(
      objectFor("bridge", 5.5, 4.5),
      objectFor("reed", 2, 3),
      objectFor("water_lily", 4, 4),
    );
  if (name === "앞마당")
    s.objects.push(
      objectFor("house", 6, 4),
      objectFor("flower_bed", 3, 6),
      objectFor("bench", 8, 7),
    );
  if (name === "목장")
    s.objects.push(
      objectFor("chicken_coop", 6, 4),
      objectFor("fence_horizontal", 3, 7),
    );
  if (name === "광장")
    s.objects.push(objectFor("bench", 3, 3), objectFor("rustic_lamp", 9, 3));
  return s;
}
