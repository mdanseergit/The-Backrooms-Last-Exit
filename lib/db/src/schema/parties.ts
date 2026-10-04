import {
  index,
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  partyInvitationStatusEnum,
  partyModeEnum,
  partyStatusEnum,
} from "./enums";
import { playersTable } from "./players";

export const partiesTable = pgTable(
  "parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomCode: text("room_code").notNull(),
    mode: partyModeEnum("mode").notNull().default("coop-squad"),
    isPrivate: boolean("is_private").notNull().default(true),
    status: partyStatusEnum("status").notNull().default("lobby"),
    leaderId: uuid("leader_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roomCodeUnique: uniqueIndex("parties_room_code_unique").on(table.roomCode),
    roomCodeFormat: check(
      "parties_room_code_format_check",
      sql`${table.roomCode} ~ '^[A-Z0-9]{6}$'`,
    ),
    leaderIndex: index("parties_leader_idx").on(table.leaderId),
  }),
);

export const partyMembersTable = pgTable(
  "party_members",
  {
    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    teamSlot: integer("team_slot").notNull().default(1),
    ready: boolean("ready").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    membershipPk: primaryKey({ columns: [table.partyId, table.userId] }),
    teamSlotRange: check(
      "party_members_team_slot_range_check",
      sql`${table.teamSlot} BETWEEN 1 AND 4`,
    ),
    onePartyPerPlayer: uniqueIndex("party_members_one_party_per_player").on(
      table.userId,
    ),
    partyTeamIndex: index("party_members_party_team_idx").on(
      table.partyId,
      table.teamSlot,
    ),
  }),
);

export const partyInvitationsTable = pgTable(
  "party_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    status: partyInvitationStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    recipientIndex: index("party_invitations_recipient_status_idx").on(
      table.toUserId,
      table.status,
      table.createdAt,
    ),
    partyIndex: index("party_invitations_party_idx").on(table.partyId),
    noSelfInvite: check(
      "party_invitations_no_self_check",
      sql`${table.fromUserId} <> ${table.toUserId}`,
    ),
  }),
);

export const insertPartySchema = createInsertSchema(partiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertParty = z.infer<typeof insertPartySchema>;
export type PartyRow = typeof partiesTable.$inferSelect;

export const insertPartyMemberSchema = createInsertSchema(
  partyMembersTable,
).omit({ joinedAt: true });
export type InsertPartyMember = z.infer<typeof insertPartyMemberSchema>;
export type PartyMemberRow = typeof partyMembersTable.$inferSelect;

export const insertPartyInvitationSchema = createInsertSchema(
  partyInvitationsTable,
).omit({ id: true, createdAt: true });
export type InsertPartyInvitation = z.infer<typeof insertPartyInvitationSchema>;
export type PartyInvitationRow = typeof partyInvitationsTable.$inferSelect;