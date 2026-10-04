import { randomInt } from "node:crypto";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AcceptPartyInvitationParams,
  AcceptPartyInvitationResponse,
  CreatePartyBody,
  CreatePartyResponse,
  DeclinePartyInvitationParams,
  DeclinePartyInvitationResponse,
  GetCurrentPartyResponse,
  GetLobbySummaryResponse,
  GetPartyInvitationsResponse,
  InviteToPartyBody,
  InviteToPartyResponse,
  JoinPartyBody,
  JoinPartyResponse,
  LeavePartyResponse,
  SetPartyModeBody,
  SetPartyModeResponse,
  SetPartyReadyBody,
  SetPartyReadyResponse,
  SetPartyTeamBody,
  SetPartyTeamResponse,
  StartPartyResponse,
} from "@workspace/api-zod";
import {
  db,
  friendRequestsTable,
  friendshipsTable,
  partiesTable,
  partyInvitationsTable,
  partyMembersTable,
  playersTable,
} from "@workspace/db";
import { authenticatedUserId, requireAuth } from "../middlewares/require-auth";
import {
  chooseAvailableTeamSlot,
  findPartyForPlayer,
  getAvailableTeamSlot,
  getPartyById,
  getPartyState,
} from "../lib/parties";
import { areFriends, isBlockedBetween } from "../lib/social";

const router: IRouter = Router();
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
router.use(requireAuth);

function createRoomCode(): string {
  return Array.from(
    { length: 6 },
    () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)],
  ).join("");
}

router.get("/parties/me", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  res.json(GetCurrentPartyResponse.parse(await getPartyState(userId)));
});

router.post("/parties", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = CreatePartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid game mode." });
    return;
  }
  if (await findPartyForPlayer(userId)) {
    res.status(409).json({ error: "Leave your current party before creating another." });
    return;
  }

  let created = false;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    created = await db.transaction(async (tx) => {
      const [party] = await tx
        .insert(partiesTable)
        .values({
          roomCode: createRoomCode(),
          mode: parsed.data.mode,
          isPrivate: parsed.data.isPrivate,
          leaderId: userId,
        })
        .onConflictDoNothing()
        .returning({ id: partiesTable.id });
      if (!party) return false;
      await tx.insert(partyMembersTable).values({
        partyId: party.id,
        userId,
        teamSlot: 1,
        ready: false,
      });
      return true;
    });
  }
  if (!created) {
    res.status(503).json({ error: "Could not reserve a lobby code. Try again." });
    return;
  }
  res.status(201).json(
    CreatePartyResponse.parse(await getPartyState(userId)),
  );
});

router.post("/parties/join", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = JoinPartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a six-character room code." });
    return;
  }
  if (await findPartyForPlayer(userId)) {
    res.status(409).json({ error: "Leave your current party before joining another." });
    return;
  }
  const [party] = await db
    .select()
    .from(partiesTable)
    .where(eq(partiesTable.roomCode, parsed.data.roomCode.toUpperCase()))
    .limit(1);
  if (!party) {
    res.status(404).json({ error: "That lobby is unavailable." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [lockedParty] = await tx
        .select()
        .from(partiesTable)
        .where(eq(partiesTable.id, party.id))
        .limit(1)
        .for("update");
      if (!lockedParty || lockedParty.status !== "lobby") return "unavailable";

      const members = await tx
        .select({ userId: partyMembersTable.userId, teamSlot: partyMembersTable.teamSlot })
        .from(partyMembersTable)
        .where(eq(partyMembersTable.partyId, lockedParty.id));
      if (lockedParty.isPrivate) {
        const memberIds = members.map((member) => member.userId);
        const [friendship] = memberIds.length
          ? await tx
              .select({ userAId: friendshipsTable.userAId })
              .from(friendshipsTable)
              .where(
                or(
                  and(
                    eq(friendshipsTable.userAId, userId),
                    inArray(friendshipsTable.userBId, memberIds),
                  ),
                  and(
                    eq(friendshipsTable.userBId, userId),
                    inArray(friendshipsTable.userAId, memberIds),
                  ),
                ),
              )
              .limit(1)
          : [];
        if (!friendship) {
          return "not-friend";
        }
      }

      const teamSlot = chooseAvailableTeamSlot(members, lockedParty.mode);
      if (teamSlot === null) return "full";
      await tx.insert(partyMembersTable).values({
        partyId: lockedParty.id,
        userId,
        teamSlot,
        ready: false,
      });
      return "joined";
    });
    if (result === "unavailable") {
      res.status(404).json({ error: "That lobby is unavailable." });
      return;
    }
    if (result === "not-friend") {
      res.status(403).json({ error: "Private lobbies can only be joined by friends." });
      return;
    }
    if (result === "full") {
      res.status(409).json({ error: "That lobby is full." });
      return;
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "You are already in a party or the lobby filled up." });
      return;
    }
    throw error;
  }
  res.json(JoinPartyResponse.parse(await getPartyState(userId)));
});

