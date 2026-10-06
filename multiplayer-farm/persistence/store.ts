import { Pool, type PoolClient } from "pg";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { MIGRATIONS } from "./migrations.js";
import { newWorld, type World, type ActionResult } from "../shared/world.js";
const scrypt = promisify(scryptCallback);
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export interface Identity {
  farmId: string;
  playerId: string;
  nickname: string;
}
export interface Session extends Identity {
  token: string;
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export interface FarmLease {
  load(): Promise<World>;
  receipt(
    playerId: string,
    actionId: string,
  ): Promise<{ hash: string; result: ActionResult } | undefined>;
  save(
    world: World,
    previousRevision: number,
    receipt?: {
      playerId: string;
      actionId: string;
      hash: string;
      result: ActionResult;
    },
  ): Promise<void>;
  close(): Promise<void>;
}
export interface Store {
  readonly namespace?: string;
  migrate(): Promise<void>;
  health(): Promise<boolean>;
  login(
    create: boolean,
    code: string,
    password: string,
    nickname: string,
  ): Promise<Session>;
  authenticate(token: string): Promise<Identity>;
  lease(farmId: string, onLost: () => void): Promise<FarmLease>;
  close(): Promise<void>;
}
export const DATABASE_SCHEMA = "farm_v26";
export class PostgresStore implements Store {
  readonly namespace = DATABASE_SCHEMA;
  readonly pool: Pool;
  constructor(connectionString: string) {
    if (new URL(connectionString).searchParams.has("options"))
      throw new Error(
        "DATABASE_URL options cannot override the isolated farm namespace",
      );
    this.pool = new Pool({
      connectionString,
      // No public fallback: v2.5 tables and sessions remain untouched.
      options: `-c search_path=${DATABASE_SCHEMA}`,
      max: 12,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
    });
    this.pool.on("error", () =>
      console.error("[farm] idle database connection lost"),
    );
  }
  async migrate(): Promise<void> {
    const db = await this.pool.connect();
    try {
      const path = await db.query<{ search_path: string }>("SHOW search_path");
      if (path.rows[0]?.search_path !== DATABASE_SCHEMA)
        throw new Error("Farm namespace isolation failed");
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(25260001)");
      await db.query(`CREATE SCHEMA IF NOT EXISTS ${DATABASE_SCHEMA}`);
      await db.query(
        "CREATE TABLE IF NOT EXISTS farm_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const m of MIGRATIONS) {
        const found = await db.query(
          "SELECT 1 FROM farm_migrations WHERE version=$1",
          [m.version],
        );
        if (!found.rowCount) {
          await db.query(m.sql);
          await db.query("INSERT INTO farm_migrations(version)VALUES($1)", [
            m.version,
          ]);
        }
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async health(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
  async login(
    create: boolean,
    code: string,
    password: string,
    nickname: string,
  ): Promise<Session> {
    if ([...password].length < 2 || Buffer.byteLength(password) > 4096)
      throw new Error("비밀번호는 2글자 이상, 4096바이트 이하입니다");
    if (
      !nickname.trim() ||
      [...nickname].length > 24 ||
      /\p{Cc}/u.test(nickname)
    )
      throw new Error("닉네임은 1~24글자로 입력하세요");
    const farmId = create
      ? randomBytes(5).toString("hex").toUpperCase()
      : code.trim().toUpperCase();
    if (!/^[A-F0-9]{10}$/.test(farmId))
      throw new Error("가족 코드가 올바르지 않습니다");
    const passwordHash = create ? await hashPassword(password) : "";
    if (!create) {
      const found = await this.pool.query<{ password_hash: string }>(
        "SELECT password_hash FROM farms WHERE id=$1",
        [farmId],
      );
      if (
        !found.rows[0] ||
        !(await verifyPassword(password, found.rows[0].password_hash))
      )
        throw new Error("가족 코드 또는 비밀번호를 확인하세요");
    }
    const db = await this.pool.connect();
    const playerId = randomUUID(),
      token = randomBytes(32).toString("base64url");
    try {
      await db.query("BEGIN");
      if (create) {
        const w = newWorld(randomBytes(4).readUInt32LE());
        await db.query(
          "INSERT INTO farms(id,password_hash,world)VALUES($1,$2,$3)",
          [farmId, passwordHash, JSON.stringify(w)],
        );
      }
      await db.query(
        "INSERT INTO members(id,farm_id,nickname)VALUES($1,$2,$3)",
        [playerId, farmId, nickname.trim()],
      );
      await db.query(
        "INSERT INTO sessions(token_hash,member_id,expires_at)VALUES($1,$2,now()+interval '90 days')",
        [tokenHash(token), playerId],
      );
      await db.query("COMMIT");
      return { farmId, playerId, nickname: nickname.trim(), token };
    } catch (e) {
      await db.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505")
        throw new Error(
          "이미 사용 중인 닉네임입니다. 기존 기기는 저장된 세션으로 계속하세요",
        );
      throw e;
    } finally {
      db.release();
    }
  }
  async authenticate(token: string): Promise<Identity> {
    if (typeof token !== "string" || token.length > 200)
      throw new Error("세션 없음");
    const r = await this.pool.query<{
      farm_id: string;
      id: string;
      nickname: string;
    }>(
      "SELECT m.farm_id,m.id,m.nickname FROM sessions s JOIN members m ON s.member_id=m.id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [tokenHash(token)],
    );
    const row = r.rows[0];
    if (!row) throw new Error("세션이 만료됐습니다");
    return { farmId: row.farm_id, playerId: row.id, nickname: row.nickname };
  }
  async lease(farmId: string, onLost: () => void): Promise<FarmLease> {
    const db = await this.pool.connect();
    let released = false,
      lost = false;
    try {
      const lock = await db.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,2526)) AS locked",
        [farmId],
      );
      if (!lock.rows[0]?.locked)
        throw new Error(
          "농장이 다른 서버에서 열려 있습니다. 잠시 후 다시 접속하세요",
        );
    } catch (e) {
      db.release();
      throw e;
    }
    const fail = () => {
      if (!released && !lost) {
        lost = true;
        onLost();
      }
    };
    db.on("error", fail);
    db.on("end", fail);
    const healthy = () => {
      if (lost || released) throw new Error("DB lease unavailable");
    };
    return {
      load: async () => {
        healthy();
        const r = await db.query<{ world: World }>(
          "SELECT world FROM farms WHERE id=$1",
          [farmId],
        );
        if (!r.rows[0]) throw new Error("농장 없음");
        return r.rows[0].world;
      },
      receipt: async (playerId, actionId) => {
        healthy();
        const r = await db.query<{
          command_hash: string;
          result: ActionResult;
        }>(
          "SELECT command_hash,result FROM action_receipts WHERE farm_id=$1 AND member_id=$2 AND action_id=$3",
          [farmId, playerId, actionId],
        );
        return r.rows[0]
          ? { hash: r.rows[0].command_hash, result: r.rows[0].result }
          : undefined;
      },
      save: async (world, previousRevision, receipt) => {
        healthy();
        await db.query("BEGIN");
        try {
          const r = await db.query(
            "UPDATE farms SET world=$1,revision=$2,updated_at=now() WHERE id=$3 AND revision=$4",
            [JSON.stringify(world), world.revision, farmId, previousRevision],
          );
          if (r.rowCount !== 1) throw new Error("Farm revision conflict");
          if (receipt)
            await db.query(
              "INSERT INTO action_receipts(farm_id,member_id,action_id,command_hash,result)VALUES($1,$2,$3,$4,$5)",
              [
                farmId,
                receipt.playerId,
                receipt.actionId,
                receipt.hash,
                JSON.stringify(receipt.result),
              ],
            );
          await db.query(
            "INSERT INTO world_checkpoints(farm_id,revision,world)VALUES($1,$2,$3) ON CONFLICT(farm_id) DO UPDATE SET revision=excluded.revision,world=excluded.world,saved_at=now()",
            [farmId, world.revision, JSON.stringify(world)],
          );
          await db.query("COMMIT");
        } catch (e) {
          await db.query("ROLLBACK").catch(() => undefined);
          throw e;
        }
      },
      close: async () => {
        if (released) return;
        released = true;
        db.off("error", fail);
        db.off("end", fail);
        try {
          if (!lost)
            await db.query(
              "SELECT pg_advisory_unlock(hashtextextended($1,2526))",
              [farmId],
            );
        } finally {
          db.release(lost);
        }
      },
    };
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
