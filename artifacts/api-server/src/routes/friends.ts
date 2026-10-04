import { and, eq, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AcceptFriendRequestParams,
  AcceptFriendRequestResponse,
  BlockPlayerBody,
  BlockPlayerResponse,
  DeclineFriendRequestParams,
  DeclineFriendRequestResponse,
  GetBlockedPlayersResponse,
  GetFriendRequestsResponse,
  GetFriendsResponse,
  RemoveFriendParams,
  RemoveFriendResponse,
  SendFriendRequestBody,
  SendFriendRequestResponse,
  UnblockPlayerParams,
  UnblockPlayerResponse,
} from "@workspace/api-zod";
import {
  blockedPlayersTable,
  db,
  friendRequestsTable,
  friendshipsTable,
  playersTable,
} from "@workspace/db";
import { authenticatedUserId, requireAuth } from "../middlewares/require-auth";
import { areFriends, isBlockedBetween, listPlayersByIds, orderedPair } from "../lib/social";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/friends", async (_req, res): Promise<void> => {
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
  res.json(GetFriendsResponse.parse(await listPlayersByIds(friendIds)));
});

router.get("/friends/requests", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const rows = await db
    .select({
      id: friendRequestsTable.id,
      userId: playersTable.id,
      username: playersTable.username,
      createdAt: friendRequestsTable.createdAt,
    })
    .from(friendRequestsTable)
    .innerJoin(playersTable, eq(playersTable.id, friendRequestsTable.fromUserId))
    .where(
      and(
        eq(friendRequestsTable.toUserId, userId),
        eq(friendRequestsTable.status, "pending"),
      ),
    );
  res.json(
    GetFriendRequestsResponse.parse(
      rows.map((request) => ({
        ...request,
        createdAt: request.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/friends/requests", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = SendFriendRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid username." });
    return;
  }
  const [target] = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
    })
    .from(playersTable)
    .where(eq(playersTable.usernameNormalized, parsed.data.username.toLowerCase()))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "No player has that username." });
    return;
  }
  if (target.id === userId) {
    res.status(400).json({ error: "You cannot add yourself as a friend." });
    return;
  }
  if (await isBlockedBetween(userId, target.id)) {
    res.status(403).json({ error: "This player cannot receive a request." });
    return;
  }
  if (await areFriends(userId, target.id)) {
    res.status(409).json({ error: "You are already friends." });
    return;
  }
  const [existing] = await db
    .select({ id: friendRequestsTable.id })
    .from(friendRequestsTable)
    .where(
      and(
        eq(friendRequestsTable.status, "pending"),
        or(
          and(
            eq(friendRequestsTable.fromUserId, userId),
            eq(friendRequestsTable.toUserId, target.id),
          ),
          and(
            eq(friendRequestsTable.fromUserId, target.id),
            eq(friendRequestsTable.toUserId, userId),
          ),
        ),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A friend request is already pending." });
    return;
  }
  const [request] = await db
    .insert(friendRequestsTable)
    .values({ fromUserId: userId, toUserId: target.id })
    .returning({
      id: friendRequestsTable.id,
      userId: friendRequestsTable.toUserId,
      createdAt: friendRequestsTable.createdAt,
    });
  res.status(201).json(
    SendFriendRequestResponse.parse({
      id: request.id,
      userId: target.id,
      username: target.username,
      createdAt: request.createdAt.toISOString(),
    }),
  );
});

