/** Explicit injected test double. Never selected by the production entrypoint. */
import { randomUUID, randomBytes } from "node:crypto";
import type { WorldLayout } from "../shared/layout.js";
import type { Blueprint } from "../shared/blueprint.js";
import { newWorld, type World, type ActionResult } from "../shared/world.js";
import {
  type Store,
  type Session,
  type Identity,
  type FarmLease,
} from "./store.js";
export class MemoryTestStore implements Store {
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
  ): Promise<Session> {
    const farmId = create ? randomBytes(5).toString("hex").toUpperCase() : code;
    if (create)
      this.worlds.set(
        farmId,
        newWorld(
          12345,
          templateId ? await this.publishedBlueprint(templateId) : undefined,
        ),
      );
    else if (!this.worlds.has(farmId)) throw Error("가족 코드를 확인하세요");
    if (
      [...this.sessions.values()].some(
        (i) => i.farmId === farmId && i.nickname === nickname,
      )
    )
      throw new Error("Nickname in use");
    const playerId = randomUUID();
    if (create)
      this.farmMeta.set(farmId, { name: `${nickname.trim()}의 농장`, ownerId: playerId });
    const meta = this.farmMeta.get(farmId) ?? { name: "지우네 농장", ownerId: "" };
    const identity: Identity = {
      farmId,
      playerId,
      nickname,
      farmName: meta.name,
      isOwner: meta.ownerId === playerId,
    };
    const token = randomUUID();
    this.sessions.set(token, identity);
    return { ...identity, token };
  }
  async createBlueprint(layout: WorldLayout) {
    const r = {
      id: randomBytes(12).toString("hex"),
      editToken: randomUUID(),
      revision: 0,
      layout: structuredClone(layout),
      published: false,
    };
    this.blueprints.set(r.id, r);
    return structuredClone(r);
  }
  async getBlueprint(id: string, editToken: string): Promise<Blueprint> {
    const r = this.blueprints.get(id);
    if (!r || r.editToken !== editToken) throw Error("편집 권한 없음");
    return {
      id,
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
  ): Promise<Blueprint> {
    const r = this.blueprints.get(id);
    if (!r || r.editToken !== editToken || r.revision !== revision)
      throw Error("편집 권한/버전 오류");
    layout = { ...layout, blueprintId: id, worldVersion: revision + 1 };
    r.layout = structuredClone(layout);
    r.revision++;
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
    const clean = name.trim();
    if (!identity.isOwner) throw new Error("농장 주인만 이름을 바꿀 수 있습니다");
    if (!clean || [...clean].length > 30 || /\p{Cc}/u.test(clean))
      throw new Error("농장 이름은 1~30글자로 입력하세요");
    const meta = this.farmMeta.get(identity.farmId);
    if (!meta) throw new Error("농장 없음");
    meta.name = clean;
    for (const saved of this.sessions.values())
      if (saved.farmId === identity.farmId) saved.farmName = clean;
    return { ...identity, farmName: clean };
  }
  async deleteFarm(token: string, confirmFarmId: string): Promise<void> {
    const identity = await this.authenticate(token);
    if (!identity.isOwner) throw new Error("농장 주인만 저장 농장을 삭제할 수 있습니다");
    if (confirmFarmId.trim().toUpperCase() !== identity.farmId)
      throw new Error("삭제 확인용 가족 코드가 일치하지 않습니다");
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
