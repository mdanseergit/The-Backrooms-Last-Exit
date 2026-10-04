import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { SESSION_COOKIE, readSessionToken } from "../lib/session";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const userId = await readSessionToken(token);
  if (!userId) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "Your session has expired. Sign in again." });
    return;
  }

  const [player] = await db
    .select({ id: playersTable.id, presence: playersTable.presence })
    .from(playersTable)
    .where(eq(playersTable.id, userId))
    .limit(1);

  if (!player) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "This account no longer exists." });
    return;
  }

  await db
    .update(playersTable)
    .set({
      lastSeenAt: new Date(),
      presence: player.presence === "offline" ? "online" : player.presence,
    })
    .where(eq(playersTable.id, player.id));

  res.locals.userId = player.id;
  next();
};

export function authenticatedUserId(res: {
  locals: Record<string, unknown>;
}): string {
  const userId = res.locals.userId;
  if (typeof userId !== "string") {
    throw new Error("Authenticated route is missing the player identity.");
  }
  return userId;
}