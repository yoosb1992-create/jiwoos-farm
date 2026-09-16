import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const editorDrafts = sqliteTable("editor_drafts", {
  ownerId: text("owner_id").primaryKey(),
  documentVersion: integer("document_version").notNull(),
  documentJson: text("document_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});
