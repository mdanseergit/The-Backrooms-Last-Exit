import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "last_exit_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSigningKey(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 bytes.");
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ scope: "player" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSigningKey());
}

export async function readSessionToken(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      algorithms: ["HS256"],
    });
    return payload.scope === "player" && typeof payload.sub === "string"
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

const isProduction = process.env.NODE_ENV === "production";

export const sessionCookieOptions = {
  httpOnly: true,
  // Cross-origin deployments (Vercel frontend + Render API) need SameSite=none
  // so the browser sends cookies with cross-origin requests.
  // SameSite=none requires Secure=true (HTTPS only).
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  secure: isProduction,
  path: "/",
  maxAge: SESSION_TTL_SECONDS * 1000,
};