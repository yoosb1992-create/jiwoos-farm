/** Explicit injected test double. Never selected by the production entrypoint. */
import { randomUUID, randomBytes } from "node:crypto";
import { newWorld, type World, type ActionResult } from "../shared/world.js";
import {
  hashPassword,
  verifyPassword,
  type Store,
  type Session,
  type Identity,
  type FarmLease,
} from "./store.js";
export class MemoryTestStore implements Store {
  worlds = new Map<string, World>();
  passwords = new Map<string, string>();
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
    password: string,
    nickname: string,
  ): Promise<Session> {
    if (password.length < 2) throw new Error("Password too short");
    const farmId = create ? randomBytes(5).toString("hex").toUpperCase() : code;
    if (create) {
      this.worlds.set(farmId, newWorld(12345));
      this.passwords.set(farmId, await hashPassword(password));
    } else if (
      !(await verifyPassword(password, this.passwords.get(farmId) ?? ""))
    )
      throw new Error("Password mismatch");
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
