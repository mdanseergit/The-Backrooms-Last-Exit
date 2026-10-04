import {
  check,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { friendRequestStatusEnum } from "./enums";
import { playersTable } from "./players";

export const friendRequestsTable = pgTable(
  "friend_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    status: friendRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    recipientIndex: index("friend_requests_recipient_status_idx").on(
      table.toUserId,
      table.status,
      table.createdAt,
    ),
    noSelfRequest: check(
      "friend_requests_no_self_check",
      sql`${table.fromUserId} <> ${table.toUserId}`,
    ),
    senderIndex: index("friend_requests_sender_status_idx").on(
      table.fromUserId,
      table.status,
    ),
  }),
);

export const friendshipsTable = pgTable(
  "friendships",
  {
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    friendshipPk: primaryKey({ columns: [table.userAId, table.userBId] }),
    noSelfFriendship: check(
      "friendships_no_self_check",
      sql`${table.userAId} <> ${table.userBId}`,
    ),
    reverseLookupIndex: index("friendships_user_b_idx").on(table.userBId),
  }),
);

export const blockedPlayersTable = pgTable(
  "blocked_players",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    blockPk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
    noSelfBlock: check(
      "blocked_players_no_self_check",
      sql`${table.blockerId} <> ${table.blockedId}`,
    ),
    blockedLookupIndex: index("blocked_players_blocked_idx").on(table.blockedId),
  }),
);

export const insertFriendRequestSchema = createInsertSchema(
  friendRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type FriendRequestRow = typeof friendRequestsTable.$inferSelect;

export const insertFriendshipSchema = createInsertSchema(friendshipsTable).omit({
  createdAt: true,
});
export type InsertFriendship = z.infer<typeof insertFriendshipSchema>;
export type Friendship = typeof friendshipsTable.$inferSelect;

export const insertBlockedPlayerSchema = createInsertSchema(
  blockedPlayersTable,
).omit({ createdAt: true });
export type InsertBlockedPlayer = z.infer<typeof insertBlockedPlayerSchema>;
export type BlockedPlayer = typeof blockedPlayersTable.$inferSelect;