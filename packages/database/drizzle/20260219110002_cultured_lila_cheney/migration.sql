ALTER TABLE "collections" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "is_locked";