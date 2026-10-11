ALTER TABLE `books` ADD `ebook_drive_file_id` text;--> statement-breakpoint
ALTER TABLE `books` ADD `ebook_format` text;--> statement-breakpoint
ALTER TABLE `books` ADD `ebook_size_bytes` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `books` ADD `ebook_file_name` text;--> statement-breakpoint
ALTER TABLE `books` ADD `ebook_checksum` text;--> statement-breakpoint
CREATE INDEX `books_ebook_idx` ON `books` (`ebook_drive_file_id`);