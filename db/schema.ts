import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const editorDrafts = sqliteTable("editor_drafts", {
  ownerId: text("owner_id").primaryKey(),
  documentVersion: integer("document_version").notNull(),
  documentJson: text("document_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});


export const familyRooms = sqliteTable("family_rooms", {
  id: text("id").primaryKey(), name: text("name").notNull(), inviteCode: text("invite_code").notNull().unique(),
  ownerId: text("owner_id").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [index("family_rooms_owner").on(table.ownerId)]);
export const familyMembers = sqliteTable("family_members", {
  roomId: text("room_id").notNull().references(() => familyRooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), playerId: text("player_id").notNull().unique(), nickname: text("nickname").notNull(),
  joinedAt: integer("joined_at").notNull(), lastJoinedAt: integer("last_joined_at").notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.userId] }), index("family_members_user").on(table.userId, table.lastJoinedAt)]);
