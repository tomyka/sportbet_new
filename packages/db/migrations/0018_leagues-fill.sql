-- Issue #29: every tournament has one public league, every tournament
-- player is a member of it and selects it. A league's name holds 255
-- characters, so a longer tournament name is cut.
INSERT INTO "leagues" ("tournament_id", "name", "is_public", "created_at")
SELECT t."id", left(t."name", 255), true, date_trunc('second', now()) FROM "tournaments" t
WHERE NOT EXISTS (
  SELECT 1 FROM "leagues" l WHERE l."tournament_id" = t."id" AND l."is_public"
);--> statement-breakpoint
INSERT INTO "league_members" ("league_id", "player_id", "is_admin", "is_guest", "joined_at")
SELECT l."id", tp."player_id", false, false, date_trunc('second', now())
FROM "tournament_players" tp
JOIN "leagues" l ON l."tournament_id" = tp."tournament_id" AND l."is_public"
ON CONFLICT ("league_id", "player_id") DO NOTHING;--> statement-breakpoint
UPDATE "tournament_players" tp SET "selected_league_id" = l."id"
FROM "leagues" l
WHERE l."tournament_id" = tp."tournament_id" AND l."is_public" AND tp."selected_league_id" IS NULL;
