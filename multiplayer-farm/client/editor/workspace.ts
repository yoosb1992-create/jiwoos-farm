import {
  prepareLayout,
  type OfficialWorld,
  type FarmSnapshot,
  type LayoutReview,
  type BlueprintCapability,
} from "../../shared/world-templates.js";
import type { WorldLayout } from "../../shared/layout.js";
import type { Blueprint } from "../../shared/blueprint.js";
import { ownerAuthorization } from "../developer-access.js";
import { serverUrl } from "../config.js";
import {
  newDraft,
  putDraft,
  getDraft,
  listDrafts,
  deleteDraft,
  capabilities,
  rememberCapability,
  type Draft,
} from "./storage.js";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const value = (id: string) => (el(id) as HTMLInputElement).value;
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function worldRequest<T>(
  path: string,
  body?: unknown,
  headers: Record<string, string> = ownerAuthorization(),
): Promise<T> {
  const r = await fetch(serverUrl().replace(/^ws/, "http") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error ?? "요청 실패");
  return data;
}
export function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
interface Hooks {
  layout: () => WorldLayout;
  replace: (v: unknown) => Promise<void>;
  status: (s: string) => void;
  redraw: () => void;
}
export class EditorWorkspace {
  draft?: Draft;
  review?: LayoutReview;
  private saving: Promise<void> = Promise.resolve();
  private busy = false;
  private listEpoch = 0;
  constructor(private hooks: Hooks) {}
  get snapshot() {
    return this.draft?.kind === "farm" ? this.draft.farm : undefined;
  }
  invalidateReview() {
    this.review = undefined;
    el("confirm-apply").hidden = true;
    el("apply-report").textContent = "";
  }
  async saveDevice() {
    const record = this.draft;
    if (!record) return;
    const layout = structuredClone(this.hooks.layout());
    const job = this.saving.then(async () => {
      const saved = await putDraft({ ...record, layout });
      Object.assign(record, saved);
      if (this.draft === record) this.source();
    });
    this.saving = job.catch(() => {});
    await job;
  }
  private source() {
    const d = this.draft;
    if (!d) return;
    const prefix =
      d.kind === "official"
        ? `공식 기본 월드 / 게시 v${d.officialRevision}`
        : d.kind === "farm"
          ? `현재 농장 / 서버 저장 v${d.farm?.world.revision}`
          : "나만의 시작 월드";
    el("source-label").textContent =
      `${prefix} / ${d.name} / 이 기기 편집 초안 r${d.revision}`;
    el<HTMLSelectElement>("edit-target").value = d.kind;
    el("official-tools").hidden = d.kind !== "official";
    el("farm-tools").hidden = d.kind !== "farm";
    el("version-info").textContent = d.capability
      ? `서버 설계도 ${d.capability.id} · r${d.capability.revision}`
      : "개인 초안은 이 기기에만 보관됩니다";
    el<HTMLSelectElement>("backups").innerHTML = (d.farm?.backups ?? [])
      .map(
        (b) =>
          `<option value="${escape(b.id)}">${escape(new Date(b.createdAt).toLocaleString())} · 저장 v${b.revision} · ${escape(b.reason)}</option>`,
      )
      .join("");
  }
  private async activate(d: Draft) {
    this.draft = d;
    localStorage.setItem("farm-editor-active-draft-v2", d.id);
    await this.hooks.replace(d.layout);
    this.source();
    await this.list(true);
    this.hooks.redraw();
  }
  async init() {
    if (
      !(await listDrafts()).length &&
      localStorage.getItem("farm-editor-draft-v1")
    ) {
      await putDraft({
        ...newDraft(
          prepareLayout(
            JSON.parse(localStorage.getItem("farm-editor-draft-v1")!),
          ),
          "이전 기기 초안",
        ),
        id: "legacy-draft",
        capability: capabilities()[0],
      });
    }
    const drafts = await listDrafts(),
      active = localStorage.getItem("farm-editor-active-draft-v2");
    const previous =
      drafts.find((d) => d.id === active) ??
      drafts.find((d) => d.id === "legacy-draft");
    if (previous) {
      if (previous.id === "legacy-draft" && !previous.capability)
        previous.capability = capabilities()[0];
      await this.activate(previous);
    } else {
      const cap = capabilities()[0];
      if (cap) {
        const b = await worldRequest<Blueprint>(
          "/api/blueprints/" + encodeURIComponent(cap.id),
          undefined,
          { Authorization: "Bearer " + cap.editToken },
        );
        await this.activate(
          await putDraft({
            ...newDraft(b.layout, b.name ?? "이전 서버 설계도"),
            capability: { ...cap, revision: b.revision },
          }),
        );
      } else await this.official();
    }
    el("edit-target").addEventListener(
      "change",
      () =>
        void this.run(async () => {
          const kind = value("edit-target");
          await this.saveDevice();
          if (kind === "official") await this.official();
          else if (kind === "farm") await this.loadFarm();
          else {
            const saved = (await listDrafts()).find(
              (d) => d.kind === "personal",
            );
            if (saved) await this.activate(saved);
            else await this.clonePersonal("나만의 시작 농장");
          }
        }),
    );
    el("workspace-actions").addEventListener("click", (e) => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      )?.id;
      if (action) void this.action(action);
    });
    el("save-actions").addEventListener("click", (e) => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      )?.id;
      if (action) void this.action(action);
    });
    el<HTMLInputElement>("import").onchange = () =>
      void this.run(async () => {
        const file = el<HTMLInputElement>("import").files?.[0];
        if (!file) return;
        if (file.size > 16 * 1024 * 1024)
          throw Error("16MB 이하 파일만 가져오세요");
        const data = JSON.parse(await file.text());
        await this.saveDevice();
        const d = newDraft(
          prepareLayout(data.layout ?? data),
          typeof data.name === "string"
            ? data.name.slice(0, 30)
            : "가져온 시작 농장",
        );
        await this.activate(await putDraft(d));
        el<HTMLInputElement>("import").value = "";
        this.hooks.status("새 개인 설계도로 가져왔어요");
      });
  }
  async list(selectActive = false) {
    const epoch = ++this.listEpoch;
    const all = await listDrafts();
    if (epoch !== this.listEpoch) return;
    const selectedPersonal = value("personal-list"),
      selectedServer = value("server-list");
    const drafts = all.filter((d) => d.kind === "personal");
    el<HTMLSelectElement>("workspace-drafts").innerHTML = all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(
        (d) =>
          `<option value="${escape(d.id)}">${escape(d.name)} · ${d.kind === "personal" ? "개인" : d.kind === "farm" ? "농장" : "공식"} 초안 r${d.revision}</option>`,
      )
      .join("");
    el<HTMLSelectElement>("personal-list").innerHTML = drafts
      .map(
        (d) =>
          `<option value="${escape(d.id)}">${escape(d.name)} · r${d.revision}</option>`,
      )
      .join("");
    if (selectActive && this.draft?.kind === "personal")
      el<HTMLSelectElement>("personal-list").value = this.draft.id;
    else if (drafts.some((d) => d.id === selectedPersonal))
      el<HTMLSelectElement>("personal-list").value = selectedPersonal;
    el<HTMLSelectElement>("server-list").innerHTML = capabilities()
      .map(
        (c) =>
          `<option value="${escape(c.id)}">${escape(c.name ?? c.id)} · 서버 r${c.revision}</option>`,
      )
      .join("");
    if (capabilities().some((c) => c.id === selectedServer))
      el<HTMLSelectElement>("server-list").value = selectedServer;
  }
  async official() {
    const b = await worldRequest<OfficialWorld>(
      "/api/world-templates/official",
    );
    await this.activate(
      await putDraft({
        ...newDraft(b.layout, "공식 기본 월드"),
        kind: "official",
        officialRevision: b.revision,
      }),
    );
  }
  private async clonePersonal(name: string) {
    const d = await putDraft(
      newDraft(prepareLayout(this.hooks.layout()), name),
    );
    await this.activate(d);
    return d;
  }
  private async loadFarm() {
    const snapshot = await worldRequest<FarmSnapshot>("/api/farm-layout");
    await this.activate(
      await putDraft({
        ...newDraft(snapshot.world.layout!, snapshot.farmName),
        kind: "farm",
        farm: snapshot,
      }),
    );
    this.hooks.status(
      `서버 저장본 불러옴 · ${Object.keys(snapshot.world.entities).length}개 실제 오브젝트는 보호됩니다`,
    );
  }
  private async run(fn: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } catch (e) {
      this.hooks.status(e instanceof Error ? e.message : "작업 실패");
      this.source();
    } finally {
      this.busy = false;
    }
  }
  async action(id: string) {
    await this.run(async () => {
      if (!this.draft) return;
      if (id === "device-save") {
        await this.saveDevice();
        this.hooks.status("이 기기에 저장 완료");
      }
      if (id === "workspace-load") {
        const selected = value("workspace-drafts");
        await this.saveDevice();
        const d = await getDraft(selected);
        if (d) await this.activate(d);
      }
      if (id === "personal-load") {
        const selected = value("personal-list");
        await this.saveDevice();
        const d = await getDraft(selected);
        if (!d) throw Error("개인 설계도를 선택하세요");
        await this.activate(d);
      }
      if (id === "personal-new") {
        await this.saveDevice();
        const b = await worldRequest<OfficialWorld>(
          "/api/world-templates/official",
        );
        const name = value("personal-name").trim() || "나만의 시작 농장";
        await this.activate(await putDraft(newDraft(b.layout, name)));
      }
      if (id === "personal-copy") {
        await this.saveDevice();
        await this.clonePersonal(
          value("personal-name").trim() || this.draft.name + " 복사",
        );
      }
      if (id === "personal-rename") {
        if (this.draft.kind !== "personal")
          throw Error("개인 설계도를 선택하세요");
        const name = value("personal-name").trim();
        if (!name) throw Error("새 이름을 입력하세요");
        this.draft.name = name;
        await this.saveDevice();
        await this.list();
      }
      if (id === "personal-delete") {
        const d = await getDraft(value("personal-list"));
        if (!d) throw Error("삭제할 개인 설계도를 선택하세요");
        if (
          !confirm(
            `“${d.name}”의 이 기기 초안을 삭제할까요? 서버 설계도와 실제 가족 농장은 유지됩니다.`,
          )
        )
          return;
        await this.saving;
        await deleteDraft(d.id, d.revision);
        if (this.draft.id === d.id) {
          this.draft = undefined;
          await this.official();
        } else await this.list();
        return;
      }
      if (id === "register-start") {
        await this.saveDevice();
        if (this.draft.kind !== "personal")
          await this.clonePersonal(
            value("personal-name").trim() || "나만의 시작 농장",
          );
        localStorage.setItem("farm-start-draft-v2", this.draft!.id);
        this.hooks.status(
          "나만의 시작 농장으로 등록 완료 · 새 농장 만들기에서 선택됩니다",
        );
      }
      if (id === "server-save") await this.saveServer();
      if (id === "server-refresh") {
        const list =
          await worldRequest<
            Array<{ id: string; name: string; revision: number }>
          >("/api/blueprints");
        const token = ownerAuthorization().Authorization?.replace(
          /^Bearer /,
          "",
        );
        for (const b of list)
          if (token)
            rememberCapability({
              ...b,
              auth:
                capabilities().find((c) => c.id === b.id)?.auth ??
                (capabilities().some((c) => c.id === b.id)
                  ? "blueprint"
                  : "session"),
              editToken:
                capabilities().find((c) => c.id === b.id)?.editToken ?? token,
            });
        await this.list();
        this.hooks.status("내 서버 설계도 목록을 불러왔어요");
      }
      if (id === "server-load") {
        const selected = value("server-list");
        await this.saveDevice();
        const cap = capabilities().find((c) => c.id === selected);
        if (!cap) throw Error("서버 설계도 또는 편집 키를 선택하세요");
        const b = await worldRequest<Blueprint>(
          "/api/blueprints/" + encodeURIComponent(cap.id),
          undefined,
          { Authorization: "Bearer " + cap.editToken },
        );
        const updated = {
          ...cap,
          revision: b.revision,
          name: b.name ?? cap.name,
        };
        rememberCapability(updated);
        await this.activate(
          await putDraft({
            ...newDraft(b.layout, updated.name ?? "서버에서 가져온 농장"),
            capability: updated,
          }),
        );
      }
      if (id === "recover-server") {
        const cap = {
          id: value("server-id").trim(),
          editToken: value("server-key").trim(),
          revision: 0,
        };
        const b = await worldRequest<Blueprint>(
          "/api/blueprints/" + encodeURIComponent(cap.id),
          undefined,
          { Authorization: "Bearer " + cap.editToken },
        );
        rememberCapability({ ...cap, revision: b.revision, name: b.name });
        await this.list();
        el<HTMLSelectElement>("server-list").value = cap.id;
        el<HTMLInputElement>("server-key").value = "";
        this.hooks.status(
          "편집 권한 확인 완료 · 서버 설계도 불러오기를 누르세요",
        );
      }
      if (id === "export-key") {
        const cap = this.draft.capability;
        if (!cap) throw Error("서버 저장 후 편집 키를 보관할 수 있어요");
        if (
          cap.auth === "session" ||
          "Bearer " + cap.editToken === ownerAuthorization().Authorization
        )
          throw Error(
            "이 저장본은 농장 세션으로 열었어요. 처음 저장한 기기의 설계도 전용 편집 키를 사용하세요",
          );
        if (
          confirm(
            "이 키는 설계도 편집 권한입니다. 본인의 다른 기기로만 이동하세요. 파일로 보관할까요?",
          )
        )
          downloadJson(cap, "jiwoo-blueprint-key.json");
      }
      if (id === "export")
        downloadJson(
          {
            format: "jiwoo-start-world",
            name: this.draft.name,
            revision: this.draft.revision,
            layout: this.hooks.layout(),
          },
          "jiwoo-start-world.json",
        );
      if (id === "defaults") {
        await this.saveDevice();
        await this.official();
      }
      if (id === "load-current") {
        await this.saveDevice();
        await this.loadFarm();
      }
      if (id === "review-apply" || id === "review-restore") {
        const farm = this.snapshot;
        if (!farm) throw Error("현재 농장 저장본을 먼저 불러오세요");
        const restoreId =
          id === "review-restore" ? value("backups") : undefined;
        if (id === "review-restore" && !restoreId)
          throw Error("복원할 백업을 선택하세요");
        this.review = await worldRequest<LayoutReview>(
          "/api/farm-layout/preview",
          {
            revision: farm.world.revision,
            ...(restoreId ? { restoreId } : { layout: this.hooks.layout() }),
          },
        );
        el("apply-report").innerHTML =
          `<p>저장 v${this.review.revision} · 변경 지역 ${this.review.changedMaps.map(escape).join(", ") || "없음"}<br>보호: 오브젝트 ${this.review.protectedEntities}개 / 플레이어 ${this.review.protectedMembers}명</p>` +
          (this.review.conflicts.length
            ? `<p class="danger">충돌 ${this.review.conflicts.length}건 · 적용 중단</p><ul>${this.review.conflicts
                .slice(0, 100)
                .map(
                  (c) =>
                    `<li>${escape(c.area)} (${c.x.toFixed(1)}, ${c.y.toFixed(1)}) ${escape(c.id)}: ${escape(c.reason)}</li>`,
                )
                .join("")}</ul>`
            : `<p>자동 백업 완료 · ${escape(this.review.backupId)}<br>${restoreId ? "백업 시점의 진행·아이템도 함께 복원됩니다." : "진행·아이템·작물은 유지됩니다."}</p>`);
        el("confirm-apply").hidden = !this.review.previewId;
        this.hooks.redraw();
        this.hooks.status(
          this.review.conflicts.length
            ? "충돌 위치를 확인하세요 · 실제 농장은 변경되지 않았습니다"
            : "검사 및 자동 백업 완료 · 최종 확인 대기",
        );
      }
      if (id === "confirm-apply") {
        const r = this.review;
        if (!r?.previewId) throw Error("변경 미리보기를 먼저 실행하세요");
        if (
          !confirm(
            r.restore
              ? "선택한 백업 시점의 맵과 진행·아이템을 복원할까요? 현재 저장본도 자동 백업되었습니다."
              : "검사한 맵을 현재 가족 농장에 적용할까요? 모든 플레이어가 나간 상태에서만 적용합니다.",
          )
        )
          return;
        await worldRequest("/api/farm-layout/apply", {
          previewId: r.previewId,
          confirm: true,
        });
        await this.loadFarm();
        this.hooks.status(
          "적용 완료 · 농장으로 돌아가 재접속하면 변경된 맵이 표시됩니다",
        );
      }
      if (id === "official-publish") {
        if (this.draft.kind !== "official")
          throw Error("공식 월드 편집 모드를 선택하세요");
        const token = value("operator-key");
        if (!token) throw Error("서버 운영자 게시 키를 입력하세요");
        if (
          !confirm(
            "모든 이용자의 신규 농장 기본 월드로 게시할까요? 기존 농장은 유지됩니다.",
          )
        )
          return;
        const b = await worldRequest<OfficialWorld>(
          "/api/world-templates/official",
          {
            layout: this.hooks.layout(),
            revision: this.draft.officialRevision,
            confirm: true,
          },
          { Authorization: "Bearer " + token },
        );
        el<HTMLInputElement>("operator-key").value = "";
        this.draft.officialRevision = b.revision;
        await this.saveDevice();
        this.hooks.status(`공식 기본 월드 v${b.revision} 게시 완료`);
      }
      if (id === "new-farm") {
        await this.saveDevice();
        location.href = "/?newFarm=1";
      }
    });
  }
  private async saveServer() {
    if (!this.draft) return;
    if (this.draft.kind !== "personal")
      await this.clonePersonal("나만의 시작 농장");
    const d = this.draft!,
      layout = prepareLayout(this.hooks.layout());
    if (!d.capability) {
      const b = await worldRequest<Blueprint & { editToken: string }>(
        "/api/blueprints",
        { layout, name: d.name },
      );
      d.capability = {
        id: b.id,
        editToken: b.editToken,
        revision: b.revision,
        name: d.name,
      };
      rememberCapability(d.capability);
    } else {
      const cap = d.capability,
        b = await worldRequest<Blueprint>(
          "/api/blueprints/" + encodeURIComponent(cap.id),
          { layout, name: d.name, revision: cap.revision, publish: false },
          { Authorization: "Bearer " + cap.editToken },
        );
      cap.revision = b.revision;
      cap.name = d.name;
      rememberCapability(cap);
    }
    await this.saveDevice();
    await this.list();
    this.hooks.status(
      "서버에 개인 설계도 저장 완료 · 실제 농장은 변경되지 않습니다",
    );
  }
}
