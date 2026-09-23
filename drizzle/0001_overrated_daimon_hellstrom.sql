CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"maps_link" text,
	"is_venue" boolean DEFAULT false NOT NULL,
	"is_store" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
