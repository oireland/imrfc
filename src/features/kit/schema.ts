import { pgTable, text } from "drizzle-orm/pg-core";
import { location } from "@/features/locations";

export const kitUnit = pgTable("kit_unit", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  homeId: text("home_id")
    .notNull()
    .references(() => location.id),
  status: text("status", { enum: ["active", "missing", "retired"] })
    .notNull()
    .default("active"),
  conditionNote: text("condition_note").notNull().default(""),
});
