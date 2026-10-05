CREATE TYPE "public"."audit_login_method" AS ENUM('email_code');--> statement-breakpoint
CREATE TYPE "public"."login_code_purpose" AS ENUM('login', 'registration', 'account_deletion', 'email_change');--> statement-breakpoint
CREATE TABLE "audit_logins" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"method" "audit_login_method" NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"purpose" "login_code_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "login_codes_email_format" CHECK ("login_codes"."email" ~ '^[^\t\n\v\f\r @A-Z]+@[^\t\n\v\f\r @A-Z]+$' and char_length("login_codes"."email") <= 255)
);
--> statement-breakpoint
CREATE TABLE "player_settings" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'lt' NOT NULL,
	"admin_level" smallint DEFAULT 0 NOT NULL,
	"last_tournament_id" integer,
	CONSTRAINT "player_settings_locale_format" CHECK ("player_settings"."locale" ~ '^(lt|en)$'),
	CONSTRAINT "player_settings_admin_level_range" CHECK ("player_settings"."admin_level" >= 0 and "player_settings"."admin_level" <= 127)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"token_hash" text NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "surname" text NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logins" ADD CONSTRAINT "audit_logins_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_settings" ADD CONSTRAINT "player_settings_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_settings" ADD CONSTRAINT "player_settings_last_tournament_fk" FOREIGN KEY ("last_tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logins_player_idx" ON "audit_logins" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "login_codes_email_purpose_idx" ON "login_codes" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_started_at");--> statement-breakpoint
CREATE INDEX "sessions_player_idx" ON "sessions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_email_folded_unique" ON "players" USING btree (email_fold("email"));--> statement-breakpoint
CREATE INDEX "players_email_idx" ON "players" USING btree ("email");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_email_format" CHECK ("players"."email" ~ '^[^\t\n\v\f\r @A-Z]+@[^\t\n\v\f\r @A-Z]+$' and char_length("players"."email") <= 255);--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_name_length" CHECK ("players"."name" ~ '^' and char_length("players"."name") <= 255);--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_surname_length" CHECK ("players"."surname" ~ '^' and char_length("players"."surname") <= 255);