import { FAMILY_PRESENCE_TTL_MS } from "../../game/family/presence";
import type { FamilyRoom, FamilyRoomDetail } from "../../game/family/types";

export type FamilyDB = Pick<D1Database, "prepare" | "batch">;
export class FamilyError extends Error {
  constructor(public readonly status: number, message: string, public readonly details: Record<string, unknown> = {}) { super(message); }
}
export function shortText(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new FamilyError(400, `${label}을(를) 확인해 주세요.`);
  return value.trim();
}
const roomSelect = `SELECT r.id, r.name, r.invite_code AS inviteCode, m.player_id AS playerId, m.nickname, (r.owner_id = m.user_id) AS isOwner
  FROM family_rooms r JOIN family_members m ON m.room_id = r.id`;
const inviteCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");

export class FamilyRooms {
  constructor(protected readonly db: FamilyDB, protected readonly now = () => Date.now()) {}
  async list(userId: string): Promise<FamilyRoom[]> {
    return (await this.db.prepare(`${roomSelect} WHERE m.user_id = ? ORDER BY m.last_joined_at DESC LIMIT 30`).bind(userId).all<FamilyRoom>()).results;
  }
  async requireMember(userId: string, roomId: string): Promise<FamilyRoom> {
    const room = await this.db.prepare(`${roomSelect} WHERE m.user_id = ? AND r.id = ?`).bind(userId, roomId).first<FamilyRoom>();
    if (!room) throw new FamilyError(403, "이 가족 농장의 구성원이 아닙니다.");
    return room;
  }
  async detail(userId: string, roomId: string): Promise<FamilyRoomDetail> {
    const room = await this.requireMember(userId, roomId);
    const members = (await this.db.prepare("SELECT m.player_id AS playerId, m.nickname, (COALESCE(p.last_seen, 0) > ?) AS online FROM family_members m LEFT JOIN family_presence p ON p.room_id = m.room_id AND p.user_id = m.user_id WHERE m.room_id = ? ORDER BY m.joined_at").bind(this.now() - FAMILY_PRESENCE_TTL_MS, roomId).all<{ playerId: string; nickname: string; online: boolean }>()).results;
    return { room, members };
  }
  async manage(userId: string, roomId: string, action: string, nickname?: unknown) {
    const member = await this.requireMember(userId, roomId);
    if (action === "rename") {
      await this.db.prepare("UPDATE family_members SET nickname = ? WHERE room_id = ? AND user_id = ?").bind(shortText(nickname, 20, "닉네임"), roomId, userId).run();
      return this.detail(userId, roomId);
    }
    if (action === "leave") {
      if (member.isOwner) throw new FamilyError(409, "방장은 나갈 수 없습니다. 농장을 삭제해 주세요. 소유권 이전은 후속 버전에서 지원합니다.");
      await this.db.prepare("DELETE FROM family_members WHERE room_id = ? AND user_id = ?").bind(roomId, userId).run();
      return { left: true };
    }
    if (!member.isOwner) throw new FamilyError(403, "방장만 할 수 있습니다.");
    if (action === "delete") {
      await this.db.prepare("DELETE FROM family_rooms WHERE id = ? AND owner_id = ?").bind(roomId, userId).run();
      return { deleted: true };
    }
    if (action === "rotate") {
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = inviteCode(); if (code === member.inviteCode) continue;
        try {
          await this.db.prepare("UPDATE family_rooms SET invite_code = ? WHERE id = ? AND owner_id = ?").bind(code, roomId, userId).run();
          return this.detail(userId, roomId);
        } catch (error) { if (!String(error).includes("family_rooms.invite_code")) throw error; }
      }
      throw new FamilyError(503, "코드 발급에 실패했습니다. 다시 시도해 주세요.");
    }
    throw new FamilyError(400, "지원하지 않는 요청입니다.");
  }
  async create(userId: string, rawName: unknown, rawNickname: unknown) {
    const name = shortText(rawName, 40, "농장 이름"), nickname = shortText(rawNickname, 20, "닉네임");
    const count = await this.db.prepare("SELECT count(*) AS n FROM family_rooms WHERE owner_id = ?").bind(userId).first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) throw new FamilyError(409, "가족 농장은 계정당 최대 10개까지 만들 수 있습니다.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = crypto.randomUUID(), code = inviteCode(), playerId = crypto.randomUUID(), now = this.now();
      try {
        await this.db.batch([
          this.db.prepare("INSERT INTO family_rooms (id, name, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, name, code, userId, now),
          this.db.prepare("INSERT INTO family_members (room_id, user_id, player_id, nickname, joined_at, last_joined_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, playerId, nickname, now, now),
        ]);
        return await this.detail(userId, id);
      } catch (error) {
        if (!String(error).includes("family_rooms.invite_code")) throw error;
      }
    }
    throw new FamilyError(503, "초대 코드 생성에 실패했습니다. 다시 시도해 주세요.");
  }
  async join(userId: string, rawCode: unknown, rawNickname: unknown) {
    const code = shortText(rawCode, 8, "초대 코드").toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new FamilyError(400, "8자리 초대 코드를 확인해 주세요.");
    const nickname = shortText(rawNickname, 20, "닉네임");
    const room = await this.db.prepare("SELECT id FROM family_rooms WHERE invite_code = ?").bind(code).first<{ id: string }>();
    if (!room) throw new FamilyError(404, "초대 코드에 해당하는 농장이 없습니다.");
    const now = this.now();
    await this.db.prepare(`INSERT INTO family_members (room_id, user_id, player_id, nickname, joined_at, last_joined_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, user_id) DO UPDATE SET nickname = excluded.nickname, last_joined_at = excluded.last_joined_at`)
      .bind(room.id, userId, crypto.randomUUID(), nickname, now, now).run();
    return this.detail(userId, room.id);
  }
}
