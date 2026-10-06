import "./style.css";
import { html } from "./ui.js";
import {
  ASSETS,
  NPCS,
  ITEMS,
  TILE,
  type MapData,
  type MapObject,
  type Rect,
} from "../../shared/content.js";
import { validateLayout, type WorldLayout } from "../../shared/layout.js";
import {
  TERRAIN,
  TERRAIN_NAMES,
  LAYERS,
  SEASONS,
  ZONES,
  cell,
  setCell,
  terrainAt,
  terrainCode,
  waterTerrain,
  tileHash,
  newWorld2,
  migrateMap,
  invalidateObjectIndex,
  nearbyObjects,
  objectVisible,
  inRect,
  hasZone,
  type CellLayer,
  type SeasonKey,
  type ZoneType,
  type EventZone,
} from "../../shared/world2.js";
import {
  Journal,
  editorLayout,
  capture,
  line,
  flood,
  type Stamp,
} from "./model.js";
import {
  CATALOG,
  category,
  label,
  objectFor,
  drawObject,
  uid,
  builtinPrefab,
} from "./catalog.js";
import { ChunkPainter, COLORS } from "../world/terrain.js";
import { loadDraft, storeDraft } from "./storage.js";
import { serverUrl } from "../config.js";
import { findPath, type Point } from "../../shared/pathfinding.js";
import {
  collidesWithObstacle,
  applyMovement,
  frontTile,
  isFarmable,
} from "../../shared/applyMovement.js";
import { safeSpawn, insideWarp } from "../../shared/regions.js";
import {
  worldNpcSchedule,
  invalidateRoutes,
} from "../../shared/world2-runtime.js";
import {
  newWorld,
  newMember,
  type World,
  type Actor,
} from "../../shared/world.js";
import { applyAction } from "../../shared/actions.js";
import { fishingSpot } from "../../shared/expansion.js";
import type { Blueprint } from "../../shared/blueprint.js";
type Tool =
  | "pencil"
  | "eraser"
  | "rectangle"
  | "circle"
  | "line"
  | "fill"
  | "eyedropper"
  | "selection"
  | "move"
  | "paste"
  | "pan"
  | "object"
  | "forest"
  | "meadow"
  | "spawn"
  | "warp"
  | "npc"
  | "event"
  | "nav";
type Marker = { kind: "spawn" | "warp" | "event"; id: string };
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const val = (id: string) => (el(id) as HTMLInputElement).value;
const num = (id: string) => Number(val(id));
const check = (id: string) => (el(id) as HTMLInputElement).checked;
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const clone = <T>(v: T): T => structuredClone(v);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
el("editor").innerHTML = html;
const canvas = el<HTMLCanvasElement>("map-canvas"),
  ctx = canvas.getContext("2d")!,
  mini = el<HTMLCanvasElement>("minimap"),
  mc = mini.getContext("2d")!;
let layout = editorLayout(),
  journal = new Journal(layout),
  area = "farm",
  tool: Tool = "pencil",
  selectedTerrain = "grass",
  selectedAsset = "tree";
let zoom = 22,
  ox = 30,
  oy = 30,
  viewWidth = 390,
  viewHeight = 650,
  season: SeasonKey = "spring",
  activeLayer: (typeof LAYERS)[number] = "Terrain";
let selected = new Set<string>(),
  selection: Rect | undefined,
  marker: Marker | undefined,
  clipboard: Stamp | undefined,
  ghost: Rect | undefined,
  navStart: Point | undefined,
  navPath: Point[] = [];
let favorites: string[] = [],
  recent: string[] = [],
  prefabs: Stamp[] = [],
  paletteTab = "all",
  paletteLimit = 48,
  dirty = false;
let capability: { id: string; editToken: string; revision: number } | undefined;
const layerSettings: Record<
  string,
  { visible: boolean; locked: boolean; opacity: number }
> = Object.fromEntries(
  LAYERS.map((l) => [l, { visible: true, locked: false, opacity: 1 }]),
);
const painter = new ChunkPainter(16, 32),
  map = () => layout.maps[area]!;
const status = (s: string) => {
  el("status").textContent = s;
};
let raf = 0;
function render() {
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
    });
}
let draftEpoch = 0;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined,
  savingDraft = false,
  draftAgain = false;
