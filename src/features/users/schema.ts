import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { RUGBY_POSITIONS } from "./positions";

// Better Auth's core tables, plus our own `role` and `accessState` on `user`.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["member", "committee", "admin"] })
    .notNull()
    .default("member"),
  accessState: text("access_state", { enum: ["pending", "approved", "blocked", "deleted"] })
    .notNull()
    .default("pending"),
  // Colour theme chosen from the crest menu; "system" follows the device.
  theme: text("theme", { enum: ["system", "light", "dark"] })
    .notNull()
    .default("system"),
  // Set during onboarding; the `players` feature reads this as Preferred Position.
  preferredPosition: text("preferred_position", { enum: RUGBY_POSITIONS }),
  // Any number of further Positions, beyond the Preferred one.
  otherPositions: text("other_positions", { enum: RUGBY_POSITIONS }).array().notNull().default([]),
  // Whether this User counts as a Player; off for someone who's stopped playing but keeps their account.
  playing: boolean("playing").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
