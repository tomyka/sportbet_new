CREATE TABLE "job_leases" (
	"job" text PRIMARY KEY NOT NULL,
	"held_until" timestamp with time zone NOT NULL,
	"run_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_settings" ADD COLUMN "receive_reminders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_predictions" ADD COLUMN "reminded_at" timestamp with time zone;