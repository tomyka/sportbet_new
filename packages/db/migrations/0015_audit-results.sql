CREATE TABLE "audit_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"old_home" smallint,
	"old_away" smallint,
	"old_postponed" boolean NOT NULL,
	"new_home" smallint,
	"new_away" smallint,
	"new_postponed" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_results_old_home_not_negative" CHECK ("audit_results"."old_home" >= 0),
	CONSTRAINT "audit_results_old_away_not_negative" CHECK ("audit_results"."old_away" >= 0),
	CONSTRAINT "audit_results_new_home_not_negative" CHECK ("audit_results"."new_home" >= 0),
	CONSTRAINT "audit_results_new_away_not_negative" CHECK ("audit_results"."new_away" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_results_player_idx" ON "audit_results" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "audit_results_game_idx" ON "audit_results" USING btree ("game_id");