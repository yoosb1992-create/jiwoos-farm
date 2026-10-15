CREATE TABLE `family_player_progress` (
	`player_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`progress_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `family_members`(`player_id`) ON UPDATE no action ON DELETE cascade
);
