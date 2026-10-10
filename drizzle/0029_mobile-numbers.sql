CREATE TABLE "mobile_number" (
	"user_id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mobile_number" ADD CONSTRAINT "mobile_number_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;