ALTER TABLE "survival_points" DROP CONSTRAINT "survival_points_stored_row_fk";
--> statement-breakpoint
ALTER TABLE "survival_points" ADD COLUMN "sportbet_id" integer;--> statement-breakpoint
-- Hand-edited: drizzle-kit adds the foreign key before the unique key it
-- references, which Postgres refuses, and cannot know that a production
-- row's id so far was sportbet's. Each production row keeps it as its
-- sportbet_id, which every stored_row_id already names; the unique keys
-- then come before the foreign key and the CHECK.
UPDATE "survival_points" SET "sportbet_id" = "id" WHERE "source" = 'production';--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_sportbet_id_unique" UNIQUE("sportbet_id");--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_tournament_sportbet_id_unique" UNIQUE("tournament_id","sportbet_id");--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_stored_row_fk" FOREIGN KEY ("tournament_id","stored_row_id") REFERENCES "public"."survival_points"("tournament_id","sportbet_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_sportbet_id" CHECK (("survival_points"."source" = 'production') = ("survival_points"."sportbet_id" is not null));
