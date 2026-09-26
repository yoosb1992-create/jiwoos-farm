import { parseFamilyPose } from "../../game/family/personal";
import { FAMILY_PRESENCE_TTL_MS } from "../../game/family/presence";
import type { FamilyPresence, FamilyPresenceSnapshot } from "../../game/family/types";
import { FamilyError, FamilyRooms } from "./rooms";

export class FamilyPresenceService extends FamilyRooms {
  private session(value: unknown) {
    if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value)) throw new FamilyError(400, "접속 세션이 올바르지 않습니다.");
    return value;
  }
  async read(userId: string, roomId: string): Promise<FamilyPresenceSnapshot> {
    await this.requireMember(userId, roomId);
    const rows = (await this.db.prepare(`SELECT m.player_id AS playerId, m.nickname, p.pose_json, p.last_seen AS lastSeen
      FROM family_presence p JOIN family_members m ON p.room_id = m.room_id AND p.user_id = m.user_id
      WHERE p.room_id = ? AND p.last_seen > ? ORDER BY m.player_id`)
      .bind(roomId, this.now() - FAMILY_PRESENCE_TTL_MS).all<{ playerId: string; nickname: string; pose_json: string; lastSeen: number }>()).results;
    const players: FamilyPresence[] = rows.map(({ pose_json, ...row }) => ({ ...JSON.parse(pose_json), ...row }));
    return { players, serverNow: this.now() };
  }
  async heartbeat(userId: string, roomId: string, rawPose: unknown, sessionId: unknown) {
    await this.requireMember(userId, roomId);
    const pose = parseFamilyPose(rawPose), session = this.session(sessionId);
    if (!pose) throw new FamilyError(400, "플레이어 위치가 올바르지 않습니다.");
    await this.db.prepare(`INSERT INTO family_presence (room_id, user_id, session_id, pose_json, last_seen) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(room_id, user_id) DO UPDATE SET session_id = excluded.session_id, pose_json = excluded.pose_json, last_seen = excluded.last_seen`)
      .bind(roomId, userId, session, JSON.stringify(pose), this.now()).run();
    return this.read(userId, roomId);
  }
  async leave(userId: string, roomId: string, sessionId: unknown) {
    await this.requireMember(userId, roomId);
    await this.db.prepare("DELETE FROM family_presence WHERE room_id = ? AND user_id = ? AND session_id = ?").bind(roomId, userId, this.session(sessionId)).run();
    return { left: true };
  }
}
