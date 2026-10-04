import { and, eq, or } from "drizzle-orm";
import { db, blockedPlayersTable, friendshipsTable, playersTable } from "@workspace/db";

export function orderedPair(userId: string, otherId: string): [string, string] {
  return userId < otherId ? [userId, otherId] : [otherId, userId];
}

export async function isBlockedBetween(
  userId: string,
  otherId: string,
): Promise<boolean> {
  const [block] = await db
    .select({ blockerId: blockedPlayersTable.blockerId })
    .from(blockedPlayersTable)
    .where(
      or(
        and(
          eq(blockedPlayersTable.blockerId, userId),
          eq(blockedPlayersTable.blockedId, otherId),
        ),
        and(
          eq(blockedPlayersTable.blockerId, otherId),
          eq(blockedPlayersTable.blockedId, userId),
        ),
      ),
    )
    .limit(1);
  return Boolean(block);
}

export async function areFriends(
  userId: string,
  otherId: string,
): Promise<boolean> {
  const [userAId, userBId] = orderedPair(userId, otherId);
  const [friendship] = await db
    .select({ userAId: friendshipsTable.userAId })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.userAId, userAId),
        eq(friendshipsTable.userBId, userBId),
      ),
    )
    .limit(1);
  return Boolean(friendship);
}

export function toPresence(
  presence: "online" | "offline" | "in-game",
  lastSeenAt: Date,
): "online" | "offline" | "in-game" {
  if (presence === "in-game") return "in-game";
  return Date.now() - lastSeenAt.getTime() <= 2 * 60 * 1000
    ? "online"
    : "offline";
}

export async function listPlayersByIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      presence: playersTable.presence,
      lastSeenAt: playersTable.lastSeenAt,
    })
    .from(playersTable)
    .where(or(...userIds.map((id) => eq(playersTable.id, id))));
  return rows
    .map((player) => ({
      userId: player.id,
      username: player.username,
      presence: toPresence(player.presence, player.lastSeenAt),
    }))
    .sort((left, right) => left.username.localeCompare(right.username));
}