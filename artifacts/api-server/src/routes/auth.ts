import { Router, type IRouter, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import {
  CreateGuestResponse,
  GetCurrentUserResponse,
  LoginUserBody,
  LoginUserResponse,
  LogoutUserResponse,
  RegisterUserBody,
  RegisterUserResponse,
} from "@workspace/api-zod";
import { db, playersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/require-auth";
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../lib/session";

const router: IRouter = Router();
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait before trying again." },
});

const reservedNames = new Set([
  "admin",
  "administrator",
  "async",
  "asynclabs",
  "moderator",
  "mod",
  "server",
  "support",
  "system",
]);
const blockedWords = ["fuck", "shit", "bitch"];

function validateUsername(username: string): string | null {
  const normalized = username.toLowerCase();
  if (reservedNames.has(normalized.replaceAll("_", ""))) {
    return "That username is reserved.";
  }
  if (blockedWords.some((word) => normalized.includes(word))) {
    return "That username is not allowed.";
  }
  return null;
}

function publicPlayer(player: {
  id: string;
  username: string;
  presence: "online" | "offline" | "in-game";
  characterSkin: string;
  isGuest: boolean;
}) {
  return {
    id: player.id,
    username: player.username,
    presence: player.presence,
    characterSkin: player.characterSkin,
    isGuest: player.isGuest,
  };
}

async function setSession(
  res: Response,
  userId: string,
): Promise<void> {
  const token = await createSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a 3–16 character username and a password of at least 10 characters." });
    return;
  }

  const username = parsed.data.username;
  const normalized = username.toLowerCase();
  const usernameError = validateUsername(username);
  if (usernameError) {
    res.status(400).json({ error: usernameError });
    return;
  }

  const [existing] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(eq(playersTable.usernameNormalized, normalized))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "That username is already taken." });
    return;
  }

  const passwordHash = await argon2.hash(parsed.data.password, {
    type: argon2.argon2id,
  });
  try {
    const [player] = await db
      .insert(playersTable)
      .values({
        username,
        usernameNormalized: normalized,
        passwordHash,
        isGuest: false,
        presence: "online",
        lastSeenAt: new Date(),
      })
      .returning({
        id: playersTable.id,
        username: playersTable.username,
        presence: playersTable.presence,
        characterSkin: playersTable.characterSkin,
        isGuest: playersTable.isGuest,
      });
    await setSession(res, player.id);
    res.status(201).json(RegisterUserResponse.parse({ user: publicPlayer(player) }));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    throw error;
  }
});

router.post("/auth/guest", authRateLimit, async (_req, res): Promise<void> => {
  let player:
    | {
        id: string;
        username: string;
        presence: "online" | "offline" | "in-game";
        characterSkin: string;
        isGuest: boolean;
      }
    | undefined;

  for (let attempt = 0; attempt < 5 && !player; attempt += 1) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const suffix = Array.from(
      { length: 4 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
    const username = `Wanderer_${suffix}`;
    const [created] = await db
      .insert(playersTable)
      .values({
        username,
        usernameNormalized: username.toLowerCase(),
        passwordHash: null,
        isGuest: true,
        presence: "online",
        lastSeenAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({
        id: playersTable.id,
        username: playersTable.username,
        presence: playersTable.presence,
        characterSkin: playersTable.characterSkin,
        isGuest: playersTable.isGuest,
      });
    player = created;
  }

  if (!player) {
    res.status(503).json({ error: "Could not create a guest account. Please try again." });
    return;
  }
  await setSession(res, player.id);
  res.status(201).json(CreateGuestResponse.parse({ user: publicPlayer(player) }));
});

router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid username and password." });
    return;
  }

  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.usernameNormalized, parsed.data.username.toLowerCase()))
    .limit(1);
  if (
    !player ||
    player.isGuest ||
    !player.passwordHash ||
    !(await argon2.verify(player.passwordHash, parsed.data.password))
  ) {
    res.status(401).json({ error: "Incorrect username or password." });
    return;
  }

  const [updated] = await db
    .update(playersTable)
    .set({ presence: "online", lastSeenAt: new Date() })
    .where(and(eq(playersTable.id, player.id), eq(playersTable.isGuest, false)))
    .returning({
      id: playersTable.id,
      username: playersTable.username,
      presence: playersTable.presence,
      characterSkin: playersTable.characterSkin,
      isGuest: playersTable.isGuest,
    });

  await setSession(res, updated.id);
  res.json(LoginUserResponse.parse({ user: publicPlayer(updated) }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    const userId = await readSessionToken(token);
    if (userId) {
      await db
        .update(playersTable)
        .set({ presence: "offline", lastSeenAt: new Date() })
        .where(eq(playersTable.id, userId));
    }
  }
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: sessionCookieOptions.httpOnly,
    sameSite: sessionCookieOptions.sameSite,
    secure: sessionCookieOptions.secure,
    path: sessionCookieOptions.path,
  });
  res.json(LogoutUserResponse.parse({ success: true }));
});

router.get("/auth/me", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const [player] = await db
    .update(playersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(playersTable.id, userId))
    .returning({
      id: playersTable.id,
      username: playersTable.username,
      presence: playersTable.presence,
      characterSkin: playersTable.characterSkin,
      isGuest: playersTable.isGuest,
    });
  if (!player) {
    res.status(401).json({ error: "This account no longer exists." });
    return;
  }
  res.json(GetCurrentUserResponse.parse(player));
});

export default router;