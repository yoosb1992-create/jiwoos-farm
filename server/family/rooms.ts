import type { FamilyRoom, FamilyRoomDetail } from "../../game/family/types";

export type FamilyDB = Pick<D1Database, "prepare" | "batch">;
export class FamilyError extends Error {
  constructor(public readonly status: number, message: string, public readonly details: Record<string, unknown> = {}) { super(message); }
}
export function shortText(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new FamilyError(400, `${label}을(를) 확인해 주세요.`);
  return value.trim();
}
const roomSelect = `SELECT r.id, r.name, r.invite_code AS inviteCode, m.player_id AS playerId, m.nickname
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
    const members = (await this.db.prepare("SELECT player_id AS playerId, nickname FROM family_members WHERE room_id = ? ORDER BY joined_at").bind(roomId).all<{ playerId: string; nickname: string }>()).results;
    return { room, members };
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
