import "./style.css";
import {
  ASSETS,
  type MapData,
  type MapObject,
  type Rect,
} from "../../shared/content.js";
import {
  defaultLayout,
  validateLayout,
  FIXTURE_KINDS,
  GENERATED_ASSETS,
  type WorldLayout,
} from "../../shared/layout.js";
import type { Blueprint } from "../../shared/blueprint.js";
import { serverUrl } from "../config.js";

type Layer = "object" | "terrain" | "farm" | "collision" | "spawn" | "warp";
type Selection = { layer: Layer; index: number };
type Tool = Layer | "select" | "pan";
type Capability = { id: string; editToken: string; revision: number };
const DRAFT = "farm-editor-draft-v1",
  CAP = "farm-editor-capability-v1";
const app = document.querySelector<HTMLDivElement>("#editor")!;
app.innerHTML = `<header><a href="/">← 농장</a><strong>월드 편집기</strong><select id="map" aria-label="편집 지역"></select><button id="save">저장</button><button id="publish">초기 월드 적용</button></header>
<div id="tools"><select id="mode" aria-label="편집 도구"><option value="select">선택 / 이동</option><option value="pan">화면 이동</option><option value="object">오브젝트 배치</option><option value="terrain">바닥 영역</option><option value="farm">농사 영역</option><option value="collision">충돌 영역</option><option value="spawn">Spawn</option><option value="warp">출입구</option></select><select id="asset" aria-label="배치 에셋"></select><select id="tile" aria-label="바닥 타일"><option value="grass">잔디</option><option value="path">길</option><option value="dirt">흙</option><option value="water">물</option><option value="wood_floor">나무 바닥</option><option value="stone_floor">돌 바닥</option><option value="mine_floor">광산 바닥</option></select><button id="undo">↶ 취소</button><button id="redo">↷ 복원</button><button id="copy">복사</button><button id="delete">삭제</button><button id="minus">−</button><button id="plus">＋</button><button id="fit">전체 보기</button></div>
<main><div id="viewport"><canvas id="map-canvas" aria-label="월드 편집 캔버스"></canvas><span class="legend">초록 농사 · 빨강 충돌 · 보라 출입구 · 파랑 Spawn<br>선택 후 드래그 이동 / 우하단 손잡이 크기 변경 · 두 손가락 이동/확대</span></div><aside><details open><summary>선택 속성</summary><div id="inspector">맵의 오브젝트나 영역을 선택하세요.</div></details><details><summary>맵 설정 · 크기 적용</summary><label>이름 <input id="map-name" maxlength="60"></label><label>가로 타일 <input id="width" type="number" min="12" max="128"></label><label>세로 타일 <input id="height" type="number" min="12" max="128"></label><button id="resize">맵 크기 적용</button><small>숫자만 입력하면 바뀌지 않습니다. 축소 시 영역과 배치를 맵 안으로 보정합니다.</small></details><details><summary>설계도 보관 · 안내</summary><p>이 편집기는 새 농장 설계도만 관리합니다. 플레이 중인 가족 농장은 바뀌지 않습니다.</p><p>저장 → 초기 월드 적용 → 새 가족 농장 만들기 순서로 사용하세요. 변경 후 다시 적용해야 새 농장에 반영됩니다.</p><button id="new-farm">새 가족 농장 만들기</button><button id="export">JSON 내보내기</button><label class="file">JSON 가져오기 <input id="import" type="file" accept="application/json,.json"></label><button id="defaults">기본 설계도 복원</button><p>초안은 이 브라우저에도 보관됩니다. 서버 저장은 이 기기의 편집 키로 보호합니다. JSON에는 비밀 키를 넣지 않습니다.</p></details></aside></main><footer id="status" role="status">준비 중…</footer>`;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("map-canvas"),
  ctx = canvas.getContext("2d")!;
let layout: WorldLayout = defaultLayout(),
  capability: Capability | undefined,
  area = "farm",
  tool: Tool = "select",
  selection: Selection | undefined;
let zoom = 18,
  ox = 20,
  oy = 20,
  width = 800,
  height = 600;
const undo: WorldLayout[] = [],
  redo: WorldLayout[] = [];
