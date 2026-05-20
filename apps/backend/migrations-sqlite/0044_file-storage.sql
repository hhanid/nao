PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message_image` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text,
	`media_type` text NOT NULL,
	`filename` text,
	`size` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_message_image`("id", "data", "media_type", "filename", "size", "created_at") SELECT "id", "data", "media_type", "filename", "size", "created_at" FROM `message_image`;--> statement-breakpoint
DROP TABLE `message_image`;--> statement-breakpoint
ALTER TABLE `__new_message_image` RENAME TO `message_image`;--> statement-breakpoint
PRAGMA foreign_keys=ON;