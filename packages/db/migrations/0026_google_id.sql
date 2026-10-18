ALTER TYPE "public"."audit_login_method" ADD VALUE 'google';--> statement-breakpoint
ALTER TYPE "public"."audit_login_method" ADD VALUE 'register_google';--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_google_id_format" CHECK ("players"."google_id" ~ '^[A-Za-z0-9_-]+$' and char_length("players"."google_id") <= 255);