const images = new Map<string, HTMLImageElement>();
const map = () => layout.maps[area]!;
const status = (message: string) => {
  el("status").textContent = message;
};
const id = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const clone = <T>(v: T): T => structuredClone(v);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function remember() {
  undo.push(clone(layout));
  if (undo.length > 30) undo.shift();
  redo.length = 0;
}
function persist() {
  try {
    localStorage.setItem(DRAFT, JSON.stringify(layout));
  } catch {
    status("기기 저장 공간이 부족합니다. JSON으로 내보내세요.");
  }
}
function changed(message = "초안 수정됨 · 서버 저장 전") {
  persist();
  inspector();
  draw();
  status(message);
}
function collection(layer: Layer): unknown[] {
  const m = map();
  return layer === "object"
    ? m.objects
    : layer === "terrain"
      ? m.terrainRegions
      : layer === "farm"
        ? m.farmAreas
        : layer === "collision"
          ? m.collisionRegions
          : layer === "spawn"
            ? m.spawns
            : m.warps;
}
function rect(s: Selection): Rect | undefined {
  const m = map();
  if (s.layer === "farm") return m.farmAreas[s.index];
  if (s.layer === "collision") return m.collisionRegions[s.index];
  if (s.layer === "terrain") return m.terrainRegions[s.index];
  if (s.layer === "warp") return m.warps[s.index]?.area;
}
function position(s: Selection): { x: number; y: number } {
  const r = rect(s);
  if (r) return { x: r.startX, y: r.startY };
  if (s.layer === "object") {
    const p = map().objects[s.index]!.position;
    return { x: p.tileX, y: p.tileY };
  }
  const p = map().spawns[s.index]!;
  return { x: p.tileX, y: p.tileY };
}
function bounds(s: Selection) {
  const r = rect(s),
    p = position(s);
  return r
    ? {
        x: r.startX,
        y: r.startY,
        w: r.endX - r.startX + 1,
        h: r.endY - r.startY + 1,
      }
    : { x: p.x - 0.55, y: p.y - 1.2, w: 1.1, h: 1.4 };
}
function fields() {
  const m = map();
  el<HTMLInputElement>("map-name").value = m.name;
  el<HTMLInputElement>("width").value = String(m.width);
  el<HTMLInputElement>("height").value = String(m.height);
}
function field(
  label: string,
  value: string | number,
  change: (v: string) => void,
  options?: Array<[string, string]>,
) {
  const l = document.createElement("label");
  l.textContent = label;
  let input: HTMLInputElement | HTMLSelectElement;
  if (options) {
    input = document.createElement("select");
    for (const [v, t] of options) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      input.append(o);
    }
  } else {
    input = document.createElement("input");
    input.type = typeof value === "number" ? "number" : "text";
    if (input.type === "number") input.step = "0.5";
  }
  input.value = String(value);
  input.addEventListener("change", () => {
    remember();
    change(input.value);
    changed();
  });
  l.append(input);
  el("inspector").append(l);
}
function number(
  label: string,
  value: number,
  set: (n: number) => void,
  min = 0,
  max = 128,
) {
  field(label, value, (v) => {
    const n = Number(v);
    if (Number.isFinite(n)) set(clamp(n, min, max));
  });
}
function inspector() {
  const box = el("inspector");
  box.replaceChildren();
  if (!selection || !collection(selection.layer)[selection.index]) {
    box.textContent =
      "选择 / 이동 모드에서 오브젝트·영역을 탭하세요. 농사/충돌 영역의 우하단 네모를 드래그하면 크기가 바뀝니다.".replace(
        "选择",
        "선택",
      );
    return;
  }
  const s = selection,
    m = map(),
    r = rect(s),
    heading = document.createElement("strong");
  heading.textContent = `${{ object: "오브젝트", terrain: "바닥", farm: "농사 영역", collision: "충돌", spawn: "Spawn", warp: "출입구" }[s.layer]} #${s.index + 1}`;
  box.append(heading);
  if (r) {
    number(
      "왼쪽 X",
      r.startX,
      (v) => {
        const w = r.endX - r.startX;
        r.startX = Math.min(v, m.width - w - 1);
        r.endX = r.startX + w;
      },
      0,
      m.width - 1,
    );
    number(
      "위쪽 Y",
      r.startY,
      (v) => {
        const h = r.endY - r.startY;
        r.startY = Math.min(v, m.height - h - 1);
        r.endY = r.startY + h;
      },
      0,
      m.height - 1,
    );
    number(
      "가로",
      r.endX - r.startX + 1,
      (v) => (r.endX = Math.min(m.width - 1, r.startX + v - 1)),
      1,
      m.width,
    );
    number(
      "세로",
      r.endY - r.startY + 1,
      (v) => (r.endY = Math.min(m.height - 1, r.startY + v - 1)),
      1,
      m.height,
    );
  }
  if (s.layer === "object") {
    const o = m.objects[s.index]!;
    field("ID", o.id, (v) => (o.id = v));
    field("에셋", o.assetId, (v) => (o.assetId = v), assetOptions);
    field("설명", o.label ?? "", (v) => (o.label = v));
    field(
      "상호작용",
      o.kind ?? "",
      (v) => {
        if (v) o.kind = v;
        else delete o.kind;
      },
      [["", "장식"], ...FIXTURE_KINDS.map((k) => [k, k] as [string, string])],
    );
    number(
      "X",
      o.position.tileX,
      (v) => (o.position.tileX = v),
      0,
      m.width - 0.5,
    );
    number(
      "Y",
      o.position.tileY,
      (v) => (o.position.tileY = v),
      0,
      m.height - 0.5,
    );
    number("크기 배율", o.scale ?? 1, (v) => (o.scale = v), 0.2, 3);
    const b = document.createElement("button");
    b.textContent = o.collision ? "오브젝트 충돌 제거" : "오브젝트 충돌 추가";
    b.onclick = () => {
      remember();
      if (o.collision) delete o.collision;
      else o.collision = { x: -12, y: -10, width: 24, height: 14 };
      changed();
    };
    box.append(b);
    if (o.collision) {
      for (const key of ["x", "y", "width", "height"] as const)
        number(
          "충돌 " + key,
          o.collision[key],
          (v) => (o.collision![key] = v),
          key === "width" || key === "height" ? 1 : -512,
          512,
        );
    }
  }
  if (s.layer === "spawn") {
    const p = m.spawns[s.index]!;
    field("Spawn ID", p.id, (v) => {
      const old = p.id;
      p.id = v;
      for (const other of Object.values(layout.maps))
        for (const w of other.warps)
          if (w.targetMapId === area && w.targetSpawnId === old)
            w.targetSpawnId = v;
    });
    number("X", p.tileX, (v) => (p.tileX = v), 0, m.width - 0.5);
    number("Y", p.tileY, (v) => (p.tileY = v), 0, m.height - 0.5);
    field(
      "방향",
      p.facing,
      (v) => (p.facing = v),
      ["up", "down", "left", "right"].map((v) => [v, v]),
    );
  }
  if (s.layer === "warp") {
    const w = m.warps[s.index]!;
    field("출입구 ID", w.id, (v) => (w.id = v));
    field(
      "목적지 맵",
      w.targetMapId,
      (v) => {
        w.targetMapId = v;
        w.targetSpawnId = layout.maps[v]!.spawns[0]!.id;
      },
      Object.values(layout.maps).map((m) => [m.id, m.name]),
    );
    field(
      "도착 Spawn",
      w.targetSpawnId,
      (v) => (w.targetSpawnId = v),
      layout.maps[w.targetMapId]!.spawns.map((p) => [p.id, p.id]),
    );
  }
  if (s.layer === "terrain")
    field(
      "타일",
      m.terrainRegions[s.index]!.tileType,
      (v) => (m.terrainRegions[s.index]!.tileType = v),
      tileOptions,
    );
}
const tileOptions: Array<[string, string]> = [
  ["grass", "잔디"],
  ["path", "길"],
  ["dirt", "흙"],
  ["water", "물"],
  ["wood_floor", "나무 바닥"],
  ["stone_floor", "돌 바닥"],
  ["mine_floor", "광산 바닥"],
];
const assetOptions: Array<[string, string]> = [
  ...new Set([...Object.keys(ASSETS), ...GENERATED_ASSETS]),
]
  .sort()
  .map((k) => [k, k]);
