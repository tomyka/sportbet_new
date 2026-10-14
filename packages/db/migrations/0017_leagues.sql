CREATE TABLE "league_invites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "league_invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer NOT NULL,
	"invitee_id" integer NOT NULL,
	"invited_by_id" integer,
	"created_at" timestamp with time zone,
	CONSTRAINT "league_invites_league_invitee_unique" UNIQUE("league_id","invitee_id")
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "league_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"paid_cents" integer,
	"joined_at" timestamp with time zone,
	CONSTRAINT "league_members_league_player_unique" UNIQUE("league_id","player_id"),
	CONSTRAINT "league_members_paid_cents_range" CHECK ("league_members"."paid_cents" >= 0 and "league_members"."paid_cents" <= 99999999)
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leagues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"owner_id" integer,
	"base_fee" integer,
	"penalty_step" integer,
	"reward_description" text,
	"payment_beneficiary" text,
	"payment_iban" text,
	"payment_note" text,
	"created_at" timestamp with time zone,
	CONSTRAINT "leagues_id_tournament_unique" UNIQUE("id","tournament_id"),
	CONSTRAINT "leagues_public_has_no_owner" CHECK (not "leagues"."is_public" or "leagues"."owner_id" is null),
	CONSTRAINT "leagues_name_length" CHECK ("leagues"."name" ~ '[\s]|[^\s]' and char_length("leagues"."name") <= 255),
	CONSTRAINT "leagues_base_fee_range" CHECK ("leagues"."base_fee" >= 0 and "leagues"."base_fee" <= 2147483647),
	CONSTRAINT "leagues_penalty_step_range" CHECK ("leagues"."penalty_step" >= 0 and "leagues"."penalty_step" <= 2147483647),
	CONSTRAINT "leagues_payment_beneficiary_length" CHECK ("leagues"."payment_beneficiary" ~ '^' and char_length("leagues"."payment_beneficiary") <= 70),
	CONSTRAINT "leagues_payment_iban_length" CHECK ("leagues"."payment_iban" ~ '^' and char_length("leagues"."payment_iban") <= 34)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer,
	"text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "messages_text_length" CHECK ("messages"."text" ~ '[\s]|[^\s]' and char_length("messages"."text") <= 255)
);
--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "selected_league_id" integer;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_invitee_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_invited_by_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_invites_invitee_idx" ON "league_invites" USING btree ("invitee_id");--> statement-breakpoint
CREATE INDEX "league_members_player_idx" ON "league_members" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_one_public_per_tournament" ON "leagues" USING btree ("tournament_id") WHERE "leagues"."is_public";--> statement-breakpoint
CREATE INDEX "leagues_tournament_idx" ON "leagues" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "messages_league_idx" ON "messages" USING btree ("league_id");--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_league_fk" FOREIGN KEY ("selected_league_id","player_id") REFERENCES "public"."league_members"("league_id","player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_league_fk" FOREIGN KEY ("selected_league_id","tournament_id") REFERENCES "public"."leagues"("id","tournament_id") ON DELETE no action ON UPDATE no action;