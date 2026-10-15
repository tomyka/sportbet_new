ALTER TYPE "public"."login_code_purpose" ADD VALUE IF NOT EXISTS 'admin_action';--> statement-breakpoint
ALTER TABLE "player_settings" ADD COLUMN "admin_tournament_id" integer;--> statement-breakpoint
ALTER TABLE "player_settings" ADD CONSTRAINT "player_settings_admin_tournament_fk" FOREIGN KEY ("admin_tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;