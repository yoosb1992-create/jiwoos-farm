CREATE TABLE `world_presets` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `document_version` integer NOT NULL,
  `document_json` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `updated_at` integer NOT NULL
);
