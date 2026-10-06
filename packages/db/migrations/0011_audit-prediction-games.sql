CREATE TABLE "audit_prediction_games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_prediction_games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"home" smallint NOT NULL,
	"away" smallint NOT NULL,
	"old_home" smallint,
	"old_away" smallint,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_prediction_games_home_not_negative" CHECK ("audit_prediction_games"."home" >= 0),
	CONSTRAINT "audit_prediction_games_away_not_negative" CHECK ("audit_prediction_games"."away" >= 0),
	CONSTRAINT "audit_prediction_games_old_home_not_negative" CHECK ("audit_prediction_games"."old_home" >= 0),
	CONSTRAINT "audit_prediction_games_old_away_not_negative" CHECK ("audit_prediction_games"."old_away" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_prediction_games" ADD CONSTRAINT "audit_prediction_games_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_prediction_games" ADD CONSTRAINT "audit_prediction_games_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_prediction_games_player_idx" ON "audit_prediction_games" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "audit_prediction_games_game_idx" ON "audit_prediction_games" USING btree ("game_id");