import { defaultLayout } from '../shared/layout.js';
import { prepareLayout, type StartWorld, type FarmBackup, type LayoutReview, type FarmSnapshot } from '../shared/world-templates.js';
import { startLayout } from './world-templates.js';
import { reviewLayout } from '../shared/layout-application.js';
/** Explicit injected test double. Never selected by the production entrypoint. */
import { randomUUID, randomBytes } from "node:crypto";
import type { WorldLayout } from "../shared/layout.js";
import type { Blueprint } from "../shared/blueprint.js";
import { newWorld, type World, type ActionResult } from "../shared/world.js";
import {
  validatedFarmName,
  type Store,
  type Session,
  type Identity,
  type FarmLease,
} from "./store.js";
export class MemoryTestStore implements Store {
  official = { revision: 1, layout: prepareLayout(defaultLayout()) };
  blueprintOwners = new Map<string, string>();
  backups = new Map<string, FarmBackup & { farmId: string; world: World }>();
  previews = new Map<string, { farmId: string; memberId: string; revision: number; world: World; backupId: string; applied?: number }>();
  async officialWorld() { return structuredClone(this.official); }
  async publishOfficial(layout: WorldLayout, revision: number) {
    if (this.official.revision !== revision) throw Error('공식 월드 버전 충돌');
    this.official = { revision: revision + 1, layout: prepareLayout(layout) };
    this.official.layout.worldVersion = revision + 1;
    delete this.official.layout.blueprintId;
    return this.officialWorld();
  }
  private async owner(token: string, offline = false) {
    const identity = await this.authenticate(token);
    if (!identity.isOwner) throw Error('농장 소유자 권한이 필요해요');
    if (offline && this.locks.has(identity.farmId)) throw Error('농장이 열려 있습니다. 모든 가족이 나간 뒤 다시 시도하세요');
    return identity;
  }
  async farmSnapshot(token: string): Promise<FarmSnapshot> {
    const i = await this.owner(token);
    return { farmId: i.farmId, farmName: i.farmName, world: structuredClone(this.worlds.get(i.farmId)!),
      backups: [...this.backups.values()].filter(b => b.farmId === i.farmId).map(({world, farmId, ...b}) => b) };
  }
  async previewFarmLayout(token: string, revision: number, layout?: WorldLayout, restoreId?: string): Promise<LayoutReview> {
    const i = await this.owner(token, true), world = this.worlds.get(i.farmId)!;
    if (world.revision !== revision) throw Error('농장 저장 버전이 바뀌었어요. 다시 불러오세요');
    let next: World, review: LayoutReview;
    if (restoreId) {
      const b = this.backups.get(restoreId);
      if (!b || b.farmId !== i.farmId) throw Error('이 농장의 백업이 아닙니다');
      next = structuredClone(b.world); next.layoutRevision = (world.layoutRevision ?? 0) + 1;
      review = { revision, layoutRevision: next.layoutRevision, changedMaps: Object.keys(next.layout!.maps), conflicts: [], protectedEntities: Object.keys(next.entities).length, protectedMembers: Object.keys(next.members).length, restore: true };
    } else ({world: next, review} = reviewLayout(world, layout));
    if (review.conflicts.length) return review;
    const backupId = randomUUID(), previewId = randomUUID();
    this.backups.set(backupId, { id: backupId, farmId: i.farmId, world: structuredClone(world), revision, createdAt: new Date().toISOString(), reason: restoreId ? '복원 전 자동 백업' : '맵 적용 전 자동 백업' });
    this.previews.set(previewId, { farmId: i.farmId, memberId: i.playerId, world: next, revision, backupId });
    return { ...review, previewId, backupId };
  }
  async applyFarmLayout(token: string, previewId: string) {
    const i = await this.owner(token, true), p = this.previews.get(previewId), world = this.worlds.get(i.farmId)!;
    if (!p || p.farmId !== i.farmId || p.memberId !== i.playerId) throw Error('변경 미리보기를 확인하세요');
    if (p.applied !== undefined) return { revision: p.applied, backupId: p.backupId };
    if (world.revision !== p.revision) throw Error('농장 저장 버전이 바뀌었어요. 다시 불러오세요');
    p.world.revision = world.revision + 1;
    this.worlds.set(i.farmId, structuredClone(p.world)); p.applied = p.world.revision;
    return { revision: p.applied, backupId: p.backupId };
  }
  worlds = new Map<string, World>();
  blueprints = new Map<
    string,
    Blueprint & { editToken: string; applied?: WorldLayout }
  >();
  sessions = new Map<string, Identity>();
  farmMeta = new Map<string, { name: string; ownerId: string }>();
  locks = new Set<string>();
  receipts = new Map<string, { hash: string; result: ActionResult }>();
  async migrate(): Promise<void> {}
  async health(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {}
  async login(
    create: boolean,
    code: string,
    nickname: string,
    templateId?: string,
    farmName?: string,
    requestToken?: string,
    startWorld?: StartWorld,
  ): Promise<Session> {
    if (requestToken) {
      if (create || !/^[a-f0-9]{64}$/.test(requestToken)) throw Error("접속 요청 정보가 올바르지 않습니다");
      const previous = this.sessions.get(requestToken);
      if (previous) {
        if (previous.farmId !== code || previous.nickname !== nickname) throw Error("가족 세션이 일치하지 않습니다");
        return { ...previous, token: requestToken };
      }
    }
    const initialFarmName = create
      ? validatedFarmName(farmName === undefined || farmName === "" ? `${nickname.trim()}의 농장` : farmName)
      : "";
    const farmId = create ? randomBytes(5).toString("hex").toUpperCase() : code;
    if (create) {
      const template = await startLayout(this, templateId, startWorld);
      const world = newWorld(12345, template.layout); world.sourceTemplate = template.source;
      this.worlds.set(farmId, world);
    }
    else if (!this.worlds.has(farmId)) throw Error("가족 코드를 확인하세요");
    if (
      [...this.sessions.values()].some(
        (i) => i.farmId === farmId && i.nickname === nickname,
      )
    )
      throw new Error("Nickname in use");
    const playerId = randomUUID();
    if (create)
      this.farmMeta.set(farmId, { name: initialFarmName, ownerId: playerId });
    const meta = this.farmMeta.get(farmId) ?? { name: "지우네 농장", ownerId: "" };
    const identity: Identity = {
      farmId,
      playerId,
      nickname,
      farmName: meta.name,
      isOwner: meta.ownerId === playerId,
    };
    const token = requestToken ?? randomUUID();
    this.sessions.set(token, identity);
    return { ...identity, token };
  }
  async createBlueprint(layout: WorldLayout, ownerToken?: string, name = "나만의 시작 농장") {
    const owner = ownerToken ? await this.authenticate(ownerToken) : undefined;
    const r = {
      name,
      id: randomBytes(12).toString("hex"),
      editToken: randomUUID(),
      revision: 0,
      layout: structuredClone(layout),
      published: false,
    };
    this.blueprints.set(r.id, r);
    if (owner) this.blueprintOwners.set(r.id, owner.playerId);
    return structuredClone(r);
  }
  async listBlueprints(token: string) {
    const i = await this.authenticate(token);
    return [...this.blueprints.values()].filter(b => this.blueprintOwners.get(b.id) === i.playerId).map(b => ({ id: b.id, name: b.name ?? '나만의 시작 농장', revision: b.revision }));
  }
  private ownsBlueprint(id: string, token: string) {
    return this.blueprintOwners.has(id) && this.blueprintOwners.get(id) === this.sessions.get(token)?.playerId;
  }
  async getBlueprint(id: string, editToken: string): Promise<Blueprint> {
    const r = this.blueprints.get(id);
    if (!r || (r.editToken !== editToken && !this.ownsBlueprint(id, editToken))) throw Error("편집 권한 없음");
    return {
      id,
      name: r.name,
      revision: r.revision,
      layout: structuredClone(r.layout),
      published: r.published,
    };
  }
  async saveBlueprint(
    id: string,
    editToken: string,
    layout: WorldLayout,
    revision: number,
    publish: boolean,
    name?: string,
  ): Promise<Blueprint> {
    const r = this.blueprints.get(id);
    if (!r || (r.editToken !== editToken && !this.ownsBlueprint(id, editToken)) || r.revision !== revision)
      throw Error("편집 권한/버전 오류");
    layout = { ...layout, blueprintId: id, worldVersion: revision + 1 };
    r.layout = structuredClone(layout);
    r.revision++;
    if (name !== undefined) r.name = validatedFarmName(name);
    if (publish) {
      r.applied = structuredClone(layout);
      r.published = true;
    }
    return this.getBlueprint(id, editToken);
  }
  async publishedBlueprint(id: string): Promise<WorldLayout> {
    const r = this.blueprints.get(id);
    if (!r?.applied) throw Error("미적용 설계도");
    return structuredClone(r.applied);
  }
  async authenticate(token: string): Promise<Identity> {
    const id = this.sessions.get(token);
    if (!id) throw new Error("Invalid token");
    return id;
  }
  async renameFarm(token: string, name: string): Promise<Identity> {
    const identity = await this.authenticate(token);
    if (!identity.isOwner) throw new Error("농장 주인만 이름을 바꿀 수 있습니다");
    const clean = validatedFarmName(name);
    const meta = this.farmMeta.get(identity.farmId);
    if (!meta) throw new Error("농장 없음");
    meta.name = clean;
    for (const saved of this.sessions.values())
      if (saved.farmId === identity.farmId) saved.farmName = clean;
    return { ...identity, farmName: clean };
  }
  async deleteFarm(token: string): Promise<void> {
    const identity = await this.authenticate(token);
    if (!identity.isOwner) throw new Error("농장 주인만 저장 농장을 삭제할 수 있습니다");
    if (this.locks.has(identity.farmId))
      throw new Error("농장이 열려 있습니다. 모든 가족이 나간 뒤 다시 삭제하세요");
    this.worlds.delete(identity.farmId);
    this.farmMeta.delete(identity.farmId);
    for (const [savedToken, saved] of this.sessions)
      if (saved.farmId === identity.farmId) this.sessions.delete(savedToken);
    for (const key of [...this.receipts.keys()])
      if (key.startsWith(`${identity.farmId}/`)) this.receipts.delete(key);
  }
  async lease(id: string, _onLost: () => void): Promise<FarmLease> {
    if (this.locks.has(id)) throw new Error("Farm already open");
    this.locks.add(id);
    return {
      load: async () => structuredClone(this.worlds.get(id)!),
      receipt: async (p, a) =>
        structuredClone(this.receipts.get(`${id}/${p}/${a}`)),
      save: async (w, revision, receipt) => {
        if (this.worlds.get(id)?.revision !== revision)
          throw new Error("Revision conflict");
        this.worlds.set(id, structuredClone(w));
        if (receipt)
          this.receipts.set(
            `${id}/${receipt.playerId}/${receipt.actionId}`,
            structuredClone({ hash: receipt.hash, result: receipt.result }),
          );
      },
      close: async () => {
        this.locks.delete(id);
      },
    };
  }
}
