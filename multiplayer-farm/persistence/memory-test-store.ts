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
    const identity = { farmId, playerId: randomUUID(), nickname },
      token = randomUUID();
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
