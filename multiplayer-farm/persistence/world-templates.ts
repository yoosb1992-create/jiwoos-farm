import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { defaultLayout, type WorldLayout } from "../shared/layout.js";
import type { World } from "../shared/world.js";
import type { Identity } from "./store.js";
import {
  prepareLayout,
  type OfficialWorld,
  type FarmSnapshot,
  type FarmBackup,
  type LayoutReview,
  type StartWorld,
} from "../shared/world-templates.js";
import { reviewLayout } from "../shared/layout-application.js";
import type { BlueprintStore } from "../shared/blueprint.js";
export interface WorldTemplateStore {
  officialWorld(): Promise<OfficialWorld>;
  publishOfficial(
    layout: WorldLayout,
    revision: number,
  ): Promise<OfficialWorld>;
  farmSnapshot(token: string): Promise<FarmSnapshot>;
  previewFarmLayout(
    token: string,
    revision: number,
    layout?: WorldLayout,
    restoreId?: string,
  ): Promise<LayoutReview>;
  applyFarmLayout(
    token: string,
    previewId: string,
  ): Promise<{ revision: number; backupId: string }>;
}
export async function startLayout(
  store: BlueprintStore & WorldTemplateStore,
  legacyId?: string,
  raw?: unknown,
): Promise<{
  layout: WorldLayout;
  source: NonNullable<World["sourceTemplate"]>;
}> {
  if (raw === undefined) {
    if (legacyId)
      return {
        layout: prepareLayout(await store.publishedBlueprint(legacyId)),
        source: { type: "server", id: legacyId, revision: 0 },
      };
    raw = { type: "official" };
  }
  if (!raw || typeof raw !== "object") throw Error("시작 설계도를 확인하세요");
  const value = raw as StartWorld;
  if (value.type === "published" && typeof value.id === "string") {
    const layout = prepareLayout(await store.publishedBlueprint(value.id));
    return {
      layout,
      source: {
        type: "server",
        id: value.id,
        revision: layout.worldVersion ?? 0,
      },
    };
  }
  if (value.type === "official") {
    const official = await store.officialWorld();
    return {
      layout: official.layout,
      source: { type: "official", id: "official", revision: official.revision },
    };
  }
  if (
    value.type === "local" &&
    typeof value.id === "string" &&
    /^[\w-]{1,80}$/.test(value.id) &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0
  )
    return {
      layout: prepareLayout(value.layout),
      source: { type: "local", id: value.id, revision: value.revision },
    };
  if (
    value.type === "server" &&
    typeof value.id === "string" &&
    typeof value.editToken === "string"
  ) {
    const b = await store.getBlueprint(value.id, value.editToken);
    if (b.revision !== value.revision)
      throw Error("서버 설계도 버전이 변경됐어요. 목록을 새로 불러오세요");
    return {
      layout: prepareLayout(b.layout),
      source: { type: "server", id: b.id, revision: b.revision },
    };
  }
  throw Error("시작 설계도 선택이 올바르지 않습니다");
}
export class PostgresWorldTemplates implements WorldTemplateStore {
  constructor(
    private pool: Pool,
    private authenticate: (token: string) => Promise<Identity>,
  ) {}
  async officialWorld(): Promise<OfficialWorld> {
    // Version one is seeded exactly once; deployments never overwrite operator publications.
    await this.pool.query(
      "INSERT INTO official_world_versions(revision,layout) VALUES(1,$1) ON CONFLICT DO NOTHING",
      [JSON.stringify(prepareLayout(defaultLayout()))],
    );
    const r = await this.pool.query<OfficialWorld>(
      "SELECT revision,layout FROM official_world_versions ORDER BY revision DESC LIMIT 1",
    );
    return r.rows[0]!;
  }
  async publishOfficial(
    layout: WorldLayout,
    revision: number,
  ): Promise<OfficialWorld> {
    const valid = prepareLayout(layout),
      db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(25260003)");
      const r = await db.query<{ revision: number }>(
        "SELECT revision FROM official_world_versions ORDER BY revision DESC LIMIT 1",
      );
      if ((r.rows[0]?.revision ?? 1) !== revision)
        throw Error("공식 월드 버전이 변경됐어요. 다시 불러오세요");
      valid.worldVersion = revision + 1;
      delete valid.blueprintId;
      await db.query(
        "INSERT INTO official_world_versions(revision,layout) VALUES($1,$2)",
        [revision + 1, JSON.stringify(valid)],
      );
      await db.query("COMMIT");
      return { revision: revision + 1, layout: valid };
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  private async owner(token: string) {
    const identity = await this.authenticate(token);
    if (!identity.isOwner)
      throw Error("현재 농장은 농장 소유자만 불러오고 수정할 수 있어요");
    return identity;
  }
  async farmSnapshot(token: string): Promise<FarmSnapshot> {
    const identity = await this.owner(token);
    const r = await this.pool.query<{ world: World }>(
      "SELECT world FROM farms WHERE id=$1",
      [identity.farmId],
    );
    if (!r.rows[0]) throw Error("농장 저장본이 없습니다");
    const backups = await this.pool.query<FarmBackup>(
      'SELECT id,created_at AS "createdAt",revision,reason FROM farm_layout_backups WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 30',
      [identity.farmId],
    );
    return {
      farmId: identity.farmId,
      farmName: identity.farmName,
      world: r.rows[0].world,
      backups: backups.rows,
    };
  }
  private async offline<T>(
    token: string,
    fn: (db: PoolClient, identity: Identity, world: World) => Promise<T>,
  ): Promise<T> {
    const identity = await this.owner(token),
      db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const lock = await db.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,2526)) AS locked",
        [identity.farmId],
      );
      if (!lock.rows[0]?.locked)
        throw Error(
          "농장이 열려 있습니다. 모든 가족이 나간 뒤 다시 시도하세요",
        );
      const r = await db.query<{ world: World }>(
        "SELECT world FROM farms WHERE id=$1 FOR UPDATE",
        [identity.farmId],
      );
      if (!r.rows[0]) throw Error("농장 저장본이 없습니다");
      const result = await fn(db, identity, r.rows[0].world);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async previewFarmLayout(
    token: string,
    revision: number,
    layout?: WorldLayout,
    restoreId?: string,
  ): Promise<LayoutReview> {
    return this.offline(token, async (db, identity, world) => {
      if (world.revision !== revision)
        throw Error("농장 저장 버전이 바뀌었어요. 현재 농장을 다시 불러오세요");
      let proposed: World, review: LayoutReview;
      if (restoreId) {
        const r = await db.query<{ world: World }>(
          "SELECT world FROM farm_layout_backups WHERE id=$1 AND farm_id=$2",
          [restoreId, identity.farmId],
        );
        if (!r.rows[0]) throw Error("이 농장의 백업을 찾을 수 없습니다");
        proposed = r.rows[0].world;
        review = {
          revision,
          layoutRevision: (world.layoutRevision ?? 0) + 1,
          changedMaps: Object.keys(proposed.layout?.maps ?? {}),
          conflicts: [],
          protectedEntities: Object.keys(proposed.entities).length,
          protectedMembers: Object.keys(proposed.members).length,
          restore: true,
        };
        proposed.layoutRevision = review.layoutRevision;
      } else ({ world: proposed, review } = reviewLayout(world, layout));
      if (review.conflicts.length) return review;
      const backupId = randomUUID(),
        previewId = randomUUID();
      await db.query(
        "INSERT INTO farm_layout_backups(id,farm_id,revision,world,reason) VALUES($1,$2,$3,$4,$5)",
        [
          backupId,
          identity.farmId,
          world.revision,
          JSON.stringify(world),
          restoreId ? "복원 전 자동 백업" : "맵 적용 전 자동 백업",
        ],
      );
      await db.query(
        "INSERT INTO farm_layout_previews(id,farm_id,member_id,base_revision,world,backup_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          previewId,
          identity.farmId,
          identity.playerId,
          revision,
          JSON.stringify(proposed),
          backupId,
        ],
      );
      await db.query(
        "DELETE FROM farm_layout_previews WHERE expires_at<now() AND farm_id=$1",
        [identity.farmId],
      );
      return { ...review, previewId, backupId };
    });
  }
  async applyFarmLayout(
    token: string,
    previewId: string,
  ): Promise<{ revision: number; backupId: string }> {
    return this.offline(token, async (db, identity, world) => {
      const r = await db.query<{
        base_revision: string;
        world: World;
        backup_id: string;
        applied_revision: string | null;
      }>(
        "SELECT base_revision,world,backup_id,applied_revision FROM farm_layout_previews WHERE id=$1 AND farm_id=$2 AND member_id=$3 AND expires_at>now() FOR UPDATE",
        [previewId, identity.farmId, identity.playerId],
      );
      const p = r.rows[0];
      if (!p) throw Error("변경 미리보기가 만료됐어요. 다시 검사하세요");
      if (p.applied_revision !== null)
        return { revision: Number(p.applied_revision), backupId: p.backup_id };
      if (Number(p.base_revision) !== world.revision)
        throw Error("미리보기 이후 농장이 변경됐어요. 다시 불러오세요");
      p.world.revision = world.revision + 1;
      const saved = await db.query(
        "UPDATE farms SET world=$1,revision=$2,updated_at=now() WHERE id=$3 AND revision=$4",
        [
          JSON.stringify(p.world),
          p.world.revision,
          identity.farmId,
          world.revision,
        ],
      );
      if (saved.rowCount !== 1) throw Error("농장 저장 버전 충돌");
      await db.query(
        "INSERT INTO world_checkpoints(farm_id,revision,world) VALUES($1,$2,$3) ON CONFLICT(farm_id) DO UPDATE SET revision=excluded.revision,world=excluded.world,saved_at=now()",
        [identity.farmId, p.world.revision, JSON.stringify(p.world)],
      );
      await db.query(
        "UPDATE farm_layout_previews SET applied_revision=$2 WHERE id=$1",
        [previewId, p.world.revision],
      );
      return { revision: p.world.revision, backupId: p.backup_id };
    });
  }
}
