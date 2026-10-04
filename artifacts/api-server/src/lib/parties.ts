import { and, eq } from "drizzle-orm";
import {
  db,
  partiesTable,
  partyMembersTable,
  playersTable,
} from "@workspace/db";
import { toPresence } from "./social";

export async function findPartyForPlayer(userId: string) {
  const [membership] = await db
    .select({
      partyId: partyMembersTable.partyId,
      leaderId: partiesTable.leaderId,
    })
    .from(partyMembersTable)
    .innerJoin(partiesTable, eq(partiesTable.id, partyMembersTable.partyId))
    .where(eq(partyMembersTable.userId, userId))
    .limit(1);
  return membership ?? null;
}

export async function getPartyState(userId: string) {
  const membership = await findPartyForPlayer(userId);
  if (!membership) return { party: null };

  const [party] = await db
    .select({
      id: partiesTable.id,
      roomCode: partiesTable.roomCode,
      mode: partiesTable.mode,
      isPrivate: partiesTable.isPrivate,
      status: partiesTable.status,
    })
    .from(partiesTable)
    .where(eq(partiesTable.id, membership.partyId))
    .limit(1);
  if (!party) return { party: null };

  const members = await db
    .select({
      userId: playersTable.id,
      username: playersTable.username,
      teamSlot: partyMembersTable.teamSlot,
      ready: partyMembersTable.ready,
      isLeader: partiesTable.leaderId,
      presence: playersTable.presence,
      lastSeenAt: playersTable.lastSeenAt,
    })
    .from(partyMembersTable)
    .innerJoin(playersTable, eq(playersTable.id, partyMembersTable.userId))
    .innerJoin(partiesTable, eq(partiesTable.id, partyMembersTable.partyId))
    .where(eq(partyMembersTable.partyId, party.id))
    .orderBy(partyMembersTable.joinedAt);

  return {
    party: {
      ...party,
      members: members.map((member) => ({
        userId: member.userId,
        username: member.username,
        teamSlot: member.teamSlot,
        ready: member.ready,
        isLeader: member.isLeader === member.userId,
        presence: toPresence(member.presence, member.lastSeenAt),
      })),
    },
  };
}

export async function getPartyById(partyId: string) {
  const [party] = await db
    .select()
    .from(partiesTable)
    .where(eq(partiesTable.id, partyId))
    .limit(1);
  return party ?? null;
}

export async function getPartyMember(
  partyId: string,
  userId: string,
) {
  const [member] = await db
    .select()
    .from(partyMembersTable)
    .where(
      and(
        eq(partyMembersTable.partyId, partyId),
        eq(partyMembersTable.userId, userId),
      ),
    )
    .limit(1);
  return member ?? null;
}

export function chooseAvailableTeamSlot(
  members: Array<{ teamSlot: number }>,
  mode: "coop-squad" | "team-race",
): number | null {
  if (mode === "coop-squad") {
    return members.length < 4 ? 1 : null;
  }
  for (let teamSlot = 1; teamSlot <= 4; teamSlot += 1) {
    if (members.filter((member) => member.teamSlot === teamSlot).length < 4) {
      return teamSlot;
    }
  }
  return null;
}

export async function getAvailableTeamSlot(
  partyId: string,
  mode: "coop-squad" | "team-race",
): Promise<number | null> {
  const members = await db
    .select({ teamSlot: partyMembersTable.teamSlot })
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, partyId));
  return chooseAvailableTeamSlot(members, mode);
}