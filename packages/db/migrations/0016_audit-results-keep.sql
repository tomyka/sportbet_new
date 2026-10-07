ALTER TABLE "audit_results" DROP CONSTRAINT "audit_results_player_fk";
--> statement-breakpoint
ALTER TABLE "audit_results" ALTER COLUMN "player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;