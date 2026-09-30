CREATE TYPE "public"."points_source" AS ENUM('production', 'sportbet', 'ruled');--> statement-breakpoint
CREATE TYPE "public"."prediction_origin" AS ENUM('real', 'fill-in', 'late-fill-in');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('regular', 'play-in', 'play-offs', 'final-four', 'final');--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	CONSTRAINT "players_username_unique" UNIQUE("username"),
	CONSTRAINT "players_username_format" CHECK ("players"."username" ~ '[^\t\n\v\f\r    -     　﻿]' and char_length("players"."username") <= 255)
);
--> statement-breakpoint
CREATE TABLE "tournament_players" (
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"switched_off" boolean NOT NULL,
	"admin_hidden" boolean DEFAULT false NOT NULL,
	"fill_ins" integer NOT NULL,
	CONSTRAINT "tournament_players_pk" PRIMARY KEY("tournament_id","player_id"),
	CONSTRAINT "tournament_players_fill_ins_not_negative" CHECK ("tournament_players"."fill_ins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "game_odds" (
	"source" "points_source" NOT NULL,
	"game_id" integer NOT NULL,
	"home" numeric(8, 2) NOT NULL,
	"away" numeric(8, 2) NOT NULL,
	"draw" numeric(8, 2) NOT NULL,
	CONSTRAINT "game_odds_pk" PRIMARY KEY("source","game_id"),
	CONSTRAINT "game_odds_home_not_negative" CHECK ("game_odds"."home" >= 0),
	CONSTRAINT "game_odds_away_not_negative" CHECK ("game_odds"."away" >= 0),
	CONSTRAINT "game_odds_draw_not_negative" CHECK ("game_odds"."draw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_points" (
	"source" "points_source" NOT NULL,
	"player_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"winner" numeric(8, 2) NOT NULL,
	"margin" numeric(8, 2) NOT NULL,
	"bingo" numeric(8, 2) NOT NULL,
	"odds_points" numeric(8, 2) NOT NULL,
	"full" numeric(8, 2) NOT NULL,
	"odds" numeric(8, 2) NOT NULL,
	"serija" numeric(8, 2) NOT NULL,
	CONSTRAINT "match_points_pk" PRIMARY KEY("source","player_id","game_id"),
	CONSTRAINT "match_points_odds_not_negative" CHECK ("match_points"."odds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "standings_points" (
	"source" "points_source" NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"place_points" numeric(10, 4),
	"place_odds" numeric(10, 4),
	"play_offs_points" numeric(10, 4),
	"play_offs_odds" numeric(10, 4),
	"final_four_points" numeric(10, 4),
	"final_four_odds" numeric(10, 4),
	"final_points" numeric(10, 4),
	"final_odds" numeric(10, 4),
	CONSTRAINT "standings_points_pk" PRIMARY KEY("source","player_id","team_id"),
	CONSTRAINT "standings_points_place_odds_not_negative" CHECK ("standings_points"."place_odds" >= 0),
	CONSTRAINT "standings_points_play_offs_odds_not_negative" CHECK ("standings_points"."play_offs_odds" >= 0),
	CONSTRAINT "standings_points_final_four_odds_not_negative" CHECK ("standings_points"."final_four_odds" >= 0),
	CONSTRAINT "standings_points_final_odds_not_negative" CHECK ("standings_points"."final_odds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "survival_points" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "survival_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" "points_source" NOT NULL,
	"player_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"points" numeric(8, 2),
	"provisional" boolean NOT NULL,
	"stored_row_id" integer,
	CONSTRAINT "survival_points_production_shape" CHECK ("survival_points"."source" <> 'production' or ("survival_points"."points" is not null and not "survival_points"."provisional")),
	CONSTRAINT "survival_points_rewrites_production" CHECK ("survival_points"."stored_row_id" is null or "survival_points"."source" <> 'production')
);
--> statement-breakpoint
CREATE TABLE "match_predictions" (
	"player_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"home" smallint,
	"away" smallint,
	"origin" "prediction_origin" NOT NULL,
	"filled_in_at" timestamp with time zone,
	CONSTRAINT "match_predictions_pk" PRIMARY KEY("player_id","game_id"),
	CONSTRAINT "match_predictions_not_level" CHECK ("match_predictions"."home" is null or "match_predictions"."away" is null or "match_predictions"."home" <> "match_predictions"."away"),
	CONSTRAINT "match_predictions_fill_in_scored" CHECK ("match_predictions"."origin" = 'real' or ("match_predictions"."home" is not null and "match_predictions"."away" is not null)),
	CONSTRAINT "match_predictions_fill_in_time" CHECK ("match_predictions"."origin" <> 'real' or "match_predictions"."filled_in_at" is null),
	CONSTRAINT "match_predictions_home_not_negative" CHECK ("match_predictions"."home" >= 0),
	CONSTRAINT "match_predictions_away_not_negative" CHECK ("match_predictions"."away" >= 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"tip_off" timestamp with time zone NOT NULL,
	"home_score" smallint,
	"away_score" smallint,
	"recorded_winner_id" integer,
	"postponed" boolean DEFAULT false NOT NULL,
	"locked_since" timestamp with time zone,
	CONSTRAINT "games_round_teams_unique" UNIQUE("round_id","home_team_id","away_team_id"),
	CONSTRAINT "games_teams_differ" CHECK ("games"."home_team_id" <> "games"."away_team_id"),
	CONSTRAINT "games_result_both_or_neither" CHECK (("games"."home_score" is null) = ("games"."away_score" is null)),
	CONSTRAINT "games_winner_needs_result" CHECK ("games"."recorded_winner_id" is null or "games"."home_score" is not null),
	CONSTRAINT "games_winner_in_game" CHECK ("games"."recorded_winner_id" is null or "games"."recorded_winner_id" in ("games"."home_team_id", "games"."away_team_id")),
	CONSTRAINT "games_postponed_without_result" CHECK (not "games"."postponed" or "games"."home_score" is null),
	CONSTRAINT "games_home_score_not_negative" CHECK ("games"."home_score" >= 0),
	CONSTRAINT "games_away_score_not_negative" CHECK ("games"."away_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"number" smallint NOT NULL,
	"name" text NOT NULL,
	"stage" "stage" NOT NULL,
	"rate" smallint NOT NULL,
	"survival" boolean NOT NULL,
	"knockout" boolean NOT NULL,
	CONSTRAINT "rounds_tournament_number_unique" UNIQUE("tournament_id","number"),
	CONSTRAINT "rounds_tournament_id_id_unique" UNIQUE("tournament_id","id"),
	CONSTRAINT "rounds_number_positive" CHECK ("rounds"."number" >= 1),
	CONSTRAINT "rounds_rate_positive" CHECK ("rounds"."rate" >= 1)
);
--> statement-breakpoint
CREATE TABLE "standings_predictions" (
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"place" smallint,
	"play_offs" boolean,
	"final_four" boolean,
	"final_place" smallint,
	CONSTRAINT "standings_predictions_pk" PRIMARY KEY("player_id","team_id"),
	CONSTRAINT "standings_predictions_place_not_negative" CHECK ("standings_predictions"."place" >= 0),
	CONSTRAINT "standings_predictions_final_place_range" CHECK ("standings_predictions"."final_place" >= 1 and "standings_predictions"."final_place" <= 4)
);
--> statement-breakpoint
CREATE TABLE "survival_picks" (
	"player_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	CONSTRAINT "survival_picks_pk" PRIMARY KEY("player_id","round_id")
);
--> statement-breakpoint
CREATE TABLE "team_outcomes" (
	"team_id" integer PRIMARY KEY NOT NULL,
	"place" smallint,
	"play_offs" boolean NOT NULL,
	"final_four" boolean NOT NULL,
	"final_place" smallint,
	CONSTRAINT "team_outcomes_place_positive" CHECK ("team_outcomes"."place" >= 1),
	CONSTRAINT "team_outcomes_final_place_range" CHECK ("team_outcomes"."final_place" >= 1 and "team_outcomes"."final_place" <= 4)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "teams_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "teams_tournament_id_id_unique" UNIQUE("tournament_id","id")
);
--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_odds" ADD CONSTRAINT "game_odds_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_points" ADD CONSTRAINT "match_points_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_points" ADD CONSTRAINT "match_points_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_points" ADD CONSTRAINT "standings_points_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_points" ADD CONSTRAINT "standings_points_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_team_fk" FOREIGN KEY ("tournament_id","team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_stored_row_fk" FOREIGN KEY ("stored_row_id") REFERENCES "public"."survival_points"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_fk" FOREIGN KEY ("tournament_id","home_team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_fk" FOREIGN KEY ("tournament_id","away_team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_predictions" ADD CONSTRAINT "standings_predictions_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_predictions" ADD CONSTRAINT "standings_predictions_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_picks" ADD CONSTRAINT "survival_picks_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_picks" ADD CONSTRAINT "survival_picks_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_picks" ADD CONSTRAINT "survival_picks_team_fk" FOREIGN KEY ("tournament_id","team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_outcomes" ADD CONSTRAINT "team_outcomes_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survival_points_stored_row_unique" ON "survival_points" USING btree ("source","stored_row_id") WHERE "survival_points"."stored_row_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "survival_points_pick_unique" ON "survival_points" USING btree ("source","player_id","round_id") WHERE "survival_points"."stored_row_id" is null and "survival_points"."source" <> 'production';