router.get("/parties/invitations", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const invitations = await db
    .select({
      id: partyInvitationsTable.id,
      partyId: partyInvitationsTable.partyId,
      roomCode: partiesTable.roomCode,
      fromUsername: playersTable.username,
      createdAt: partyInvitationsTable.createdAt,
    })
    .from(partyInvitationsTable)
    .innerJoin(partiesTable, eq(partiesTable.id, partyInvitationsTable.partyId))
    .innerJoin(playersTable, eq(playersTable.id, partyInvitationsTable.fromUserId))
    .where(
      and(
        eq(partyInvitationsTable.toUserId, userId),
        eq(partyInvitationsTable.status, "pending"),
        eq(partiesTable.status, "lobby"),
      ),
    );
  res.json(
    GetPartyInvitationsResponse.parse(
      invitations.map((invite) => ({
        ...invite,
        createdAt: invite.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/parties/invitations", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = InviteToPartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid username." });
    return;
  }
  const membership = await findPartyForPlayer(userId);
  if (!membership || membership.leaderId !== userId) {
    res.status(403).json({ error: "Only the party leader can invite players." });
    return;
  }
  const party = await getPartyById(membership.partyId);
  if (!party || party.status !== "lobby") {
    res.status(409).json({ error: "This party is no longer accepting invitations." });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(eq(playersTable.usernameNormalized, parsed.data.username.toLowerCase()))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "No player has that username." });
    return;
  }
  if (target.id === userId) {
    res.status(400).json({ error: "You cannot invite yourself." });
    return;
  }
  if (!(await areFriends(userId, target.id)) || (await isBlockedBetween(userId, target.id))) {
    res.status(403).json({ error: "Only unblocked friends can be invited." });
    return;
  }
  if (await findPartyForPlayer(target.id)) {
    res.status(409).json({ error: "That player is already in a party." });
    return;
  }
  if ((await getAvailableTeamSlot(party.id, party.mode)) === null) {
    res.status(409).json({ error: "Your party is full." });
    return;
  }
  const [existing] = await db
    .select({ id: partyInvitationsTable.id })
    .from(partyInvitationsTable)
    .where(
      and(
        eq(partyInvitationsTable.partyId, party.id),
        eq(partyInvitationsTable.toUserId, target.id),
        eq(partyInvitationsTable.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A party invitation is already pending." });
    return;
  }
  const [invite] = await db
    .insert(partyInvitationsTable)
    .values({ partyId: party.id, fromUserId: userId, toUserId: target.id })
    .returning({
      id: partyInvitationsTable.id,
      partyId: partyInvitationsTable.partyId,
      createdAt: partyInvitationsTable.createdAt,
    });
  const [sender] = await db
    .select({ username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, userId))
    .limit(1);
  res.status(201).json(
    InviteToPartyResponse.parse({
      ...invite,
      roomCode: party.roomCode,
      fromUsername: sender.username,
      createdAt: invite.createdAt.toISOString(),
    }),
  );
});

router.post(
  "/parties/invitations/:invitationId/accept",
  async (req, res): Promise<void> => {
    const userId = authenticatedUserId(res);
    const params = AcceptPartyInvitationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid invitation id." });
      return;
    }
    if (await findPartyForPlayer(userId)) {
      res.status(409).json({ error: "Leave your current party before joining another." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(partyInvitationsTable)
        .where(
          and(
            eq(partyInvitationsTable.id, params.data.invitationId),
            eq(partyInvitationsTable.toUserId, userId),
            eq(partyInvitationsTable.status, "pending"),
          ),
        )
        .limit(1)
        .for("update");
      if (!invite) return "missing";

      const [party] = await tx
        .select()
        .from(partiesTable)
        .where(eq(partiesTable.id, invite.partyId))
        .limit(1)
        .for("update");
      if (!party || party.status !== "lobby") return "unavailable";

      const members = await tx
        .select({ teamSlot: partyMembersTable.teamSlot })
        .from(partyMembersTable)
        .where(eq(partyMembersTable.partyId, party.id));
      const teamSlot = chooseAvailableTeamSlot(members, party.mode);
      if (teamSlot === null) return "full";

      await tx.insert(partyMembersTable).values({
        partyId: party.id,
        userId,
        teamSlot,
        ready: false,
      });
      await tx
        .update(partyInvitationsTable)
        .set({ status: "accepted" })
        .where(eq(partyInvitationsTable.id, invite.id));
      return "joined";
    });
    if (result === "missing") {
      res.status(404).json({ error: "That invitation is no longer available." });
      return;
    }
    if (result === "unavailable") {
      res.status(409).json({ error: "That lobby is no longer available." });
      return;
    }
    if (result === "full") {
      res.status(409).json({ error: "That lobby is full." });
      return;
    }
    res.json(
      AcceptPartyInvitationResponse.parse(await getPartyState(userId)),
    );
  },
);

router.post(
  "/parties/invitations/:invitationId/decline",
  async (req, res): Promise<void> => {
    const userId = authenticatedUserId(res);
    const params = DeclinePartyInvitationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid invitation id." });
      return;
    }
    const [invite] = await db
      .update(partyInvitationsTable)
      .set({ status: "declined" })
      .where(
        and(
          eq(partyInvitationsTable.id, params.data.invitationId),
          eq(partyInvitationsTable.toUserId, userId),
          eq(partyInvitationsTable.status, "pending"),
        ),
      )
      .returning({ id: partyInvitationsTable.id });
    if (!invite) {
      res.status(404).json({ error: "That invitation is no longer available." });
      return;
    }
    res.json(DeclinePartyInvitationResponse.parse({ success: true }));
  },
);

