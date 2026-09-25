import { boolean, pgTable, text } from "drizzle-orm/pg-core";

export const location = pgTable("location", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  mapsLink: text("maps_link"),
  isVenue: boolean("is_venue").notNull().default(false),
  isStore: boolean("is_store").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
});