for (const [k, t] of assetOptions) {
  const o = document.createElement("option");
  o.value = k;
  o.textContent = t;
  el("asset").append(o);
}
el<HTMLSelectElement>("asset").value = "tree";
for (const m of Object.values(layout.maps)) {
  const o = document.createElement("option");
  o.value = m.id;
  o.textContent = m.name;
  el("map").append(o);
}
function fit() {
  zoom = clamp(
    Math.min((width - 30) / map().width, (height - 30) / map().height),
    4,
    42,
  );
  ox = (width - map().width * zoom) / 2;
  oy = (height - map().height * zoom) / 2;
  draw();
}
const colors: Record<string, string> = {
  grass: "#a7c87a",
  path: "#d6c399",
  dirt: "#98734e",
  water: "#71b9c4",
  mine_floor: "#5c6670",
  wood_floor: "#b59875",
  stone_floor: "#a4a697",
};
function draw() {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = "#263d32";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(zoom, zoom);
  const m = map();
  ctx.fillStyle = colors[m.baseTileType] ?? "#a7c87a";
  ctx.fillRect(0, 0, m.width, m.height);
  for (const r of m.terrainRegions) {
    ctx.fillStyle = colors[r.tileType] ?? "#a7c87a";
    ctx.fillRect(
      r.startX,
      r.startY,
      r.endX - r.startX + 1,
      r.endY - r.startY + 1,
    );
  }
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = "#fff3";
  ctx.beginPath();
  for (let x = 0; x <= m.width; x++) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, m.height);
  }
  for (let y = 0; y <= m.height; y++) {
    ctx.moveTo(0, y);
    ctx.lineTo(m.width, y);
  }
  ctx.stroke();
  for (const o of [...m.objects].sort(
    (a, b) => a.position.tileY - b.position.tileY,
  )) {
    const asset = ASSETS[o.assetId],
      src = asset?.source;
    let img = images.get(o.assetId);
    if (!img && src) {
      img = new Image();
      images.set(o.assetId, img);
      img.onload = draw;
      img.src = src.path;
    }
    const x = o.position.tileX,
      y = o.position.tileY;
    if (img?.complete && img.naturalWidth) {
      const fw = src?.frameWidth ?? asset?.frameSize?.width ?? img.naturalWidth,
        fh = src?.frameHeight ?? asset?.frameSize?.height ?? img.naturalHeight,
        scale = (o.scale ?? asset?.displayScale?.x ?? 1) / 32;
      ctx.drawImage(
        img,
        0,
        0,
        fw,
        fh,
        x - fw * scale * (asset?.origin?.x ?? 0.5),
        y - fh * scale * (asset?.origin?.y ?? 1),
        fw * scale,
        fh * scale,
      );
    } else {
      ctx.fillStyle = o.kind ? "#9c6537" : "#b78d64";
      ctx.fillRect(x - 0.4, y - 0.8, 0.8, 0.8);
    }
  }
  for (const [layer, color] of [
    ["farm", "#267a39"],
    ["collision", "#c83d3d"],
    ["warp", "#8246d8"],
  ] as const) {
    const list = collection(layer);
    for (let i = 0; i < list.length; i++) {
      const r = rect({ layer, index: i })!;
      ctx.fillStyle = color + "25";
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.08;
      ctx.fillRect(
        r.startX,
        r.startY,
        r.endX - r.startX + 1,
        r.endY - r.startY + 1,
      );
      ctx.strokeRect(
        r.startX,
        r.startY,
        r.endX - r.startX + 1,
        r.endY - r.startY + 1,
      );
    }
  }
  for (const p of m.spawns) {
    ctx.fillStyle = "#2876bf";
    ctx.beginPath();
    ctx.arc(p.tileX, p.tileY, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = ".65px sans-serif";
    ctx.fillStyle = "#123554";
    ctx.fillText(p.id, p.tileX + 0.5, p.tileY);
  }
  if (selection && collection(selection.layer)[selection.index]) {
    const b = bounds(selection);
    ctx.strokeStyle = "#fff5ae";
    ctx.lineWidth = 0.14;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (rect(selection)) {
      const size = Math.max(0.65, 18 / zoom);
      ctx.fillStyle = "#fff5ae";
      ctx.fillRect(b.x + b.w - size / 2, b.y + b.h - size / 2, size, size);
    }
  }
  ctx.restore();
  el<HTMLButtonElement>("undo").disabled = !undo.length;
  el<HTMLButtonElement>("redo").disabled = !redo.length;
}
function point(e: PointerEvent) {
  const b = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - b.left - ox) / zoom,
    y: (e.clientY - b.top - oy) / zoom,
  };
}
function hit(x: number, y: number): Selection | undefined {
  const layers: Layer[] = [
    "object",
    "spawn",
    "warp",
    "collision",
    "farm",
    "terrain",
  ];
  for (const layer of layers)
    for (let i = collection(layer).length - 1; i >= 0; i--) {
      const b = bounds({ layer, index: i });
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
        return { layer, index: i };
    }
}
let drag:
  | {
      pointer: number;
      start: { x: number; y: number };
      selection?: Selection;
      original?: unknown;
      before: WorldLayout;
      pan: boolean;
      resize: boolean;
      ox: number;
      oy: number;
      changed: boolean;
    }
  | undefined;
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { distance: number; cx: number; cy: number } | undefined;
function pinchState() {
  const [a, b] = [...pointers.values()];
  return {
    distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
    cx: (a!.x + b!.x) / 2,
    cy: (a!.y + b!.y) / 2,
  };
}
function add(x: number, y: number): Selection | undefined {
  const m = map();
  x = clamp(Math.floor(x), 0, m.width - 1);
  y = clamp(Math.floor(y), 0, m.height - 1);
  const r = {
    startX: x,
    endX: Math.min(m.width - 1, x + 2),
    startY: y,
    endY: Math.min(m.height - 1, y + 2),
  };
  const nextId = "edit_" + id();
  if (tool === "object") {
    const assetId = el<HTMLSelectElement>("asset").value;
    m.objects.push({
      id: nextId,
      assetId,
      position: { tileX: x + 0.5, tileY: y + 0.5 },
      ...(assetId.startsWith("tree") ? { kind: "tree" } : {}),
    });
  } else if (tool === "spawn")
    m.spawns.push({
      id: nextId,
      tileX: x + 0.5,
      tileY: y + 0.5,
      facing: "down",
    });
  else if (tool === "warp")
    m.warps.push({
      id: nextId,
      area: r,
      targetMapId: "farm",
      targetSpawnId: layout.maps.farm!.spawns[0]!.id,
    });
  else if (tool === "terrain")
    m.terrainRegions.push({
      ...r,
      tileType: el<HTMLSelectElement>("tile").value,
    });
  else if (tool === "farm") m.farmAreas.push(r);
  else if (tool === "collision") m.collisionRegions.push(r);
  else return;
  return { layer: tool, index: collection(tool).length - 1 };
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    if (drag?.changed) {
      layout = drag.before;
      selection = undefined;
    }
    drag = undefined;
    gesture = pinchState();
    draw();
    return;
  }
  if (pointers.size !== 1) return;
  const p = point(e);
  let resizing = false;
  if (selection && rect(selection)) {
    const b = bounds(selection);
    resizing =
      Math.hypot(p.x - b.x - b.w, p.y - b.y - b.h) < Math.max(0.8, 22 / zoom);
  }
  if (tool === "select" && !resizing) selection = hit(p.x, p.y);
  const before = clone(layout);
  let created = false;
  if (!resizing && tool !== "select" && tool !== "pan") {
    selection = add(p.x, p.y);
    created = true;
  }
  drag = {
    pointer: e.pointerId,
    start: p,
    selection: selection ? { ...selection } : undefined,
    original: selection
      ? clone(collection(selection.layer)[selection.index])
      : undefined,
    before,
    pan: tool === "pan" || (!selection && tool === "select"),
    resize: resizing,
    ox,
    oy,
    changed: created,
  };
  inspector();
  draw();
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && gesture) {
    const next = pinchState(),
      b = canvas.getBoundingClientRect(),
      wx = (gesture.cx - b.left - ox) / zoom,
      wy = (gesture.cy - b.top - oy) / zoom;
    zoom = clamp((zoom * next.distance) / Math.max(1, gesture.distance), 4, 64);
    ox = next.cx - b.left - wx * zoom;
    oy = next.cy - b.top - wy * zoom;
    gesture = next;
    draw();
    return;
  }
  if (!drag || drag.pointer !== e.pointerId) return;
  const p = point(e);
  if (drag.pan) {
    const b = canvas.getBoundingClientRect();
    ox = e.clientX - b.left - drag.start.x * zoom;
    oy = e.clientY - b.top - drag.start.y * zoom;
    draw();
    return;
  }
  const s = drag.selection;
  if (!s) return;
  const dx = Math.round((p.x - drag.start.x) * 2) / 2,
    dy = Math.round((p.y - drag.start.y) * 2) / 2;
  if (!dx && !dy && !drag.changed) return;
  drag.changed = true;
  const list = collection(s.layer);
  list[s.index] = clone(drag.original);
  const r = rect(s),
    m = map();
  if (r) {
    if (drag.resize) {
      r.endX = clamp(r.endX + dx, r.startX, m.width - 1);
      r.endY = clamp(r.endY + dy, r.startY, m.height - 1);
    } else {
      const w = r.endX - r.startX,
        h = r.endY - r.startY;
      r.startX = clamp(r.startX + dx, 0, m.width - w - 1);
      r.startY = clamp(r.startY + dy, 0, m.height - h - 1);
      r.endX = r.startX + w;
      r.endY = r.startY + h;
    }
  } else if (s.layer === "object") {
    const p = m.objects[s.index]!.position;
    p.tileX = clamp(p.tileX + dx, 0, m.width - 0.5);
    p.tileY = clamp(p.tileY + dy, 0, m.height - 0.5);
  } else {
    const p = m.spawns[s.index]!;
    p.tileX = clamp(p.tileX + dx, 0, m.width - 0.5);
    p.tileY = clamp(p.tileY + dy, 0, m.height - 0.5);
  }
  draw();
});
function end(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (drag?.pointer === e.pointerId) {
    if (e.type === "pointercancel") {
      layout = drag.before;
      selection = undefined;
    } else if (drag.changed) {
      undo.push(drag.before);
      if (undo.length > 30) undo.shift();
      redo.length = 0;
      persist();
      status("초안 수정됨 · 저장 후 초기 월드 적용");
    }
    drag = undefined;
    inspector();
    draw();
  }
  if (pointers.size < 2) gesture = undefined;
}
canvas.addEventListener("pointerup", end);
canvas.addEventListener("pointercancel", end);
el("map").onchange = () => {
  area = el<HTMLSelectElement>("map").value;
  selection = undefined;
  fields();
  inspector();
  fit();
};
el("mode").onchange = () => {
  tool = el<HTMLSelectElement>("mode").value as Tool;
  selection = undefined;
  inspector();
  draw();
};
function history(back: boolean) {
  const from = back ? undo : redo,
    to = back ? redo : undo;
  if (!from.length) return;
  to.push(clone(layout));
  layout = from.pop()!;
  selection = undefined;
  fields();
  changed("편집 이력 복원");
}
el("undo").onclick = () => history(true);
el("redo").onclick = () => history(false);
el("copy").onclick = () => {
  if (!selection) return;
  remember();
  const list = collection(selection.layer),
    copy = clone(list[selection.index]) as MapObject & {
      tileX?: number;
      tileY?: number;
    };
  if ("id" in copy) copy.id = "edit_" + id();
  if (copy.position) {
    copy.position.tileX = clamp(copy.position.tileX + 1, 0, map().width - 0.5);
    copy.position.tileY = clamp(copy.position.tileY + 1, 0, map().height - 0.5);
  }
  list.push(copy);
  selection = { layer: selection.layer, index: list.length - 1 };
  changed();
};
el("delete").onclick = () => {
  if (!selection) return;
  if (selection.layer === "spawn") {
    const p = map().spawns[selection.index]!;
    if (
      map().spawns.length === 1 ||
      Object.values(layout.maps).some((m) =>
        m.warps.some((w) => w.targetMapId === area && w.targetSpawnId === p.id),
      )
    ) {
      status("사용 중인 Spawn입니다. 연결 출입구를 먼저 변경하세요.");
      return;
    }
  }
  remember();
  collection(selection.layer).splice(selection.index, 1);
  selection = undefined;
  changed();
};
function zoomBy(factor: number) {
  const x = (width / 2 - ox) / zoom,
    y = (height / 2 - oy) / zoom;
  zoom = clamp(zoom * factor, 4, 64);
  ox = width / 2 - x * zoom;
  oy = height / 2 - y * zoom;
  draw();
}
el("minus").onclick = () => zoomBy(0.8);
el("plus").onclick = () => zoomBy(1.25);
el("fit").onclick = fit;
el("resize").onclick = () => {
  const w = Number(el<HTMLInputElement>("width").value),
    h = Number(el<HTMLInputElement>("height").value);
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 12 ||
    h < 12 ||
    w > 128 ||
    h > 128
  ) {
    status("가로/세로는 12~128의 정수입니다.");
    return;
  }
  remember();
  const m = map();
  m.width = w;
  m.height = h;
  m.name = el<HTMLInputElement>("map-name").value.trim() || m.name;
  for (const r of [
    ...m.terrainRegions,
    ...m.farmAreas,
    ...m.collisionRegions,
    ...m.warps.map((v) => v.area),
  ]) {
    r.startX = Math.min(r.startX, w - 1);
    r.endX = Math.min(r.endX, w - 1);
    r.startY = Math.min(r.startY, h - 1);
    r.endY = Math.min(r.endY, h - 1);
  }
  for (const o of m.objects) {
    o.position.tileX = Math.min(o.position.tileX, w - 0.5);
    o.position.tileY = Math.min(o.position.tileY, h - 0.5);
  }
  for (const p of m.spawns) {
    p.tileX = Math.min(p.tileX, w - 0.5);
    p.tileY = Math.min(p.tileY, h - 0.5);
  }
  selection = undefined;
  changed("맵 크기 적용됨 · 저장 전");
  fit();
};
const endpoint = serverUrl().replace(/^ws/, "http");
let saving = false;
async function save(publish: boolean) {
  if (saving) return;
  saving = true;
  el<HTMLButtonElement>("save").disabled = true;
  el<HTMLButtonElement>("publish").disabled = true;
  try {
    const valid = validateLayout(layout);
    status("서버에 설계도를 저장하고 있어요…");
    if (!capability) {
      const r = await fetch(endpoint + "/api/blueprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const b = (await r.json()) as Blueprint & {
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
    });
    const result = (await r.json()) as Blueprint & { error?: string };
    if (!r.ok) throw Error(result.error ?? "저장 실패");
    capability.revision = result.revision;
    localStorage.setItem(CAP, JSON.stringify(capability));
    if (publish) localStorage.setItem("farm-active-blueprint", capability.id);
    persist();
    status(
      publish
        ? "초기 월드 적용 완료 · 이제 새 가족 농장을 만드세요. 기존 농장은 그대로입니다."
        : "서버 저장 완료 · 새 농장에 쓰려면 초기 월드 적용을 누르세요.",
    );
  } catch (e) {
    status(e instanceof Error ? e.message : "저장 실패");
  } finally {
    saving = false;
    el<HTMLButtonElement>("save").disabled = false;
    el<HTMLButtonElement>("publish").disabled = false;
  }
}
el("save").onclick = () => void save(false);
el("publish").onclick = () => void save(true);
el("new-farm").onclick = () => {
  location.href = "/?newFarm=1";
};
el("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "jiwoo-world.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
el<HTMLInputElement>("import").onchange = async () => {
  const file = el<HTMLInputElement>("import").files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000)
      throw Error("1MB 이하의 설계도만 가져올 수 있습니다.");
    const value = validateLayout(JSON.parse(await file.text()));
    remember();
    layout = value;
    selection = undefined;
    fields();
    changed("설계도 가져옴 · 저장 전");
    fit();
  } catch (e) {
    status(String(e));
  }
};
el("defaults").onclick = () => {
  remember();
  layout = defaultLayout();
  selection = undefined;
  fields();
  changed("기본 설계도 복원 · 실행 취소 가능");
  fit();
};
window.addEventListener("keydown", (e) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "z" &&
    !(e.target instanceof HTMLInputElement)
  ) {
    e.preventDefault();
    history(!e.shiftKey);
  }
});
try {
  const saved = localStorage.getItem(DRAFT);
  if (saved) layout = validateLayout(JSON.parse(saved));
  const c = JSON.parse(
    localStorage.getItem(CAP) ?? "null",
  ) as Capability | null;
  if (c?.id && c.editToken) capability = c;
} catch {
  status("저장된 초안을 읽지 못해 기본 설계도를 열었습니다.");
}
fields();
inspector();
const observer = new ResizeObserver(() => {
  const b = el("viewport").getBoundingClientRect();
  width = b.width;
  height = b.height;
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  draw();
});
observer.observe(el("viewport"));
requestAnimationFrame(() => {
  fit();
  status("지역과 편집 도구를 선택하세요. 변경은 새 가족 농장에만 적용됩니다.");
});
window.addEventListener("pagehide", () => observer.disconnect(), {
  once: true,
});
