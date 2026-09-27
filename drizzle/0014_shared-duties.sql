-- Shared Duties: a Duty can have several Users, so `duty.user_id` becomes a join
-- table `duty_user` (dutyId, userId). Hand-written (not drizzle-kit's drop-and-recreate)
-- so existing Duties keep their User.

-- 1. The new join table.
CREATE TABLE "duty_user" (
	"id" text PRIMARY KEY NOT NULL,
	"duty_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "duty_user_duty_id_user_id_unique" UNIQUE("duty_id","user_id")
);--> statement-breakpoint
ALTER TABLE "duty_user" ADD CONSTRAINT "duty_user_duty_id_duty_id_fk" FOREIGN KEY ("duty_id") REFERENCES "public"."duty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_user" ADD CONSTRAINT "duty_user_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 2. Copy every existing Duty's single User across as its one row.
INSERT INTO "duty_user" ("id", "duty_id", "user_id")
SELECT gen_random_uuid()::text, "id", "user_id" FROM "duty" WHERE "user_id" IS NOT NULL;--> statement-breakpoint

-- 3. Drop the old column; `duty_user` is now the only record of who is on a Duty.
ALTER TABLE "duty" DROP CONSTRAINT "duty_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "duty" DROP COLUMN "user_id";
