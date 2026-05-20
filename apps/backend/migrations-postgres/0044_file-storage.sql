ALTER TABLE "message_image" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_image" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "message_image" ADD COLUMN "size" integer;