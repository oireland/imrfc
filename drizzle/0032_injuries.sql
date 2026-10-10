CREATE TABLE "injury" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"area" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"happened_on" date NOT NULL,
	"event_id" text,
	"status" text NOT NULL,
	"expected_return" date,
	"needs_physio" boolean DEFAULT false NOT NULL,
	"physio_note" text DEFAULT '' NOT NULL,
	"reported_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"mistake_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "injury_change" (
	"id" text PRIMARY KEY NOT NULL,
	"injury_id" text NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text DEFAULT '' NOT NULL,
	"by_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "injury" ADD CONSTRAINT "injury_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury" ADD CONSTRAINT "injury_reported_by_id_user_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_change" ADD CONSTRAINT "injury_change_injury_id_injury_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injury"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_change" ADD CONSTRAINT "injury_change_by_id_user_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "injury_user_id_idx" ON "injury" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "injury_change_injury_id_idx" ON "injury_change" USING btree ("injury_id");