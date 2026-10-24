CREATE TABLE "audit_survival_picks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_survival_picks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"old_team_id" integer,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_survival_picks" ADD CONSTRAINT "audit_survival_picks_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_survival_picks" ADD CONSTRAINT "audit_survival_picks_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_survival_picks" ADD CONSTRAINT "audit_survival_picks_team_fk" FOREIGN KEY ("tournament_id","team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_survival_picks" ADD CONSTRAINT "audit_survival_picks_old_team_fk" FOREIGN KEY ("tournament_id","old_team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_survival_picks_player_idx" ON "audit_survival_picks" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "audit_survival_picks_round_idx" ON "audit_survival_picks" USING btree ("tournament_id","round_id");