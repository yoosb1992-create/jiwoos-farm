import { foreignKey, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const editorDrafts = sqliteTable("editor_drafts", {
  ownerId: text("owner_id").primaryKey(),
  documentVersion: integer("document_version").notNull(),
  documentJson: text("document_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});

export const worldPresets = sqliteTable("world_presets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  documentVersion: integer("document_version").notNull(),
  documentJson: text("document_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});


export const farmAccounts = sqliteTable("farm_accounts", {
  id: text("id").primaryKey(),
  loginName: text("login_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("farm_accounts_login").on(table.loginName)]);

export const farmSessions = sqliteTable("farm_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => farmAccounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
}, (table) => [
  index("farm_sessions_account").on(table.accountId),
  index("farm_sessions_expiry").on(table.expiresAt),
]);

export const familyRooms = sqliteTable("family_rooms", {
  id: text("id").primaryKey(), name: text("name").notNull(), inviteCode: text("invite_code").notNull().unique(),
  ownerId: text("owner_id").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [index("family_rooms_owner").on(table.ownerId)]);
export const familyMembers = sqliteTable("family_members", {
  roomId: text("room_id").notNull().references(() => familyRooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), playerId: text("player_id").notNull().unique(), nickname: text("nickname").notNull(),
  joinedAt: integer("joined_at").notNull(), lastJoinedAt: integer("last_joined_at").notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.userId] }), index("family_members_user").on(table.userId, table.lastJoinedAt)]);
export const familyState = sqliteTable("family_state", {
  roomId: text("room_id").primaryKey().references(() => familyRooms.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0), worldJson: text("world_json").notNull(),
  inventoriesJson: text("inventories_json").notNull().default("{}"), updatedAt: integer("updated_at").notNull(),
});

export const familyPresence = sqliteTable("family_presence", {
  roomId: text("room_id").notNull(), userId: text("user_id").notNull(), sessionId: text("session_id").notNull(),
  poseJson: text("pose_json").notNull(), lastSeen: integer("last_seen").notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.userId] }),
  foreignKey({ columns: [table.roomId, table.userId], foreignColumns: [familyMembers.roomId, familyMembers.userId] }).onDelete("cascade"),
  index("family_presence_recent").on(table.roomId, table.lastSeen)]);

/** Personal NPC relationships/dialogue/quests, scoped to a family membership. */
export const familyPlayerProgress = sqliteTable("family_player_progress", {
  playerId: text("player_id").primaryKey().notNull().references(() => familyMembers.playerId, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0),
  progressJson: text("progress_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
