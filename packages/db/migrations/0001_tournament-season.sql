ALTER TABLE "tournaments" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "standings_deadline_round" smallint;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "survival" boolean;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "standings_table_final" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hand-edited (drizzle-kit adds the two columns NOT NULL at once, which a
-- table with rows refuses): staging's seeded tournaments are the only rows
-- a database holds before this migration, so they get the seed's own values
-- (packages/db/src/seed/staging.ts); any other row stops the migration at
-- SET NOT NULL instead of being given a date nobody chose.
UPDATE "tournaments" SET "ends_on" = CASE "slug" WHEN 'euroleague-2025-26' THEN DATE '2026-05-24' WHEN 'euroleague-2026-27' THEN DATE '2027-05-23' END, "survival" = true;--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "ends_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "survival" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_deadline_round_positive" CHECK ("tournaments"."standings_deadline_round" >= 1);