async function autosave() {
  if (savingDraft) {
    draftAgain = true;
    return;
  }
  savingDraft = true;
  const epoch = draftEpoch;
  try {
    await storeDraft(layout);
    if (epoch === draftEpoch) dirty = false;
  } catch {
    status("기기 초안 저장 실패 · JSON 내보내기를 사용하세요.");
  } finally {
    savingDraft = false;
    if (draftAgain) {
      draftAgain = false;
      void autosave();
    }
  }
}
function changed(message = "초안 수정됨 · 5초 뒤 자동 보관") {
  draftEpoch++;
  dirty = true;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => void autosave(), 5000);
  painter.clear();
  invalidateObjectIndex(map());
  invalidateRoutes(map());
  fields(false);
  inspector();
  render();
  status(message);
}
function commit(message?: string) {
  journal.commit();
  miniVersion = "";
  changed(message);
}
function transaction(name: string, fn: () => void) {
  journal.begin(name);
  try {
    fn();
    commit();
  } catch (e) {
    journal.cancel();
    status(String(e));
    render();
  }
}
function setTool(t: Tool) {
  tool = t;
  el<HTMLSelectElement>("mode").value = t;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) =>
      b.classList.toggle("active", (b as HTMLElement).dataset.tool === t),
    );
  status(
    `${t === "object" ? label(selectedAsset) : (el<HTMLSelectElement>("mode").selectedOptions[0]?.textContent ?? t)} · ${activeLayer}`,
  );
  render();
}
const titles: Record<string, string> = {
  brush: "브러시와 도구",
  layers: "레이어",
  objects: "오브젝트",
  properties: "선택 속성",
  world: "지역 설정",
  prefabs: "템플릿",
  npc: "NPC 일정",
  save: "저장과 초기 월드",
  menu: "월드 제작 메뉴",
};
function panel(page: string) {
  el("sheet").hidden = false;
  el("sheet-title").textContent = titles[page] ?? page;
  document
    .querySelectorAll<HTMLElement>("[data-page]")
    .forEach((e) => (e.hidden = e.dataset.page !== page));
  if (page === "objects") palette();
  if (page === "properties") inspector();
  if (page === "layers") layersPanel();
  if (page === "world") fields();
  if (page === "npc") routesPanel();
  if (page === "prefabs") prefabPanel();
  if (page === "save") versionInfo();
}
function closePanel() {
  el("sheet").hidden = true;
}
function layer(l: string) {
  return layerSettings[l]!;
}
function draw() {
  handle = undefined;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = Math.min(devicePixelRatio || 1, 2);
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#526a55";
  ctx.fillRect(0, 0, viewWidth, viewHeight);
  const m = map();
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, m.width * zoom, m.height * zoom);
  ctx.clip();
  if (layer("Terrain").visible) {
    ctx.globalAlpha = layer("Terrain").opacity;
    painter.draw(ctx, m, zoom, ox, oy, viewWidth, viewHeight, season, {
      water: layer("Water").visible,
      elevation: layer("Elevation").visible,
      seasonal: layer("Seasonal").visible,
    });
    ctx.globalAlpha = 1;
  }
  const x0 = Math.max(0, Math.floor(-ox / zoom)),
    y0 = Math.max(0, Math.floor(-oy / zoom)),
    x1 = Math.min(m.width - 1, Math.ceil((viewWidth - ox) / zoom)),
    y1 = Math.min(m.height - 1, Math.ceil((viewHeight - oy) / zoom));
  const overlay =
    !sandbox &&
    (activeLayer === "Collision" ||
      activeLayer === "Zones" ||
      check("nav-debug"));
  if (overlay)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const manual = cell(m, "collision", x, y),
          z = cell(m, "zones", x, y);
        let color = "";
        if (
          (activeLayer === "Collision" && layer("Collision").visible) ||
          check("nav-debug")
        )
          color =
            manual === 1
              ? "#f4655677"
              : manual === 2
                ? "#6ddabd77"
                : collidesWithObstacle(
                      (x + 0.5) * 32,
                      (y + 0.5) * 32,
                      area,
                      layout.maps,
                    )
                  ? "#dc574855"
                  : "#7ddbab20";
        if (
          activeLayer === "Zones" &&
          layer("Zones").visible &&
          z & ZONES[val("zone-value") as ZoneType]
        )
          color = val("zone-value") === "fishing" ? "#61d3e3aa" : "#c8ed7488";
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(ox + x * zoom, oy + y * zoom, zoom, zoom);
        }
      }
  if (check("grid") && zoom >= 10 && !sandbox) {
    ctx.strokeStyle = "#30473122";
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      ctx.moveTo(ox + x * zoom, oy + y0 * zoom);
      ctx.lineTo(ox + x * zoom, oy + (y1 + 1) * zoom);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      ctx.moveTo(ox + x0 * zoom, oy + y * zoom);
      ctx.lineTo(ox + (x1 + 1) * zoom, oy + y * zoom);
    }
    ctx.stroke();
  }
  const objects = new Map<string, MapObject>();
  for (
    let cy = Math.floor((y0 - 24) / 16);
    cy <= Math.floor((y1 + 24) / 16);
    cy++
  )
    for (
      let cx = Math.floor((x0 - 24) / 16);
      cx <= Math.floor((x1 + 24) / 16);
      cx++
    )
      for (const o of nearbyObjects(m, cx * 16, cy * 16)) objects.set(o.id, o);
  for (const o of [...objects.values()].sort(
    (a, b) =>
      (a.bridge ? -10000 : a.position.tileY * 32 + (a.depth ?? 0)) -
      (b.bridge ? -10000 : b.position.tileY * 32 + (b.depth ?? 0)),
  )) {
    const l = layer(o.layer ?? "Objects");
    if (!l.visible || !objectVisible(o, season)) continue;
    if (zoom < 4) {
      ctx.fillStyle = o.layer === "Buildings" ? "#d7b479" : "#476f45";
      ctx.fillRect(
        ox + o.position.tileX * zoom - 1,
        oy + o.position.tileY * zoom - 2,
        3,
        3,
      );
      continue;
    }
    const b = drawObject(
      ctx,
      o,
      ox + o.position.tileX * zoom,
      oy + o.position.tileY * zoom,
      zoom,
      render,
      l.opacity,
    );
    if (selected.has(o.id) && !sandbox) {
      ctx.strokeStyle = "#ffe7a5";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      if (selected.size === 1) {
        ctx.fillStyle = "#fff5d5";
        ctx.beginPath();
        ctx.arc(b.x + b.width, b.y + b.height, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#47694b";
        ctx.font = "16px sans-serif";
        ctx.fillText("↔", b.x + b.width - 9, b.y + b.height + 6);
        handle = { x: b.x + b.width, y: b.y + b.height };
      }
    }
  }
  if (!sandbox) {
    if (layer("Zones").visible) {
      for (const s of m.spawns) {
        ctx.fillStyle = "#7bd9e9";
        ctx.beginPath();
        ctx.arc(
          ox + s.tileX * zoom,
          oy + s.tileY * zoom,
          Math.max(7, zoom * 0.35),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        textAt(s.id, s.tileX, s.tileY, "#e7f9ed");
      }
      for (const w of m.warps)
        rectOverlay(
          w.area,
          "#a078d566",
          `↗ ${layout.maps[w.targetMapId]?.name ?? w.targetMapId}`,
        );
    }
    if (layer("Events").visible)
      for (const e of m.world2!.events)
        rectOverlay(e.area, "#edac6966", e.name);
    if (layer("NPC").visible)
      for (const r of m.world2!.npcRoutes) {
        ctx.strokeStyle = "#ffe398";
        ctx.lineWidth = 2;
        ctx.beginPath();
        r.points.forEach((p, i) => {
          if (i) ctx.lineTo(ox + p.x * zoom, oy + p.y * zoom);
          else ctx.moveTo(ox + p.x * zoom, oy + p.y * zoom);
        });
        ctx.stroke();
        r.points.forEach((p) => {
          ctx.fillStyle = "#fff5ad";
          ctx.fillRect(ox + p.x * zoom - 5, oy + p.y * zoom - 5, 10, 10);
          textAt(`${r.id} ${timeText(p.minute)}`, p.x, p.y, "#fff5c4");
        });
      }
    if (selection) rectOverlay(selection, "#dced9722", "선택 영역");
    if (ghost) rectOverlay(ghost, "#fff2b04d", "");
  }
  if (navPath.length) {
    ctx.strokeStyle = "#fff0a3";
    ctx.lineWidth = 3;
    ctx.beginPath();
    navPath.forEach((p, i) =>
      i
        ? ctx.lineTo(ox + (p.x / 32) * zoom, oy + (p.y / 32) * zoom)
        : ctx.moveTo(ox + (p.x / 32) * zoom, oy + (p.y / 32) * zoom),
    );
    ctx.stroke();
  }
  if (layer("NPC").visible) {
    for (const npc of NPCS) {
      const s = worldNpcSchedule(npc, 1, num("time"), layout.maps);
      if (s.mapId !== area) continue;
      ctx.fillStyle = "#e9c790";
      ctx.beginPath();
      ctx.arc(
        ox + s.from.x * zoom,
        oy + s.from.y * zoom,
        zoom * 0.28,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      textAt(npc.name, s.from.x, s.from.y, "#fff3c5");
    }
  }
  if (sandbox) {
    const p = sandbox.actor;
    ctx.fillStyle = "#f8e3ae";
    ctx.strokeStyle = "#4f6653";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(
      ox + (p.x / 32) * zoom,
      oy + (p.y / 32) * zoom - zoom * 0.35,
      zoom * 0.24,
      zoom * 0.42,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
    for (const e of Object.values(sandbox.world.entities))
      if (e.area === area && e.kind === "soil") {
        ctx.fillStyle = "#855831aa";
        ctx.fillRect(
          ox + (e.x / 32 - 0.5) * zoom,
          oy + (e.y / 32 - 0.5) * zoom,
          zoom,
          zoom,
        );
      }
  }
  ctx.restore();
  const minute = num("time");
  if (minute >= 1080) {
    ctx.fillStyle = minute >= 1260 ? "#25375566" : "#dc86532a";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  }
  if (val("weather") === "fog") {
    ctx.fillStyle = "#e5ecea66";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  } else if (val("weather") !== "clear") {
    ctx.strokeStyle = "#e4f3e8aa";
    ctx.fillStyle = "#f8faf0bb";
    for (let i = 0; i < 55; i++) {
      const x = (i * 137) % viewWidth,
        y = (i * 79) % viewHeight;
      if (val("weather") === "snow") {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 10);
        ctx.stroke();
      }
    }
  }
  drawMini();
}
function textAt(text: string, x: number, y: number, color: string) {
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#253c31aa";
  const w = ctx.measureText(text).width;
  ctx.fillRect(ox + x * zoom - w / 2 - 3, oy + y * zoom + 8, w + 6, 16);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, ox + x * zoom, oy + y * zoom + 20);
  ctx.textAlign = "left";
}
function rectOverlay(r: Rect, color: string, text: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color.replace(/..$/, "dd");
  ctx.lineWidth = 2;
  const x = ox + r.startX * zoom,
    y = oy + r.startY * zoom,
    w = (r.endX - r.startX + 1) * zoom,
    h = (r.endY - r.startY + 1) * zoom;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  if (text) textAt(text, (r.startX + r.endX + 1) / 2, r.startY, "#fffbdc");
}
let miniVersion = "";
function drawMini() {
  const m = map(),
    key = `${area}:${season}:${journal.undoStack.length}:${dirty}:${m.width}:${m.height}`;
  if (key !== miniVersion) {
    miniVersion = key;
    mc.fillStyle = "#6a855b";
    mc.fillRect(0, 0, 150, 96);
    for (let y = 0; y < 96; y += 3)
      for (let x = 0; x < 150; x += 3) {
        mc.fillStyle =
          COLORS[
            terrainAt(
              m,
              Math.min(m.width - 1, Math.floor((x / 150) * m.width)),
              Math.min(m.height - 1, Math.floor((y / 96) * m.height)),
              season,
            )
          ]!;
        mc.fillRect(x, y, 3, 3);
      }
    miniBase = mc.getImageData(0, 0, 150, 96);
  }
  if (miniBase) mc.putImageData(miniBase, 0, 0);
  mc.strokeStyle = "#fff4cf";
  mc.lineWidth = 2;
  mc.strokeRect(
    (-ox / zoom / m.width) * 150,
    (-oy / zoom / m.height) * 96,
    (viewWidth / zoom / m.width) * 150,
    (viewHeight / zoom / m.height) * 96,
  );
}
let miniBase: ImageData | undefined,
  handle: { x: number; y: number } | undefined;
function fit() {
  zoom = clamp(
    Math.min((viewWidth - 30) / map().width, (viewHeight - 30) / map().height),
    1,
    64,
  );
  ox = (viewWidth - map().width * zoom) / 2;
  oy = (viewHeight - map().height * zoom) / 2;
  render();
}
function zoomBy(factor: number, x = viewWidth / 2, y = viewHeight / 2) {
  const next = clamp(zoom * factor, 1, 72),
    p = { x: (x - ox) / zoom, y: (y - oy) / zoom };
  zoom = next;
  ox = x - p.x * zoom;
  oy = y - p.y * zoom;
  render();
}
function fields(updateInputs = true) {
  el<HTMLSelectElement>("map").innerHTML = Object.values(layout.maps)
    .map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`)
    .join("");
  el<HTMLSelectElement>("map").value = area;
  if (updateInputs) {
    (el("map-name") as HTMLInputElement).value = map().name;
    (el("width") as HTMLInputElement).value = String(map().width);
    (el("height") as HTMLInputElement).value = String(map().height);
    (el("seed") as HTMLInputElement).value = String(map().world2!.seed);
    const f = map().world2!.fishing;
    (el("water-type") as HTMLSelectElement).value = f.waterType;
    (el("fish-table") as HTMLSelectElement).value = f.table;
    (el("fish-season") as HTMLSelectElement).value = f.seasonOverride;
    (el("fish-bonus") as HTMLInputElement).value = String(f.rareFishBonus);
  }
  el<HTMLButtonElement>("undo").disabled = !journal.undoStack.length;
  el<HTMLButtonElement>("redo").disabled = !journal.redoStack.length;
}
function timeText(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
function clearSelection() {
  selected.clear();
  selection = undefined;
  marker = undefined;
  handle = undefined;
}
function cellLayer(): CellLayer {
  return activeLayer === "Water"
    ? "water"
    : activeLayer === "Elevation"
      ? "elevation"
      : activeLayer === "Collision"
        ? "collision"
        : activeLayer === "Zones"
          ? "zones"
          : activeLayer === "Seasonal"
            ? season
            : "terrain";
}
function paintAt(x: number, y: number, erase = false) {
  const m = map(),
    n = num("brush-size"),
    half = Math.floor((n - 1) / 2),
    l = cellLayer();
  if (layer(activeLayer).locked) {
    status("잠긴 레이어입니다");
    return;
  }
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      const xx = x + dx - half,
        yy = y + dy - half;
      if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height) continue;
      let value = terrainCode(selectedTerrain);
      if (l === "collision") value = num("collision-value");
      if (l === "elevation")
        value =
          selectedTerrain === "cliff"
            ? 2
            : selectedTerrain === "stairs"
              ? 3
              : selectedTerrain === "ramp"
                ? 4
                : 1;
      if (l === "zones")
        value = erase
          ? cell(m, l, xx, yy) & ~ZONES[val("zone-value") as ZoneType]
          : cell(m, l, xx, yy) | ZONES[val("zone-value") as ZoneType];
      if (l === "water" && !waterTerrain(selectedTerrain))
        value = terrainCode("water");
      journal.tile(area, l, xx, yy, erase && l !== "zones" ? 0 : value);
      if (l === "elevation")
        journal.tile(
          area,
          "terrain",
          xx,
          yy,
          erase ? 0 : terrainCode(selectedTerrain),
        );
      painter.invalidate(xx, yy);
    }
}
function natureAt(x: number, y: number) {
  if (layer("Objects").locked) return;
  const m = map(),
    n = num("brush-size");
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      const xx = x + dx - Math.floor(n / 2),
        yy = y + dy - Math.floor(n / 2);
      if (
        xx < 0 ||
        yy < 0 ||
        xx >= m.width ||
        yy >= m.height ||
        waterTerrain(terrainAt(m, xx, yy))
      )
        continue;
      const h = tileHash(m.world2!.seed, xx, yy);
      if (h % 100 >= num("density")) continue;
      const existing = m.objects.some(
        (o) =>
          Math.hypot(o.position.tileX - xx - 0.5, o.position.tileY - yy - 0.5) <
          0.8,
      );
      if (existing) continue;
      const weights =
          tool === "meadow"
            ? [0, 0, 10, 80, 10]
            : ["tree", "bush", "rock", "flower", "mushroom"].map((v) =>
                num("ratio-" + v),
              ),
        total = weights.reduce((a, b) => a + b, 0);
      let p = (h >>> 8) % Math.max(1, total),
        i = 0;
      while (i < 4 && p >= weights[i]!) {
        p -= weights[i]!;
        i++;
      }
      const assets = [
        val("tree-species"),
        CATALOG.find((a) => /bush|shrub/.test(a)) ?? "flower_bed",
        CATALOG.find((a) => /rock/.test(a)) ?? "forest_rock",
        "flower_bed",
        "mushroom",
      ];
      journal.object(area, `natural-${m.world2!.seed}-${xx}-${yy}`, {
        ...objectFor(assets[i]!, xx + 0.5, yy + 0.5),
        id: `natural-${m.world2!.seed}-${xx}-${yy}`,
      });
    }
}
function addObject(x: number, y: number) {
  if (layer(activeLayer).locked) return;
  const o = objectFor(selectedAsset, x, y);
  if (
    [
      "Objects",
      "Buildings",
      "Ground Decoration",
      "Upper Decoration",
      "Seasonal",
    ].includes(activeLayer)
  )
    o.layer = activeLayer as MapObject["layer"];
  if (activeLayer === "Seasonal") o.seasons = [season];
  journal.object(area, o.id, o);
  selected = new Set([o.id]);
  recent = [selectedAsset, ...recent.filter((a) => a !== selectedAsset)].slice(
    0,
    24,
  );
  localStorage.setItem("world2-recent", JSON.stringify(recent));
}
function pasteStamp(stamp: Stamp, x: number, y: number) {
  const group = `group-${uid()}`;
  for (const [l, dx, dy, v] of stamp.tiles)
    journal.tile(area, l, x + dx, y + dy, v);
  selected.clear();
  for (const original of stamp.objects) {
    const o = clone(original);
    o.id = `o-${uid()}`;
    o.group = group;
    o.position.tileX += x;
    o.position.tileY += y;
    if (
      o.position.tileX < 0 ||
      o.position.tileY < 0 ||
      o.position.tileX >= map().width ||
      o.position.tileY >= map().height
    )
      continue;
    journal.object(area, o.id, o);
    selected.add(o.id);
  }
  selection = {
    startX: x,
    startY: y,
    endX: Math.min(map().width - 1, x + stamp.width - 1),
    endY: Math.min(map().height - 1, y + stamp.height - 1),
  };
}
const pointers = new Map<number, { x: number; y: number }>();
let gesture:
  | {
      start: Point;
      last: Point;
      screen: Point;
      ox: number;
      oy: number;
      kind: string;
      originals: MapObject[];
      stamp?: Stamp;
      rect?: Rect;
    }
  | undefined;
let pinch:
    | { distance: number; mid: Point; zoom: number; world: Point }
    | undefined,
  suppress = false,
  longTimer: ReturnType<typeof setTimeout> | undefined;
function point(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function tilePoint(p: Point) {
  return {
    x: clamp(Math.floor((p.x - ox) / zoom), 0, map().width - 1),
    y: clamp(Math.floor((p.y - oy) / zoom), 0, map().height - 1),
  };
}
function snapped(p: Point) {
  const unit = num("snap"),
    x = (p.x - ox) / zoom,
    y = (p.y - oy) / zoom;
  return {
    x: clamp(unit ? Math.round(x / unit) * unit : x, 0, map().width - 0.01),
    y: clamp(unit ? Math.round(y / unit) * unit : y, 0, map().height - 0.01),
  };
}
function bounds(a: Point, b: Point): Rect {
  return {
    startX: Math.min(a.x, b.x),
    startY: Math.min(a.y, b.y),
    endX: Math.max(a.x, b.x),
    endY: Math.max(a.y, b.y),
  };
}
function hitObject(p: Point) {
  const tp = snapped(p);
  return [...map().objects].reverse().find((o) => {
    if (
      layer(o.layer ?? "Objects").locked ||
      !layer(o.layer ?? "Objects").visible ||
      !objectVisible(o, season)
    )
      return false;
    const a = ASSETS[o.assetId],
      w =
        o.width ??
        ((a?.frameSize?.width ?? a?.source?.frameWidth ?? 64) *
          (o.scale ?? a?.displayScale?.x ?? 1)) /
          32,
      h =
        o.height ??
        ((a?.frameSize?.height ?? a?.source?.frameHeight ?? 96) *
          (o.scale ?? a?.displayScale?.y ?? 1)) /
          32,
      origin = o.bridge
        ? { x: 0.5, y: 0.5 }
        : (a?.origin ?? { x: 0.5, y: 0.8 });
    return (
      tp.x >= o.position.tileX - w * origin.x &&
      tp.x <= o.position.tileX + w * (1 - origin.x) &&
      tp.y >= o.position.tileY - h * origin.y &&
      tp.y <= o.position.tileY + h * (1 - origin.y)
    );
  });
}
function hitMarker(p: Point): Marker | undefined {
  const t = tilePoint(p),
    s = map().spawns.find((s) => Math.hypot(s.tileX - t.x, s.tileY - t.y) < 1);
  if (s) return { kind: "spawn", id: s.id };
  const w = map().warps.find((w) => inRect(w.area, t.x, t.y));
  if (w) return { kind: "warp", id: w.id };
  const e = map().world2!.events.find((e) => inRect(e.area, t.x, t.y));
  if (e) return { kind: "event", id: e.id };
}
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.onpointerdown = (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = point(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    clearTimeout(longTimer);
    journal.cancel();
    ghost = undefined;
    suppress = true;
    gesture = undefined;
    const [a, b] = [...pointers.values()] as [Point, Point],
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid,
      zoom,
      world: { x: (mid.x - ox) / zoom, y: (mid.y - oy) / zoom },
    };
    painter.clear();
    render();
    return;
  }
  if (pointers.size !== 1 || suppress) return;
  if (sandbox) {
    const t = tilePoint(p);
    sandbox.path =
      findPath(
        area,
        sandbox.actor,
        (q) => Math.floor(q.x / 32) === t.x && Math.floor(q.y / 32) === t.y,
        layout.maps,
      ) ?? [];
    return;
  }
  const t = tilePoint(p);
  journal.begin(tool);
  gesture = { start: t, last: t, screen: p, ox, oy, kind: tool, originals: [] };
  const rawX = (p.x - ox) / zoom,
    rawY = (p.y - oy) / zoom;
  if (rawX < 0 || rawY < 0 || rawX >= map().width || rawY >= map().height) {
    gesture.kind = "pan";
    return;
  }
  if (
    (tool === "npc" && layer("NPC").locked) ||
    (tool === "event" && layer("Events").locked) ||
    (["warp", "spawn"].includes(tool) && layer("Zones").locked)
  ) {
    gesture = undefined;
    status("잠긴 레이어입니다");
    return;
  }
  longTimer = setTimeout(() => {
    if (!gesture) return;
    journal.cancel();
    const o = hitObject(p);
    clearSelection();
    if (o) selected.add(o.id);
    else marker = hitMarker(p);
    gesture = undefined;
    suppress = true;
    panel("properties");
    painter.clear();
    render();
  }, 600);
  if (tool === "selection" || tool === "move") {
    if (
      handle &&
      selected.size === 1 &&
      Math.hypot(p.x - handle.x, p.y - handle.y) < 26
    ) {
      gesture.kind = "resize";
      gesture.originals = map()
        .objects.filter((o) => selected.has(o.id))
        .map(clone);
    } else if (tool === "move" && selection && inRect(selection, t.x, t.y)) {
      gesture.kind = "region-move";
      gesture.stamp = capture(map(), selection);
      gesture.rect = clone(selection);
    } else {
      const o = hitObject(p);
      if (o) {
        if (!selected.has(o.id)) {
          clearSelection();
          selected = new Set(
            map()
              .objects.filter((v) =>
                o.group ? v.group === o.group : v.id === o.id,
              )
              .map((v) => v.id),
          );
        }
        gesture.kind = "objects";
        gesture.originals = map()
          .objects.filter((v) => selected.has(v.id))
          .map(clone);
      } else {
        clearSelection();
        marker = hitMarker(p);
        gesture.kind = marker ? "marker" : "selection";
      }
    }
  } else if (tool === "pencil" || tool === "eraser")
    paintAt(t.x, t.y, tool === "eraser");
  else if (tool === "forest" || tool === "meadow") natureAt(t.x, t.y);
  render();
};
canvas.onpointermove = (e) => {
  const p = point(e);
  if (!pointers.has(e.pointerId)) {
    const t = tilePoint(p);
    el("coordinates").textContent =
      `${t.x}, ${t.y} · ${map().width}×${map().height}`;
    return;
  }
  pointers.set(e.pointerId, p);
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()] as [Point, Point],
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    zoom = clamp(
      (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
        Math.max(1, pinch.distance),
      1,
      72,
    );
    ox = mid.x - pinch.world.x * zoom;
    oy = mid.y - pinch.world.y * zoom;
    render();
    return;
  }
  if (suppress || !gesture || sandbox) return;
  if (Math.hypot(p.x - gesture.screen.x, p.y - gesture.screen.y) > 8)
    clearTimeout(longTimer);
  const t = tilePoint(p),
    g = gesture;
  if (g.kind === "pan") {
    ox = g.ox + p.x - g.screen.x;
    oy = g.oy + p.y - g.screen.y;
  } else if (["pencil", "eraser", "forest", "meadow"].includes(g.kind)) {
    line(g.last, t, (x, y) =>
      tool === "forest" || tool === "meadow"
        ? natureAt(x, y)
        : paintAt(x, y, tool === "eraser"),
    );
  } else if (g.kind === "objects") {
    const dx = (p.x - g.screen.x) / zoom,
      dy = (p.y - g.screen.y) / zoom,
      unit = num("snap");
    for (const o of g.originals) {
      const x = clamp(o.position.tileX + dx, 0, map().width - 0.01),
        y = clamp(o.position.tileY + dy, 0, map().height - 0.01);
      journal.object(area, o.id, {
        ...o,
        position: {
          tileX: unit ? Math.round(x / unit) * unit : x,
          tileY: unit ? Math.round(y / unit) * unit : y,
        },
      });
    }
  } else if (g.kind === "resize") {
    const o = g.originals[0]!;
    journal.object(area, o.id, {
      ...o,
      width: clamp((o.width ?? 3) + (p.x - g.screen.x) / zoom, 0.25, 32),
      height: clamp((o.height ?? 4) + (p.y - g.screen.y) / zoom, 0.25, 32),
    });
  } else if (g.kind === "region-move" && g.rect) {
    const dx = t.x - g.start.x,
      dy = t.y - g.start.y;
    ghost = {
      startX: g.rect.startX + dx,
      startY: g.rect.startY + dy,
      endX: g.rect.endX + dx,
      endY: g.rect.endY + dy,
    };
  } else if (
    ["selection", "rectangle", "circle", "line", "warp", "event"].includes(
      g.kind,
    )
  )
    ghost = bounds(g.start, t);
  g.last = t;
  render();
};
function endPointer(e: PointerEvent, cancel = false) {
  clearTimeout(longTimer);
  const p = point(e);
  pointers.delete(e.pointerId);
  if (cancel) {
    journal.cancel();
    gesture = undefined;
    suppress = true;
    painter.clear();
    render();
  }
  if (!pointers.size) {
    pinch = undefined;
    if (suppress) {
      suppress = false;
      gesture = undefined;
      return;
    }
  }
  if (pinch || suppress || !gesture || sandbox) return;
  const g = gesture;
  gesture = undefined;
  const t = tilePoint(p),
    r = bounds(g.start, t);
  ghost = undefined;
  try {
    if (["rectangle", "circle", "line"].includes(g.kind)) {
      if (g.kind === "line") line(g.start, t, (x, y) => paintAt(x, y));
      else {
        const size = val("brush-size");
        (el("brush-size") as HTMLInputElement).value = "1";
        for (let y = r.startY; y <= r.endY; y++)
          for (let x = r.startX; x <= r.endX; x++) {
            if (
              g.kind === "circle" &&
              ((x - (r.startX + r.endX) / 2) /
                Math.max(0.5, (r.endX - r.startX + 1) / 2)) **
                2 +
                ((y - (r.startY + r.endY) / 2) /
                  Math.max(0.5, (r.endY - r.startY + 1) / 2)) **
                  2 >
                1
            )
              continue;
            paintAt(x, y);
          }
        (el("brush-size") as HTMLInputElement).value = size;
      }
    } else if (g.kind === "fill") {
      const size = val("brush-size");
      (el("brush-size") as HTMLInputElement).value = "1";
      flood(map(), cellLayer(), t.x, t.y, (x, y) => paintAt(x, y));
      (el("brush-size") as HTMLInputElement).value = size;
    } else if (g.kind === "eyedropper") {
      selectedTerrain = terrainAt(map(), t.x, t.y, season);
      status(
        `선택한 지형: ${TERRAIN_NAMES[TERRAIN.indexOf(selectedTerrain as (typeof TERRAIN)[number])]}`,
      );
      setTool("pencil");
    } else if (g.kind === "selection") {
      selection = r;
      selected = new Set(
        map()
          .objects.filter(
            (o) =>
              inRect(r, o.position.tileX, o.position.tileY) &&
              !layer(o.layer ?? "Objects").locked,
          )
          .map((o) => o.id),
      );
      panel("properties");
    } else if (g.kind === "marker") {
      panel("properties");
    } else if (g.kind === "region-move" && g.stamp && g.rect) {
      const dx = t.x - g.start.x,
        dy = t.y - g.start.y;
      if (dx || dy) {
        for (let y = g.rect.startY; y <= g.rect.endY; y++)
          for (let x = g.rect.startX; x <= g.rect.endX; x++)
            for (const l of [
              "terrain",
              "water",
              "elevation",
              "collision",
              "zones",
              ...SEASONS,
            ] as CellLayer[])
              journal.tile(area, l, x, y, 0);
        for (const o of g.stamp.objects) journal.object(area, o.id, undefined);
        pasteStamp(g.stamp, g.rect.startX + dx, g.rect.startY + dy);
      }
    } else if (g.kind === "object") {
      const q = snapped(p);
      addObject(q.x, q.y);
    } else if (g.kind === "paste" && clipboard) pasteStamp(clipboard, t.x, t.y);
    else if (g.kind === "spawn") {
      const s = {
        id: `spawn-${uid()}`,
        tileX: t.x + 0.5,
        tileY: t.y + 0.5,
        facing: "down",
      };
      journal.field(["maps", area, "spawns"], [...map().spawns, s]);
      marker = { kind: "spawn", id: s.id };
      panel("properties");
    } else if (g.kind === "warp") {
      const dest = Object.values(layout.maps).find((m) => m.id !== area)!;
      const w = {
        id: `warp-${uid()}`,
        area: r,
        targetMapId: dest.id,
        targetSpawnId: dest.spawns[0]!.id,
        effect: "fade",
        facing: "down",
      };
      journal.field(["maps", area, "warps"], [...map().warps, w]);
      marker = { kind: "warp", id: w.id };
      panel("properties");
    } else if (g.kind === "event") {
      const ev: EventZone = {
        id: `event-${uid()}`,
        name: "새 이벤트",
        area: r,
        trigger: "enter",
        condition: "",
        once: true,
        action: "dialogue",
        value: "어서 오세요!",
        quantity: 1,
      };
      journal.field(
        ["maps", area, "world2", "events"],
        [...map().world2!.events, ev],
      );
      marker = { kind: "event", id: ev.id };
      panel("properties");
    } else if (g.kind === "npc") {
      const id = val("npc-id"),
        points = clone(map().world2!.npcRoutes),
        route = points.find((r) => r.id === id) ?? { id, points: [] };
      if (!points.includes(route)) points.push(route);
      const [hh, mm] = val("npc-time").split(":").map(Number);
      route.points.push({
        minute: hh! * 60 + mm!,
        x: t.x + 0.5,
        y: t.y + 0.5,
        facing: val("npc-facing"),
        animation: val("npc-animation"),
        dialogue: val("npc-dialogue"),
      });
      route.points.sort((a, b) => a.minute - b.minute);
      journal.field(["maps", area, "world2", "npcRoutes"], points);
      panel("npc");
    } else if (g.kind === "nav") {
      if (!navStart) {
        navStart = { x: (t.x + 0.5) * 32, y: (t.y + 0.5) * 32 };
        status("도착 지점 B를 터치하세요.");
      } else {
        navPath =
          findPath(
            area,
            navStart,
            (q) => Math.floor(q.x / 32) === t.x && Math.floor(q.y / 32) === t.y,
            layout.maps,
          ) ?? [];
        status(
          navPath.length
            ? `경로 ${navPath.length}칸 · 이동 가능`
            : "이동할 수 있는 경로가 없습니다.",
        );
        navStart = undefined;
      }
    }
    if (journal.pending.size) commit();
    else render();
    if (
      g.kind === "objects" &&
      Math.hypot(p.x - g.screen.x, p.y - g.screen.y) < 8
    )
      panel("properties");
  } catch (e) {
    journal.cancel();
    status(String(e));
    render();
  }
}
canvas.onpointerup = (e) => endPointer(e);
canvas.onpointercancel = (e) => endPointer(e, true);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
  },
  { passive: false },
);
mini.onpointerdown = (e) => {
  e.stopPropagation();
  const r = mini.getBoundingClientRect();
  ox = viewWidth / 2 - ((e.clientX - r.left) / r.width) * map().width * zoom;
  oy = viewHeight / 2 - ((e.clientY - r.top) / r.height) * map().height * zoom;
  render();
};
function palette() {
  const q = val("search").toLowerCase(),
    cat = val("category"),
    all = CATALOG.filter(
      (id) =>
        (cat === "전체" || category(id) === cat) &&
        label(id).toLowerCase().includes(q) &&
        (paletteTab === "all" ||
          (paletteTab === "favorite" ? favorites : recent).includes(id)),
    ),
    shown = all.slice(0, paletteLimit);
  el("palette").innerHTML = shown
    .map(
      (id) =>
        `<div class="asset"><button data-asset="${esc(id)}"><canvas width="90" height="72"></canvas>${esc(label(id))}</button><button class="star" data-star="${esc(id)}" aria-label="${esc(label(id))} 즐겨찾기">${favorites.includes(id) ? "★" : "☆"}</button></div>`,
    )
    .join("");
  for (const button of el("palette").querySelectorAll<HTMLButtonElement>(
    "[data-asset]",
  )) {
    const id = button.dataset.asset!,
      c = button.querySelector("canvas")!,
      c2 = c.getContext("2d")!;
    const draw = () => {
      c2.clearRect(0, 0, 90, 72);
      const o = objectFor(id, 0, 0);
      o.width = 3.6;
      o.height = 3.6;
      drawObject(c2, o, 45, 57, 16, draw);
    };
    draw();
  }
  el("more-assets").hidden = shown.length >= all.length;
}
function layersPanel() {
  el("layer-list").innerHTML = LAYERS.map(
    (l) =>
      `<div class="layer-row"><button data-visible="${l}" aria-label="${l} 표시">${layer(l).visible ? "◉" : "○"}</button><button data-lock="${l}" aria-label="${l} 잠금">${layer(l).locked ? "🔒" : "◇"}</button><span>${l}</span><button data-focus="${l}" class="${activeLayer === l ? "active" : ""}" aria-label="${l} 편집 강조">편집</button></div>`,
  ).join("");
}
function prefabPanel() {
  el("prefabs").innerHTML = [
    ...[
      "작은 연못",
      "농사밭",
      "꽃밭",
      "숲 덩어리",
      "다리 구역",
      "앞마당",
      "목장",
      "광장",
    ].map((n) => `<button data-prefab="${n}">${n}</button>`),
    ...prefabs.map(
      (p, i) => `<button data-custom-prefab="${i}">★ ${esc(p.name)}</button>`,
    ),
  ].join(" ");
}
function routesPanel() {
  const route = map().world2!.npcRoutes.find((r) => r.id === val("npc-id"));
  el("route-list").innerHTML = (route?.points ?? [])
    .map(
      (p, i) =>
        `<div class="route"><span>${timeText(p.minute)} · ${p.x}, ${p.y} · ${esc(p.facing)}</span><button data-route-delete="${i}" aria-label="일정 지점 삭제">×</button></div>`,
    )
    .join("");
}
const input = (
  id: string,
  name: string,
  value: unknown,
  type = "text",
  extra = "",
) =>
  `<label>${name}<input id="prop-${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (
  id: string,
  name: string,
  value: string,
  options: Array<[string, string]>,
) =>
  `<label>${name}<select id="prop-${id}">${options.map(([v, n]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
const toggle = (id: string, name: string, v: boolean) =>
  `<label>${name}<input id="prop-${id}" type="checkbox" ${v ? "checked" : ""}></label>`;
function inspector() {
  const root = el("inspector"),
    o = map().objects.find((o) => selected.has(o.id));
  if (o && selected.size === 1) {
    root.innerHTML =
      `<b>${esc(label(o.assetId))}</b><small> · ${esc(o.id)}</small>` +
      input("x", "X", o.position.tileX, "number", 'step=".5"') +
      input("y", "Y", o.position.tileY, "number", 'step=".5"') +
      input(
        "width",
        "폭 (타일)",
        o.width ??
          ((ASSETS[o.assetId]?.frameSize?.width ?? 96) *
            (o.scale ?? ASSETS[o.assetId]?.displayScale?.x ?? 1)) /
            32,
        "number",
        'min=".25" max="32" step=".25"',
      ) +
      input(
        "height",
        "높이 (타일)",
        o.height ??
          ((ASSETS[o.assetId]?.frameSize?.height ?? 128) *
            (o.scale ?? ASSETS[o.assetId]?.displayScale?.y ?? 1)) /
            32,
        "number",
        'min=".25" max="32" step=".25"',
      ) +
      input(
        "rotation",
        "회전 °",
        o.rotation ?? 0,
        "number",
        'min="-360" max="360"',
      ) +
      input(
        "depth",
        "깊이 보정",
        o.depth ?? 0,
        "number",
        'min="-1000" max="1000"',
      ) +
      select(
        "layer",
        "레이어",
        o.layer ?? "Objects",
        [
          "Ground Decoration",
          "Objects",
          "Buildings",
          "Upper Decoration",
          "Seasonal",
        ].map((l) => [l, l]),
      ) +
      toggle("visible", "표시", o.visible !== false) +
      toggle("collision", "충돌", !!o.collision) +
      select(
        "season",
        "계절",
        o.seasons?.length === 1 ? o.seasons[0]! : "all",
        [
          ["all", "모든 계절"],
          ...SEASONS.map(
            (s, i) =>
              [s, ["봄", "여름", "가을", "겨울"][i]!] as [string, string],
          ),
        ],
      ) +
      input("label", "이름표", o.label ?? "") +
      (o.tree
        ? select(
            "species",
            "나무 종류",
            o.tree.species,
            CATALOG.filter((s) => s.startsWith("tree")).map((s) => [
              s,
              label(s),
            ]),
          ) +
          select(
            "stage",
            "성장 단계",
            String(o.tree.stage),
            ["새싹", "어린나무", "성목", "거목", "수호목"].map((s, i) => [
              String(i),
              s,
            ]),
          ) +
          toggle("chop", "벌목 가능", o.tree.chop) +
          toggle("stump", "그루터기", o.tree.stump) +
          toggle("regrow", "매일 재생", o.tree.regrow) +
          select(
            "drop",
            "드랍",
            o.tree.drop,
            ["wood", "stone", "pine_cone", "pine_needles"]
              .filter((s) => ITEMS[s])
              .map((s) => [s, ITEMS[s]!.name]),
          )
        : "") +
      (o.building
        ? input("home", "NPC home ID", o.building.home) +
          toggle("shadow", "그림자", o.building.shadow) +
          `<button id="building-entrance">이 건물 앞에 출입구 만들기</button>`
        : "") +
      `<button id="apply-properties">속성 적용</button>`;
    return;
  }
  if (marker) {
    const { kind, id } = marker;
    if (kind === "spawn") {
      const s = map().spawns.find((s) => s.id === id);
      if (s) {
        root.innerHTML =
          "<b>시작점</b>" +
          input("id", "ID", s.id) +
          input("x", "X", s.tileX, "number") +
          input("y", "Y", s.tileY, "number") +
          select(
            "facing",
            "방향",
            s.facing,
            ["down", "up", "left", "right"].map((s) => [s, s]),
          ) +
          '<button id="apply-properties">시작점 적용</button>';
        return;
      }
    }
    const item =
      kind === "warp"
        ? map().warps.find((w) => w.id === id)
        : map().world2!.events.find((e) => e.id === id);
    if (item) {
      let h =
        `<b>${kind === "warp" ? "출입구" : "이벤트"}</b>` +
        input("id", "ID", item.id);
      for (const [key, name] of [
        ["startX", "시작 X"],
        ["startY", "시작 Y"],
        ["endX", "끝 X"],
        ["endY", "끝 Y"],
      ] as const)
        h += input(key, name, item.area[key], "number");
      if (kind === "warp") {
        const w = item as MapData["warps"][number];
        h +=
          select(
            "destination",
            "목적 지역",
            w.targetMapId,
            Object.values(layout.maps).map((m) => [m.id, m.name]),
          ) +
          select(
            "spawn",
            "목적 시작점",
            w.targetSpawnId,
            (layout.maps[w.targetMapId]?.spawns ?? []).map((s) => [s.id, s.id]),
          ) +
          select(
            "facing",
            "방향",
            w.facing ?? "down",
            ["down", "up", "left", "right"].map((s) => [s, s]),
          ) +
          select("effect", "전환", w.effect ?? "fade", [
            ["fade", "페이드"],
            ["instant", "즉시"],
          ]);
      } else {
        const e = item as EventZone;
        h +=
          input("name", "이벤트 이름", e.name) +
          select("trigger", "조건", e.trigger, [
            ["enter", "진입"],
            ["interact", "행동"],
            ["date", "날짜 (전체 일수)"],
            ["time", "시간 (분)"],
            ["weather", "날씨"],
            ["season", "계절"],
            ["quest", "퀘스트 플래그"],
          ]) +
          input("condition", "조건 값", e.condition) +
          select("action", "행동", e.action, [
            ["dialogue", "대사"],
            ["item", "아이템 보상"],
            ["warp", "맵 이동"],
            ["quest", "퀘스트 갱신"],
            ["effect", "장식 메시지"],
          ]) +
          input("value", "대사 / 아이템 ID / 플래그", e.value) +
          input("quantity", "수량", e.quantity, "number", 'min="1" max="99"') +
          toggle("once", "월드에서 한 번 (해제: 하루 1회)", e.once) +
          select(
            "destination",
            "이동 목적지",
            e.destination ?? area,
            Object.values(layout.maps).map((m) => [m.id, m.name]),
          ) +
          select(
            "spawn",
            "이동 시작점",
            e.spawn ?? map().spawns[0]!.id,
            (layout.maps[e.destination ?? area]?.spawns ?? []).map((s) => [
              s.id,
              s.id,
            ]),
          );
      }
      root.innerHTML = h + '<button id="apply-properties">속성 적용</button>';
      return;
    }
  }
  root.innerHTML = selected.size
    ? `<b>${selected.size}개 선택</b><p>드래그로 함께 이동하거나 복사·삭제·그룹을 사용하세요.</p>`
    : selection
      ? `<b>선택 영역 ${selection.endX - selection.startX + 1}×${selection.endY - selection.startY + 1}</b><p>이동 도구는 지형과 배치물을 함께 옮깁니다.</p>`
      : "선택 도구로 배치물·출입구·이벤트를 선택하세요.";
}
function applyProperties() {
  transaction("속성", () => {
    const o = map().objects.find((o) => selected.has(o.id));
    if (o && selected.size === 1) {
      const next: MapObject = {
        ...clone(o),
        position: {
          tileX: clamp(num("prop-x"), 0, map().width - 0.01),
          tileY: clamp(num("prop-y"), 0, map().height - 0.01),
        },
        width: clamp(num("prop-width"), 0.25, 32),
        height: clamp(num("prop-height"), 0.25, 32),
        rotation: num("prop-rotation"),
        depth: num("prop-depth"),
        layer: val("prop-layer") as MapObject["layer"],
        visible: check("prop-visible"),
        seasons:
          val("prop-season") === "all" ? [] : [val("prop-season") as SeasonKey],
        label: val("prop-label"),
      };
      if (check("prop-collision"))
        next.collision = {
          x: -Math.min(240, next.width! * 12),
          y: -12,
          width: Math.min(480, next.width! * 24),
          height: 24,
        };
      else delete next.collision;
      if (next.tree)
        next.tree = {
          species: val("prop-species"),
          stage: num("prop-stage"),
          chop: check("prop-chop"),
          stump: check("prop-stump"),
          regrow: check("prop-regrow"),
          drop: val("prop-drop"),
        };
      if (next.tree && ASSETS[next.tree.species])
        next.assetId = next.tree.species;
      if (next.building)
        next.building = {
          home: val("prop-home"),
          shadow: check("prop-shadow"),
        };
      journal.object(area, o.id, next);
      return;
    }
    if (!marker) return;
    const { kind, id } = marker;
    if (kind === "spawn") {
      const list = clone(map().spawns),
        s = list.find((s) => s.id === id)!;
      s.id = val("prop-id");
      s.tileX = num("prop-x");
      s.tileY = num("prop-y");
      s.facing = val("prop-facing");
      journal.field(["maps", area, "spawns"], list);
      for (const m of Object.values(layout.maps)) {
        const ws = m.warps.map((w) =>
          w.targetMapId === area && w.targetSpawnId === id
            ? { ...w, targetSpawnId: s.id }
            : w,
        );
        journal.field(["maps", m.id, "warps"], ws);
      }
      marker.id = s.id;
      return;
    }
    const r: Rect = {
      startX: num("prop-startX"),
      startY: num("prop-startY"),
      endX: num("prop-endX"),
      endY: num("prop-endY"),
    };
    if (r.startX > r.endX || r.startY > r.endY)
      throw Error("영역 시작과 끝을 확인하세요");
    if (kind === "warp") {
      const list = clone(map().warps),
        w = list.find((w) => w.id === id)!;
      w.id = val("prop-id");
      w.area = r;
      w.targetMapId = val("prop-destination");
      w.targetSpawnId = val("prop-spawn");
      w.facing = val("prop-facing");
      w.effect = val("prop-effect");
      journal.field(["maps", area, "warps"], list);
      marker.id = w.id;
    } else {
      const list = clone(map().world2!.events),
        e = list.find((e) => e.id === id)!;
      Object.assign(e, {
        id: val("prop-id"),
        name: val("prop-name"),
        area: r,
        trigger: val("prop-trigger"),
        condition: val("prop-condition"),
        action: val("prop-action"),
        value: val("prop-value"),
        quantity: num("prop-quantity"),
        once: check("prop-once"),
        destination: val("prop-destination"),
        spawn: val("prop-spawn"),
      });
      journal.field(["maps", area, "world2", "events"], list);
      marker.id = e.id;
    }
  });
}
function deleteSelection() {
  transaction("선택 삭제", () => {
    for (const id of selected) {
      const o = map().objects.find((o) => o.id === id);
      if (o && !layer(o.layer ?? "Objects").locked)
        journal.object(area, id, undefined);
    }
    if (marker) {
      if (marker.kind === "spawn") {
        if (map().spawns.length <= 1)
          throw Error("시작점 하나는 남겨야 합니다");
        if (
          Object.values(layout.maps).some((m) =>
            m.warps.some(
              (w) => w.targetMapId === area && w.targetSpawnId === marker!.id,
            ),
          )
        )
          throw Error("이 시작점으로 연결된 출입구를 먼저 바꾸세요");
        journal.field(
          ["maps", area, "spawns"],
          map().spawns.filter((s) => s.id !== marker!.id),
        );
      } else if (marker.kind === "warp")
        journal.field(
          ["maps", area, "warps"],
          map().warps.filter((w) => w.id !== marker!.id),
        );
      else
        journal.field(
          ["maps", area, "world2", "events"],
          map().world2!.events.filter((e) => e.id !== marker!.id),
        );
    }
    clearSelection();
  });
}
function copySelection() {
  if (selection) clipboard = capture(map(), selection);
  else if (selected.size) {
    const objects = map().objects.filter((o) => selected.has(o.id)),
      x = Math.floor(Math.min(...objects.map((o) => o.position.tileX))),
      y = Math.floor(Math.min(...objects.map((o) => o.position.tileY)));
    clipboard = {
      name: "배치물",
      width: Math.ceil(
        Math.max(...objects.map((o) => o.position.tileX)) - x + 1,
      ),
      height: Math.ceil(
        Math.max(...objects.map((o) => o.position.tileY)) - y + 1,
      ),
      tiles: [],
      objects: objects.map((o) => ({
        ...clone(o),
        position: { tileX: o.position.tileX - x, tileY: o.position.tileY - y },
      })),
    };
  }
  if (clipboard)
    status(
      `복사됨 · ${clipboard.objects.length}개 배치물 / ${clipboard.tiles.length}개 레이어 타일`,
    );
}
let saving = false;
const CAP = "farm-editor-capability-v1";
function versionInfo() {
  el("version-info").textContent = capability
    ? `저장본 revision ${capability.revision} · World v${layout.worldVersion ?? "미적용"} · ${capability.id}`
    : "아직 서버 저장 전";
}
async function save(publish: boolean) {
  if (saving || sandbox || gesture) return;
  saving = true;
  el<HTMLButtonElement>("save").disabled = true;
  el<HTMLButtonElement>("publish").disabled = true;
  try {
    const valid = validateLayout(layout),
      endpoint = serverUrl().replace(/^ws/, "http");
    status(publish ? "초기 월드 적용 중…" : "서버에 저장 중…");
    if (!capability) {
      const r = await fetch(endpoint + "/api/blueprints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(valid),
        }),
        b = (await r.json()) as Blueprint & {
          editToken: string;
          error?: string;
        };
      if (!r.ok) throw Error(b.error ?? "저장 실패");
      capability = { id: b.id, editToken: b.editToken, revision: b.revision };
      localStorage.setItem(CAP, JSON.stringify(capability));
    }
    const r = await fetch(endpoint + "/api/blueprints/" + capability.id, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + capability.editToken,
        },
        body: JSON.stringify({
          layout: valid,
          revision: capability.revision,
          publish,
        }),
      }),
      b = (await r.json()) as Blueprint & { error?: string };
    if (!r.ok) throw Error(b.error ?? "서버 저장 실패");
    capability.revision = b.revision;
    localStorage.setItem(CAP, JSON.stringify(capability));
    if (publish) {
      layout.worldVersion = b.layout.worldVersion;
      layout.blueprintId = capability.id;
      localStorage.setItem("farm-active-blueprint", capability.id);
    }
    await autosave();
    versionInfo();
    status(
      publish
        ? `초기 월드 적용 완료 · World v${b.layout.worldVersion} · 새 가족 농장부터 적용`
        : `서버 저장 완료 · revision ${b.revision} · 초기 월드는 아직 변경하지 않았습니다`,
    );
  } catch (e) {
    status(e instanceof Error ? e.message : "저장 실패");
  } finally {
    saving = false;
    el<HTMLButtonElement>("save").disabled = false;
    el<HTMLButtonElement>("publish").disabled = false;
  }
}
async function replaceLayout(value: unknown) {
  const next = validateLayout(value);
  next.version = 2;
  for (const m of Object.values(next.maps)) migrateMap(m);
  layout = next;
  journal = new Journal(layout);
  area = layout.maps[area] ? area : "farm";
  clearSelection();
  miniVersion = "";
  fields();
  changed("초안을 불러왔습니다 · 서버 저장 전");
  fit();
}
let sandbox:
  | {
      world: World;
      actor: Actor;
      path: Point[];
      last: number;
      until: number;
      originArea: string;
      camera: { ox: number; oy: number; zoom: number };
      move: { x: number; y: number };
    }
  | undefined;
function startTest() {
  try {
    validateLayout(layout);
    const m = map(),
      spawn = safeSpawn(area, m.spawns[0]!.id, layout.maps),
      world = newWorld(m.world2!.seed, layout),
      member = newMember("sandbox", "테스트");
    world.members.sandbox = member;
    const actor: Actor = {
      id: "sandbox",
      area,
      x: spawn.x,
      y: spawn.y,
      facing: spawn.facing,
      running: false,
      stamina: 100,
    };
    sandbox = {
      world,
      actor,
      path: [],
      last: performance.now(),
      until: 0,
      originArea: area,
      camera: { ox, oy, zoom },
      move: { x: 0, y: 0 },
    };
    clearSelection();
    closePanel();
    el("test-controls").hidden = false;
    el("quick").hidden = true;
    el("preview-bar").style.pointerEvents = "none";
    el<HTMLSelectElement>("map").disabled = true;
    status("샌드박스 · 터치 이동 / 방향 버튼 / 행동: 농사·낚시·이벤트 확인");
    requestAnimationFrame(testFrame);
  } catch (e) {
    status(String(e));
  }
}
function testFrame(now: number) {
  if (!sandbox) return;
  const s = sandbox,
    dt = Math.min(0.05, (now - s.last) / 1000);
  s.last = now;
  let dx = s.move.x,
    dy = s.move.y;
  if (!dx && !dy && s.path.length) {
    const p = s.path[0]!,
      vx = p.x - s.actor.x,
      vy = p.y - s.actor.y,
      d = Math.hypot(vx, vy);
    if (d < 3) s.path.shift();
    else {
      dx = vx / d;
      dy = vy / d;
    }
  }
  applyMovement(s.actor, { moveX: dx, moveY: dy, run: false }, dt, layout.maps);
  s.world.minute = num("time");
  s.world.weather = val("weather");
  const w = insideWarp(map(), s.actor.x, s.actor.y);
  if (w && now > s.until) {
    try {
      const p = safeSpawn(w.targetMapId, w.targetSpawnId, layout.maps);
      s.actor.area = w.targetMapId;
      s.actor.x = p.x;
      s.actor.y = p.y;
      s.actor.facing = w.facing ?? p.facing;
      area = w.targetMapId;
      s.path = [];
      s.until = now + 1400;
      painter.clear();
      fields();
      status(`출입구 통과 → ${map().name}`);
    } catch (e) {
      status(String(e));
      s.until = now + 1400;
    }
  }
  for (const e of map().world2!.events)
    if (
      e.trigger !== "interact" &&
      inRect(e.area, Math.floor(s.actor.x / 32), Math.floor(s.actor.y / 32)) &&
      !s.world.members.sandbox!.quests[
        `event-${area}-${e.id}-${e.once ? "once" : s.world.day}`
      ]
    )
      testEvent(e.id);
  ox = viewWidth / 2 - (s.actor.x / 32) * zoom;
  oy = viewHeight / 2 - (s.actor.y / 32) * zoom;
  render();
  requestAnimationFrame(testFrame);
}
function testEvent(id: string) {
  if (!sandbox) return;
  try {
    const r = applyAction(
      sandbox.world,
      sandbox.actor,
      { actionId: uid(), type: "worldEvent", targetId: id },
      { now: Date.now(), online: ["sandbox"], votes: new Set() },
    );
    if (r.transition) {
      Object.assign(sandbox.actor, r.transition);
      area = r.transition.area;
      sandbox.path = [];
      sandbox.until = performance.now() + 1400;
      painter.clear();
      fields();
    }
    status(r.dialogue?.lines.join(" ") ?? r.message);
  } catch {
    /* unmet authored condition */
  }
}
function testAction() {
  if (!sandbox) return;
  const a = sandbox.actor,
    e = map().world2!.events.find(
      (e) =>
        e.trigger === "interact" &&
        inRect(e.area, Math.floor(a.x / 32), Math.floor(a.y / 32)),
    );
  if (e) {
    testEvent(e.id);
    return;
  }
  const t = frontTile(a);
  if (isFarmable(area, t.tileX, t.tileY, layout.maps)) {
    try {
      const r = applyAction(
        sandbox.world,
        a,
        { actionId: uid(), type: "tillTile", ...t },
        { now: Date.now(), online: ["sandbox"], votes: new Set() },
      );
      status("농사 검증: " + r.message);
    } catch (e) {
      status(String(e));
    }
    render();
    return;
  }
  const f = fishingSpot(area, a.x, a.y, layout.maps);
  if (f) {
    status(`낚시 영역 확인 · ${f.water} · ${map().world2!.fishing.table}`);
    return;
  }
  status("앞칸은 농사 영역이 아니며, 두 칸 이내 낚시 영역이 없습니다.");
}
function exitTest() {
  if (!sandbox) return;
  area = sandbox.originArea;
  ({ ox, oy, zoom } = sandbox.camera);
  sandbox = undefined;
  el("test-controls").hidden = true;
  el("quick").hidden = false;
  el("preview-bar").style.pointerEvents = "";
  el<HTMLSelectElement>("map").disabled = false;
  painter.clear();
  fields();
  render();
  status("편집기로 복귀 · 가족 농장 저장에는 영향을 주지 않았습니다.");
}
function resizeMap() {
  const m = map(),
    w = num("width"),
    h = num("height");
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 12 ||
    h < 12 ||
    w > 1024 ||
    h > 1024 ||
    w * h > 262144
  ) {
    status("12~1024 정수, 맵별 262,144타일 이하로 입력하세요");
    return;
  }
  const outside = m.objects.filter(
    (o) => o.position.tileX >= w || o.position.tileY >= h,
  ).length;
  if (
    (w < m.width || h < m.height) &&
    !confirm(
      `맵을 ${w}×${h}로 축소합니다. 경계 밖 타일과 ${outside}개 오브젝트가 잘립니다. 실행 취소로 복원할 수 있습니다. 계속할까요?`,
    )
  )
    return;
  transaction("맵 크기 변경", () => {
    for (const [key, c] of Object.entries(m.world2!.chunks)) {
      const [cx, cy] = key.split(",").map(Number);
      for (const [l, cells] of Object.entries(c.layers))
        for (const [i] of Object.entries(cells)) {
          const x = cx! * 16 + (Number(i) % 16),
            y = cy! * 16 + Math.floor(Number(i) / 16);
          if (x >= w || y >= h) journal.tile(area, l as CellLayer, x, y, 0);
        }
    }
    for (const o of [...m.objects])
      if (o.position.tileX >= w || o.position.tileY >= h)
        journal.object(area, o.id, undefined);
    const clip = (r: Rect) => ({
      startX: Math.min(r.startX, w - 1),
      endX: Math.min(r.endX, w - 1),
      startY: Math.min(r.startY, h - 1),
      endY: Math.min(r.endY, h - 1),
    });
    journal.field(
      ["maps", area, "spawns"],
      m.spawns.map((s) => ({
        ...s,
        tileX: Math.min(w - 0.5, s.tileX),
        tileY: Math.min(h - 0.5, s.tileY),
      })),
    );
    journal.field(
      ["maps", area, "warps"],
      m.warps.map((q) => ({ ...q, area: clip(q.area) })),
    );
    journal.field(
      ["maps", area, "world2", "events"],
      m.world2!.events.map((q) => ({ ...q, area: clip(q.area) })),
    );
    journal.field(
      ["maps", area, "world2", "npcRoutes"],
      m.world2!.npcRoutes.map((r) => ({
        ...r,
        points: r.points.filter((p) => p.x < w && p.y < h),
      })),
    );
    journal.field(["maps", area, "width"], w);
    journal.field(["maps", area, "height"], h);
    journal.field(["maps", area, "name"], val("map-name") || m.name);
  });
  fields();
  miniVersion = "";
  fit();
}
// One delegated UI handler; sheets never forward gestures to the canvas.
el("editor").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (
    !b ||
    (sandbox &&
      !["test-exit", "test-action", "minus", "plus"].includes(b.id) &&
      !b.dataset.walk)
  )
    return;
  if (b.dataset.panel) {
    panel(b.dataset.panel);
    return;
  }
  if (b.dataset.tool) {
    setTool(b.dataset.tool as Tool);
    if (tool === "pencil") panel("brush");
    return;
  }
  if (b.dataset.season) {
    season = b.dataset.season as SeasonKey;
    document
      .querySelectorAll("[data-season]")
      .forEach((x) => x.classList.toggle("active", x === b));
    painter.clear();
    miniVersion = "";
    render();
    return;
  }
  if (b.dataset.terrain) {
    selectedTerrain = b.dataset.terrain;
    activeLayer = waterTerrain(selectedTerrain)
      ? "Water"
      : ["cliff", "hill", "stairs", "ramp"].includes(selectedTerrain)
        ? "Elevation"
        : activeLayer === "Seasonal"
          ? "Seasonal"
          : "Terrain";
    el<HTMLSelectElement>("active-layer").value = activeLayer;
    document
      .querySelectorAll("[data-terrain]")
      .forEach((x) => x.classList.toggle("active", x === b));
    setTool("pencil");
    return;
  }
  if (b.dataset.asset) {
    selectedAsset = b.dataset.asset;
    activeLayer =
      category(selectedAsset) === "Buildings"
        ? "Buildings"
        : selectedAsset.startsWith("bridge")
          ? "Ground Decoration"
          : "Objects";
    setTool("object");
    closePanel();
    return;
  }
  if (b.dataset.star) {
    const id = b.dataset.star;
    favorites = favorites.includes(id)
      ? favorites.filter((v) => v !== id)
      : [...favorites, id];
    localStorage.setItem("world2-favorites", JSON.stringify(favorites));
    palette();
    return;
  }
  if (b.dataset.tab) {
    paletteTab = b.dataset.tab;
    document
      .querySelectorAll("[data-tab]")
      .forEach((x) => x.classList.toggle("active", x === b));
    palette();
    return;
  }
  if (b.dataset.focus) {
    activeLayer = b.dataset.focus as (typeof LAYERS)[number];
    el<HTMLSelectElement>("active-layer").value = activeLayer;
    if (activeLayer === "NPC") setTool("npc");
    else if (activeLayer === "Events") setTool("event");
    else if (
      [
        "Objects",
        "Buildings",
        "Ground Decoration",
        "Upper Decoration",
      ].includes(activeLayer)
    )
      setTool("object");
    else setTool("pencil");
    if (activeLayer === "Elevation") selectedTerrain = "hill";
    layersPanel();
    render();
    return;
  }
  if (b.dataset.visible) {
    const l = layer(b.dataset.visible);
    l.visible = !l.visible;
    layersPanel();
    painter.clear();
    render();
    return;
  }
  if (b.dataset.lock) {
    const l = layer(b.dataset.lock);
    l.locked = !l.locked;
    layersPanel();
    return;
  }
  if (b.dataset.prefab || b.dataset.customPrefab) {
    clipboard = b.dataset.prefab
      ? builtinPrefab(b.dataset.prefab)
      : prefabs[Number(b.dataset.customPrefab)];
    setTool("paste");
    closePanel();
    return;
  }
  if (b.dataset.routeDelete !== undefined) {
    transaction("NPC 지점 삭제", () => {
      const routes = clone(map().world2!.npcRoutes),
        r = routes.find((r) => r.id === val("npc-id"));
      r?.points.splice(Number(b.dataset.routeDelete), 1);
      journal.field(["maps", area, "world2", "npcRoutes"], routes);
    });
    routesPanel();
    return;
  }
  switch (b.id) {
    case "menu":
      panel("menu");
      break;
    case "close-sheet":
      closePanel();
      break;
    case "undo":
      journal.undo();
      clearSelection();
      fields();
      miniVersion = "";
      changed("실행 취소");
      break;
    case "redo":
      journal.redo();
      clearSelection();
      fields();
      miniVersion = "";
      changed("다시 실행");
      break;
    case "minus":
      zoomBy(0.8);
      break;
    case "plus":
      zoomBy(1.25);
      break;
    case "fit":
      fit();
      break;
    case "save":
      void save(false);
      break;
    case "publish":
      void save(true);
      break;
    case "new-farm":
      location.href = "/?newFarm=1";
      break;
    case "test":
      startTest();
      break;
    case "test-exit":
      exitTest();
      break;
    case "test-action":
      testAction();
      break;
    case "copy":
      copySelection();
      break;
    case "paste":
      setTool("paste");
      closePanel();
      break;
    case "delete":
      deleteSelection();
      break;
    case "apply-properties":
      applyProperties();
      break;
    case "resize":
      resizeMap();
      break;
    case "create-map": {
      const name = val("new-map-name").trim();
      if (!name) {
        status("새 지역 이름을 입력하세요.");
        break;
      }
      const id = `region-${uid()}`,
        m: MapData = {
          id,
          name,
          width: 64,
          height: 48,
          baseTileType: "grass",
          objects: [],
          spawns: [{ id: "default", tileX: 5.5, tileY: 5.5, facing: "down" }],
          warps: [],
          terrainRegions: [],
          collisionRegions: [],
          farmAreas: [],
          world2: newWorld2(),
        };
      transaction("새 지역", () => journal.field(["maps", id], m));
      area = id;
      clearSelection();
      fields();
      fit();
      status("새 지역 생성 · 출입구 도구로 다른 지역과 연결하세요.");
      break;
    }
    case "apply-seed":
      transaction("Seed 변경", () =>
        journal.field(
          ["maps", area, "world2", "seed"],
          Math.floor(clamp(num("seed"), 0, 4294967295)),
        ),
      );
      break;
    case "save-fishing":
      transaction("낚시 설정", () =>
        journal.field(["maps", area, "world2", "fishing"], {
          waterType: val("water-type"),
          table: val("fish-table"),
          seasonOverride: val("fish-season"),
          rareFishBonus: clamp(num("fish-bonus"), 0, 1),
        }),
      );
      break;
    case "nav-test":
      navStart = undefined;
      navPath = [];
      setTool("nav");
      closePanel();
      status("출발 지점 A를 터치하세요.");
      break;
    case "group":
    case "ungroup":
      transaction("그룹", () => {
        const group = b.id === "group" ? `group-${uid()}` : undefined;
        for (const o of map().objects.filter((o) => selected.has(o.id)))
          journal.object(area, o.id, { ...o, group });
      });
      break;
    case "save-prefab":
      copySelection();
      if (clipboard) {
        const name = prompt("템플릿 이름", "내 정원");
        if (name) {
          prefabs.push({ ...clone(clipboard), name: name.slice(0, 60) });
          try {
            localStorage.setItem("world2-prefabs", JSON.stringify(prefabs));
            status("내 템플릿으로 저장했습니다.");
          } catch {
            prefabs.pop();
            status("템플릿 저장 공간이 부족합니다.");
          }
        }
      }
      break;
    case "more-assets":
      paletteLimit += 48;
      palette();
      break;
    case "add-route-point":
      setTool("npc");
      closePanel();
      break;
    case "building-entrance": {
      const o = map().objects.find((o) => selected.has(o.id));
      if (!o) break;
      const dest = Object.values(layout.maps).find((m) => m.id !== area)!;
      transaction("건물 입구", () => {
        const x = clamp(Math.floor(o.position.tileX), 0, map().width - 1),
          y = clamp(Math.floor(o.position.tileY + 1), 0, map().height - 1),
          w = {
            id: `door-${uid()}`,
            area: { startX: x, endX: x, startY: y, endY: y },
            targetMapId: dest.id,
            targetSpawnId: dest.spawns[0]!.id,
          };
        journal.field(["maps", area, "warps"], [...map().warps, w]);
        selected.clear();
        marker = { kind: "warp", id: w.id };
      });
      inspector();
      break;
    }
    case "export": {
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(layout)], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "jiwoo-world-v2.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case "load-server":
      if (
        capability &&
        confirm(
          "서버 저장본으로 현재 초안을 바꿀까요? 필요하면 먼저 JSON으로 보관하세요.",
        )
      )
        void fetch(
          serverUrl().replace(/^ws/, "http") +
            "/api/blueprints/" +
            capability.id,
          { headers: { Authorization: "Bearer " + capability.editToken } },
        )
          .then(async (r) => {
            const b = (await r.json()) as Blueprint & { error?: string };
            if (!r.ok) throw Error(b.error);
            capability!.revision = b.revision;
            localStorage.setItem(CAP, JSON.stringify(capability));
            await replaceLayout(b.layout);
          })
          .catch((e) => status(String(e)));
      break;
    case "defaults":
      if (
        confirm(
          "초안을 기본 월드로 바꿀까요? 기존 가족 농장과 서버 저장본은 유지됩니다.",
        )
      )
        void replaceLayout(editorLayout());
      break;
  }
});
el("editor").addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "map") {
    area = t.value;
    clearSelection();
    navPath = [];
    painter.clear();
    miniVersion = "";
    fields();
    fit();
    return;
  }
  if (t.id === "mode") {
    setTool(t.value as Tool);
    closePanel();
  }
  if (t.id === "active-layer") {
    activeLayer = t.value as (typeof LAYERS)[number];
    render();
  }
  if (t.dataset.opacity) {
    layer(t.dataset.opacity).opacity = Number(t.value);
    render();
  }
  if (["category", "search"].includes(t.id)) {
    paletteLimit = 48;
    palette();
  }
  if (["grid", "nav-debug", "time", "weather"].includes(t.id)) render();
  if (t.id === "npc-id") routesPanel();
  if (t.id === "prop-destination") {
    el<HTMLSelectElement>("prop-spawn").innerHTML = layout.maps[
      t.value
    ]!.spawns.map((s) => `<option>${esc(s.id)}</option>`).join("");
  }
});
el("brush-size").oninput = () =>
  (el("brush-size-value").textContent =
    `${val("brush-size")} × ${val("brush-size")}`);
el("search").oninput = () => {
  paletteLimit = 48;
  palette();
};
el<HTMLInputElement>("import").onchange = async () => {
  const f = el<HTMLInputElement>("import").files?.[0];
  if (!f) return;
  try {
    if (f.size > 16 * 1024 * 1024) throw Error("16MB 이하 파일만 가져오세요");
    const parsed = validateLayout(JSON.parse(await f.text()));
    if (confirm("검증된 JSON으로 초안을 교체할까요?"))
      await replaceLayout(parsed);
  } catch (e) {
    status(String(e));
  }
  el<HTMLInputElement>("import").value = "";
};
for (const b of document.querySelectorAll<HTMLElement>("[data-walk]")) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    if (sandbox) {
      sandbox.path = [];
      sandbox.move = {
        x: b.dataset.walk === "left" ? -1 : b.dataset.walk === "right" ? 1 : 0,
        y: b.dataset.walk === "up" ? -1 : b.dataset.walk === "down" ? 1 : 0,
      };
    }
  };
  b.onpointerup = b.onpointercancel = () => {
    if (sandbox) sandbox.move = { x: 0, y: 0 };
  };
}
window.addEventListener("keydown", (e) => {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    el(e.shiftKey ? "redo" : "undo").click();
  }
  if (e.key === "Escape") sandbox ? exitTest() : closePanel();
});
window.addEventListener("pagehide", () => {
  if (dirty) void autosave();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && dirty) void autosave();
});
async function init() {
  try {
    const draft = await loadDraft(),
      legacy = localStorage.getItem("farm-editor-draft-v1");
    if (draft || legacy) {
      layout = validateLayout(draft ?? JSON.parse(legacy!));
      layout.version = 2;
      for (const m of Object.values(layout.maps)) migrateMap(m);
      journal = new Journal(layout);
    }
    const c = JSON.parse(localStorage.getItem(CAP) ?? "null");
    if (c?.id && c.editToken) capability = c;
    favorites = JSON.parse(localStorage.getItem("world2-favorites") ?? "[]");
    recent = JSON.parse(localStorage.getItem("world2-recent") ?? "[]");
    prefabs = JSON.parse(localStorage.getItem("world2-prefabs") ?? "[]");
  } catch (e) {
    status(`초안 복원 오류: ${String(e)} · 서버 저장본/JSON을 불러오세요.`);
  }
  el<HTMLSelectElement>("npc-id").innerHTML = NPCS.map(
    (n) => `<option value="${n.id}">${n.name}</option>`,
  ).join("");
  el<HTMLSelectElement>("tree-species").innerHTML = CATALOG.filter((id) =>
    id.startsWith("tree"),
  )
    .map((id) => `<option value="${id}">${esc(label(id))}</option>`)
    .join("");
  TERRAIN.forEach((t, i) =>
    document.documentElement.style.setProperty("--terrain-" + i, COLORS[t]!),
  );
  fields();
  layersPanel();
  setTool("pencil");
  new ResizeObserver(() => {
    const r = el("viewport").getBoundingClientRect();
    viewWidth = r.width;
    viewHeight = r.height;
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
    render();
  }).observe(el("viewport"));
  requestAnimationFrame(() => {
    const s = map().spawns[0]!;
    ox = viewWidth / 2 - s.tileX * zoom;
    oy = viewHeight / 2 - s.tileY * zoom;
    render();
  });
  status("초안 준비 완료 · 브러시를 눌러 월드를 만드세요.");
}
void init();
// Read-only smoke diagnostics; no credentials or production farm mutation.
Object.assign(window, {
  __WORLD_EDITOR__: {
    stats: () => ({
      area,
      width: map().width,
      height: map().height,
      chunks: Object.keys(map().world2!.chunks).length,
      cache: painter.cachedChunks,
      undo: journal.undoStack.length,
      objects: map().objects.length,
      sandbox: !!sandbox,
    }),
    screenPoint: (x: number, y: number) => ({
      x: canvas.getBoundingClientRect().left + ox + x * zoom,
      y: canvas.getBoundingClientRect().top + oy + y * zoom,
    }),
    snapshot: () => clone(layout),
  },
});