router.post("/parties/leave", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const membership = await findPartyForPlayer(userId);
  if (!membership) {
    res.status(409).json({ error: "You are not in a party." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .select({ id: partiesTable.id })
      .from(partiesTable)
      .where(eq(partiesTable.id, membership.partyId))
      .limit(1)
      .for("update");
    await tx
      .delete(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, membership.partyId),
          eq(partyMembersTable.userId, userId),
        ),
      );
    if (membership.leaderId === userId) {
      const [nextLeader] = await tx
        .select({ userId: partyMembersTable.userId })
        .from(partyMembersTable)
        .where(eq(partyMembersTable.partyId, membership.partyId))
        .orderBy(partyMembersTable.joinedAt)
        .limit(1);
      if (nextLeader) {
        await tx
          .update(partiesTable)
          .set({ leaderId: nextLeader.userId })
          .where(eq(partiesTable.id, membership.partyId));
      } else {
        await tx
          .delete(partiesTable)
          .where(eq(partiesTable.id, membership.partyId));
      }
    }
  });
  res.json(LeavePartyResponse.parse({ success: true }));
});

router.patch("/parties/me/ready", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = SetPartyReadyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ready state." });
    return;
  }
  const membership = await findPartyForPlayer(userId);
  const party = membership ? await getPartyById(membership.partyId) : null;
  if (!membership || !party || party.status !== "lobby") {
    res.status(409).json({ error: "You are not in a lobby." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [lockedParty] = await tx
      .select({ status: partiesTable.status })
      .from(partiesTable)
      .where(eq(partiesTable.id, party.id))
      .limit(1)
      .for("update");
    if (!lockedParty || lockedParty.status !== "lobby") return "closed";
    await tx
      .update(partyMembersTable)
      .set({ ready: parsed.data.ready })
      .where(
        and(
          eq(partyMembersTable.partyId, party.id),
          eq(partyMembersTable.userId, userId),
        ),
      );
    return "updated";
  });
  if (result === "closed") {
    res.status(409).json({ error: "This lobby is no longer accepting changes." });
    return;
  }
  res.json(SetPartyReadyResponse.parse(await getPartyState(userId)));
});

router.patch("/parties/me/team", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = SetPartyTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a team slot from 1 to 4." });
    return;
  }
  const membership = await findPartyForPlayer(userId);
  const party = membership ? await getPartyById(membership.partyId) : null;
  if (!membership || !party || party.status !== "lobby") {
    res.status(409).json({ error: "You are not in a lobby." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [lockedParty] = await tx
      .select()
      .from(partiesTable)
      .where(eq(partiesTable.id, party.id))
      .limit(1)
      .for("update");
    if (!lockedParty || lockedParty.status !== "lobby") return "closed";
    if (lockedParty.mode === "coop-squad" && parsed.data.teamSlot !== 1) {
      return "coop";
    }
    const playersInTeam = await tx
      .select({ userId: partyMembersTable.userId })
      .from(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, party.id),
          eq(partyMembersTable.teamSlot, parsed.data.teamSlot),
        ),
      );
    if (
      playersInTeam.length >= 4 &&
      !playersInTeam.some((member) => member.userId === userId)
    ) {
      return "full";
    }
    await tx
      .update(partyMembersTable)
      .set({ teamSlot: parsed.data.teamSlot, ready: false })
      .where(
        and(
          eq(partyMembersTable.partyId, party.id),
          eq(partyMembersTable.userId, userId),
        ),
      );
    return "updated";
  });
  if (result === "closed") {
    res.status(409).json({ error: "You are not in a lobby." });
    return;
  }
  if (result === "coop") {
    res.status(400).json({ error: "Co-op squad players must use Team 1." });
    return;
  }
  if (result === "full") {
    res.status(409).json({ error: "That team already has four players." });
    return;
  }
  res.json(SetPartyTeamResponse.parse(await getPartyState(userId)));
});