router.post(
  "/friends/requests/:requestId/accept",
  async (req, res): Promise<void> => {
    const userId = authenticatedUserId(res);
    const params = AcceptFriendRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request id." });
      return;
    }
    const request = await db.transaction(async (tx) => {
      const [pending] = await tx
        .select()
        .from(friendRequestsTable)
        .where(
          and(
            eq(friendRequestsTable.id, params.data.requestId),
            eq(friendRequestsTable.toUserId, userId),
            eq(friendRequestsTable.status, "pending"),
          ),
        )
        .limit(1);
      if (!pending) return null;
      await tx
        .update(friendRequestsTable)
        .set({ status: "accepted" })
        .where(eq(friendRequestsTable.id, pending.id));
      const [userAId, userBId] = orderedPair(userId, pending.fromUserId);
      await tx
        .insert(friendshipsTable)
        .values({ userAId, userBId })
        .onConflictDoNothing();
      return pending;
    });
    if (!request) {
      res.status(404).json({ error: "That pending request was not found." });
      return;
    }
    res.json(AcceptFriendRequestResponse.parse({ success: true }));
  },
);

router.post(
  "/friends/requests/:requestId/decline",
  async (req, res): Promise<void> => {
    const userId = authenticatedUserId(res);
    const params = DeclineFriendRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request id." });
      return;
    }
    const [request] = await db
      .update(friendRequestsTable)
      .set({ status: "declined" })
      .where(
        and(
          eq(friendRequestsTable.id, params.data.requestId),
          eq(friendRequestsTable.toUserId, userId),
          eq(friendRequestsTable.status, "pending"),
        ),
      )
      .returning({ id: friendRequestsTable.id });
    if (!request) {
      res.status(404).json({ error: "That pending request was not found." });
      return;
    }
    res.json(DeclineFriendRequestResponse.parse({ success: true }));
  },
);

router.delete("/friends/:friendId", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const params = RemoveFriendParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid player id." });
    return;
  }
  const [userAId, userBId] = orderedPair(userId, params.data.friendId);
  await db
    .delete(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.userAId, userAId),
        eq(friendshipsTable.userBId, userBId),
      ),
    );
  res.json(RemoveFriendResponse.parse({ success: true }));
});

router.get("/blocks", async (_req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const rows = await db
    .select({
      userId: playersTable.id,
      username: playersTable.username,
      presence: playersTable.presence,
      lastSeenAt: playersTable.lastSeenAt,
    })
    .from(blockedPlayersTable)
    .innerJoin(playersTable, eq(playersTable.id, blockedPlayersTable.blockedId))
    .where(eq(blockedPlayersTable.blockerId, userId));
  res.json(
    GetBlockedPlayersResponse.parse(
      rows.map((player) => ({
        userId: player.userId,
        username: player.username,
        presence:
          player.presence === "in-game"
            ? "in-game"
            : Date.now() - player.lastSeenAt.getTime() <= 2 * 60 * 1000
              ? "online"
              : "offline",
      })),
    ),
  );
});

router.post("/blocks", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const parsed = BlockPlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid username." });
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
    res.status(400).json({ error: "You cannot block yourself." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(blockedPlayersTable)
      .values({ blockerId: userId, blockedId: target.id })
      .onConflictDoNothing();
    const [userAId, userBId] = orderedPair(userId, target.id);
    await tx
      .delete(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.userAId, userAId),
          eq(friendshipsTable.userBId, userBId),
        ),
      );
    await tx
      .update(friendRequestsTable)
      .set({ status: "declined" })
      .where(
        and(
          eq(friendRequestsTable.status, "pending"),
          or(
            and(
              eq(friendRequestsTable.fromUserId, userId),
              eq(friendRequestsTable.toUserId, target.id),
            ),
            and(
              eq(friendRequestsTable.fromUserId, target.id),
              eq(friendRequestsTable.toUserId, userId),
            ),
          ),
        ),
      );
  });
  res.status(201).json(BlockPlayerResponse.parse({ success: true }));
});

router.delete("/blocks/:playerId", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(res);
  const params = UnblockPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid player id." });
    return;
  }
  await db
    .delete(blockedPlayersTable)
    .where(
      and(
        eq(blockedPlayersTable.blockerId, userId),
        eq(blockedPlayersTable.blockedId, params.data.playerId),
      ),
    );
  res.json(UnblockPlayerResponse.parse({ success: true }));
});

export default router;