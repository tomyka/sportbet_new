CREATE INDEX "tournament_players_player_idx" ON "tournament_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_points_game_idx" ON "match_points" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "standings_points_team_idx" ON "standings_points" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "survival_points_tournament_source_idx" ON "survival_points" USING btree ("tournament_id","source");--> statement-breakpoint
CREATE INDEX "match_predictions_game_idx" ON "match_predictions" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "games_tournament_round_idx" ON "games" USING btree ("tournament_id","round_id");--> statement-breakpoint
CREATE INDEX "standings_predictions_team_idx" ON "standings_predictions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "survival_picks_tournament_round_idx" ON "survival_picks" USING btree ("tournament_id","round_id");