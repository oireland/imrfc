CREATE TABLE "player_away" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_date" date NOT NULL,
	"until_date" date NOT NULL,
	"reason" text NOT NULL,
	"set_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "player_away" ADD CONSTRAINT "player_away_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_away" ADD CONSTRAINT "player_away_set_by_id_user_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_away_user_id_idx" ON "player_away" USING btree ("user_id");