router.patch("/parties/me/mode", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = SetPartyModeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid game mode." });
    return;
  }
  const membership = await findPartyForPlayer(userId);
  const party = membership ? await getPartyById(membership.partyId) : null;
  if (!membership || !party || party.leaderId !== userId) {
    res.status(403).json({ error: "Only the party leader can change the game mode." });
    return;
  }
  if (party.status !== "lobby") {
    res.status(409).json({ error: "The game mode cannot change after the lobby starts." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [lockedParty] = await tx
      .select()
      .from(partiesTable)
      .where(eq(partiesTable.id, party.id))
      .limit(1)
      .for("update");
    if (!lockedParty || lockedParty.leaderId !== userId) return "forbidden";
    if (lockedParty.status !== "lobby") return "closed";
    await tx
      .update(partiesTable)
      .set({ mode: parsed.data.mode })
      .where(eq(partiesTable.id, lockedParty.id));
    await tx
      .update(partyMembersTable)
      .set({ teamSlot: 1, ready: false })
      .where(eq(partyMembersTable.partyId, lockedParty.id));
    return "updated";
  });
  if (result === "forbidden") {
    res.status(403).json({ error: "Only the party leader can change the game mode." });
    return;
  }
  if (result === "closed") {
    res.status(409).json({ error: "The game mode cannot change after the lobby starts." });
    return;
  }
  res.json(SetPartyModeResponse.parse(await getPartyState(userId)));
});

router.post("/parties/start", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const membership = await findPartyForPlayer(userId);
  const party = membership ? await getPartyById(membership.partyId) : null;
  if (!membership || !party || party.leaderId !== userId) {
    res.status(403).json({ error: "Only the party leader can start this lobby." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [lockedParty] = await tx
      .select()
      .from(partiesTable)
      .where(eq(partiesTable.id, party.id))
      .limit(1)
      .for("update");
    if (!lockedParty || lockedParty.leaderId !== userId) return "forbidden";
    if (lockedParty.status !== "lobby") return "closed";
    const members = await tx
      .select({ ready: partyMembersTable.ready })
      .from(partyMembersTable)
      .where(eq(partyMembersTable.partyId, party.id));
    if (members.length === 0 || members.some((member) => !member.ready)) return "not-ready";
    await tx
      .update(partiesTable)
      .set({ status: "starting" })
      .where(eq(partiesTable.id, party.id));
    return "started";
  });
  if (result === "forbidden") {
    res.status(403).json({ error: "Only the party leader can start this lobby." });
    return;
  }
  if (result === "closed") {
    res.status(409).json({ error: "This lobby is no longer accepting a start." });
    return;
  }
  if (result === "not-ready") {
    res.status(409).json({ error: "Every player must be ready before the lobby can start." });
    return;
  }
  res.json(StartPartyResponse.parse(await getPartyState(userId)));
});

router.get("/lobby/summary", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const links = await db
    .select({
      userAId: friendshipsTable.userAId,
      userBId: friendshipsTable.userBId,
    })
    .from(friendshipsTable)
    .where(
      or(
        eq(friendshipsTable.userAId, userId),
        eq(friendshipsTable.userBId, userId),
      ),
    );
  const friendIds = links.map((link) =>
    link.userAId === userId ? link.userBId : link.userAId,
  );
  let friendsOnline = 0;
  if (friendIds.length > 0) {
    const friends = await db
      .select({ presence: playersTable.presence, lastSeenAt: playersTable.lastSeenAt })
      .from(playersTable)
      .where(inArray(playersTable.id, friendIds));
    friendsOnline = friends.filter(
      (friend) =>
        friend.presence === "in-game" ||
        Date.now() - friend.lastSeenAt.getTime() <= 2 * 60 * 1000,
    ).length;
  }
  const [friendRequestCount] = await db
    .select({ value: count() })
    .from(friendRequestsTable)
    .where(
      and(
        eq(friendRequestsTable.toUserId, userId),
        eq(friendRequestsTable.status, "pending"),
      ),
    );
  const [partyInvitationCount] = await db
    .select({ value: count() })
    .from(partyInvitationsTable)
    .where(
      and(
        eq(partyInvitationsTable.toUserId, userId),
        eq(partyInvitationsTable.status, "pending"),
      ),
    );
  res.json(
    GetLobbySummaryResponse.parse({
      friendsOnline,
      incomingFriendRequests: Number(friendRequestCount.value),
      partyInvitations: Number(partyInvitationCount.value),
    }),
  );
});

export default router;