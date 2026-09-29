CREATE TABLE `editor_drafts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`document_version` integer NOT NULL,
	`document_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
