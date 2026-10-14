import {
  getDraft,
  listDrafts,
  capabilities,
  rememberCapability,
} from "./editor/storage.js";
import { worldRequest } from "./editor/workspace.js";
import { ownerAuthorization } from "./developer-access.js";
import type { OfficialWorld, StartWorld } from "../shared/world-templates.js";
import type { WorldLayout } from "../shared/layout.js";
import { terrainAt, waterTerrain } from "../shared/world2.js";
const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let loaded: Promise<void>;
export function mountStartWorld() {
  document
    .querySelector(".login-buttons")!
    .insertAdjacentHTML(
      "beforebegin",
      `<fieldset id="start-world"><legend>새 농장의 시작 맵</legend><label>시작 설계도<select id="start-world-select"><option value="official">공식 기본 농장 · 서버</option></select></label><canvas id="start-world-preview" width="216" height="120" aria-label="선택한 시작 농장 미리보기"></canvas><p id="start-world-info">이어하기와 가족 참가는 해당 농장의 서버 맵을 사용합니다.</p><div class="start-world-actions"><a href="/editor.html">나만의 시작 농장 만들기</a><button type="button" id="refresh-start-world">목록 새로고침</button></div></fieldset>`,
    );
  const refresh = async () => {
    const select = element<HTMLSelectElement>("start-world-select");
    const chosen = select.value,
      drafts = (await listDrafts()).filter((d) => d.kind === "personal");
    select.replaceChildren(new Option("공식 기본 농장 · 서버", "official"));
    for (const d of drafts)
      select.add(
        new Option(`${d.name} · 이 기기 r${d.revision}`, "local:" + d.id),
      );
    if (ownerAuthorization().Authorization) {
      try {
        const own =
          await worldRequest<
            Array<{ id: string; name: string; revision: number }>
          >("/api/blueprints");
        for (const b of own) {
          const old = capabilities().find((c) => c.id === b.id);
          rememberCapability({
            ...b,
            auth: old?.auth ?? (old ? "blueprint" : "session"),
            editToken:
              old?.editToken ??
              ownerAuthorization().Authorization!.replace(/^Bearer /, ""),
          });
        }
      } catch {
        /* Capability recovery remains available in the editor. */
      }
    }
    for (const c of capabilities())
      select.add(
        new Option(`${c.name ?? c.id} · 서버 r${c.revision}`, "server:" + c.id),
      );
    const legacy = localStorage.getItem("farm-active-blueprint");
    if (legacy)
      select.add(
        new Option("이전 게시 설계도 · " + legacy, "published:" + legacy),
      );
    const preferred = localStorage.getItem("farm-start-draft-v2");
    select.value =
      [...select.options].some((o) => o.value === chosen) &&
      chosen !== "official"
        ? chosen
        : preferred && drafts.some((d) => d.id === preferred)
          ? "local:" + preferred
          : legacy
            ? "published:" + legacy
            : "official";
    await preview();
  };
  const preview = async () => {
    try {
      const selected = element<HTMLSelectElement>("start-world-select").value;
      let layout: WorldLayout | undefined;
      if (selected === "official")
        layout = (
          await worldRequest<OfficialWorld>("/api/world-templates/official")
        ).layout;
      else if (selected.startsWith("published:"))
        layout = (
          await worldRequest<{ layout: WorldLayout }>(
            "/api/world-templates/published/" +
              encodeURIComponent(selected.slice(10)),
          )
        ).layout;
      else if (selected.startsWith("local:"))
        layout = (await getDraft(selected.slice(6)))?.layout;
      else {
        const cap = capabilities().find((c) => c.id === selected.slice(7));
        if (cap)
          layout = (
            await worldRequest<{ layout: WorldLayout }>(
              "/api/blueprints/" + encodeURIComponent(cap.id),
              undefined,
              { Authorization: "Bearer " + cap.editToken },
            )
          ).layout;
      }
      if (!layout)
        throw Error("선택한 설계도를 찾을 수 없어요. 목록을 새로 불러오세요");
      const m = layout.maps.farm!,
        canvas = element<HTMLCanvasElement>("start-world-preview"),
        ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y += 2)
        for (let x = 0; x < canvas.width; x += 2) {
          const t = terrainAt(
            m,
            Math.floor((x / canvas.width) * m.width),
            Math.floor((y / canvas.height) * m.height),
          );
          ctx.fillStyle = waterTerrain(t)
            ? "#76bccc"
            : /path|stone|gravel/.test(t)
              ? "#c4b795"
              : "#96b878";
          ctx.fillRect(x, y, 2, 2);
        }
      ctx.fillStyle = "#976d4e";
      for (const o of m.objects)
        if (o.layer === "Buildings")
          ctx.fillRect(
            (o.position.tileX / m.width) * canvas.width - 2,
            (o.position.tileY / m.height) * canvas.height - 2,
            5,
            4,
          );
      element("start-world-info").textContent =
        `${m.width} × ${m.height} · ${Object.keys(layout.maps).length}개 지역 · 새 농장을 만들 때만 반영됩니다`;
    } catch (e) {
      element("start-world-info").textContent =
        e instanceof Error ? e.message : "미리보기 실패";
    }
  };
  element("refresh-start-world").onclick = () => {
    loaded = refresh().catch((e) => {
      element("start-world-info").textContent = String(e);
    });
  };
  element("start-world-select").onchange = () => void preview();
  loaded = refresh().catch((e) => {
    element("start-world-info").textContent = String(e);
  });
}
export async function selectedStartWorld(): Promise<StartWorld> {
  await loaded;
  const choice = element<HTMLSelectElement>("start-world-select").value;
  if (choice === "official") return { type: "official" };
  if (choice.startsWith("published:"))
    return { type: "published", id: choice.slice(10) };
  if (choice.startsWith("local:")) {
    const d = await getDraft(choice.slice(6));
    if (!d) throw Error("기기 설계도를 찾을 수 없어요");
    return { type: "local", id: d.id, revision: d.revision, layout: d.layout };
  }
  const cap = capabilities().find((c) => c.id === choice.slice(7));
  if (!cap) throw Error("서버 설계도 편집 권한을 확인하세요");
  return {
    type: "server",
    id: cap.id,
    editToken: cap.editToken,
    revision: cap.revision,
  };
}
