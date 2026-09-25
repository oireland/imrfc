import { boolean, pgTable, text } from "drizzle-orm/pg-core";

export const store = pgTable("store", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  mapsLink: text("maps_link"),
  archived: boolean("archived").notNull().default(false),
});
