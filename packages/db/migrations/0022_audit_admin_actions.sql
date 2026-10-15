CREATE TYPE "public"."audit_admin_kind" AS ENUM('role_change', 'account_deletion');--> statement-breakpoint
CREATE TABLE "audit_admin_actions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_admin_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actor_id" integer,
	"target_id" integer,
	"kind" "audit_admin_kind" NOT NULL,
	"old_role" "player_role",
	"new_role" "player_role",
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_admin_actions" ADD CONSTRAINT "audit_admin_actions_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_admin_actions" ADD CONSTRAINT "audit_admin_actions_target_fk" FOREIGN KEY ("target_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_admin_actions_actor_idx" ON "audit_admin_actions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_admin_actions_target_idx" ON "audit_admin_actions" USING btree ("target_id");