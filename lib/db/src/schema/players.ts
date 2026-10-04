import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { presenceEnum } from "./enums";

export const playersTable = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    passwordHash: text("password_hash"),
    isGuest: boolean("is_guest").notNull().default(false),
    presence: presenceEnum("presence").notNull().default("offline"),
    characterSkin: text("character_skin").notNull().default("wanderer"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    usernameNormalizedUnique: uniqueIndex("players_username_normalized_unique").on(
      table.usernameNormalized,
    ),
    usernameFormat: check(
      "players_username_format_check",
      sql`${table.username} ~ '^[A-Za-z0-9_]{3,16}$'`,
    ),
    guestPassword: check(
      "players_guest_password_check",
      sql`(${table.isGuest} AND ${table.passwordHash} IS NULL) OR (NOT ${table.isGuest} AND ${table.passwordHash} IS NOT NULL)`,
    ),
  }),
);

export const insertPlayerSchema = createInsertSchema(playersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;