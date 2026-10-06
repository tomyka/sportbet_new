CREATE TYPE "public"."tournament_status" AS ENUM('upcoming', 'active', 'finished');--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "status" "tournament_status" DEFAULT 'upcoming' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "sport" text DEFAULT 'basketball' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;