import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const SESSION_COOKIE = "worklog_session";
const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24;
const REMEMBERED_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function shouldUseSecureSessionCookie() {
  return process.env.NODE_ENV === "production" && process.env.WORKLOG_DESKTOP !== "1";
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }

  return new TextEncoder().encode(secret);
}

export async function createUserSession({
  sessionId,
  userId,
  role,
  email,
  rememberMe = false,
}: {
  sessionId: string;
  userId: string;
  role: string;
  email: string;
  rememberMe?: boolean;
}) {
  const sessionMaxAge = rememberMe ? REMEMBERED_SESSION_MAX_AGE : DEFAULT_SESSION_MAX_AGE;
  const expiresAt = new Date(Date.now() + sessionMaxAge * 1000);
  const cookieStore = await cookies();

  const token = await new SignJWT({ sessionId, userId, role, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAge}s`)
    .sign(getSecret());

  // Validate/sign first: a missing secret must not leave an orphan session.
  await db.userSession.create({
    data: { sessionId, userId, expiresAt },
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    expires: rememberMe ? expiresAt : undefined,
  });
}

export async function clearUserSession(sessionId?: string) {
  if (sessionId) {
    await db.userSession.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    expires: new Date(0),
  });
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as {
    sessionId: string;
    userId: string;
    role: string;
    email: string;
  };
}
