CREATE TYPE "public"."player_role" AS ENUM('player', 'results-manager', 'superadmin');--> statement-breakpoint
ALTER TABLE "player_settings" ADD COLUMN "role" "player_role" DEFAULT 'player' NOT NULL;