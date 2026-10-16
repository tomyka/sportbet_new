ALTER TABLE "players" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_pending_email_format" CHECK ("players"."pending_email" ~ '^[^\t\n\v\f\r @A-Z]+@[^\t\n\v\f\r @A-Z]+$' and char_length("players"."pending_email") <= 255);