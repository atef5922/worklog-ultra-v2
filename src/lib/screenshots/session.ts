import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifySessionToken } from "@/lib/auth/session";

/**
 * Resolves the caller for a screenshot API route.
 *
 * `requireUser()` from lib/auth/server redirects to the login page when a
 * session is missing, which is right for pages but wrong here: the desktop
 * agent and fetch callers need a 401 they can act on, not a 307 to HTML. This
 * returns null instead and lets each route answer with a proper status.
 */
export async function getScreenshotApiUser() {
  const token = (await cookies()).get("worklog_session")?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await verifySessionToken(token);
    const session = await db.userSession.findFirst({
      where: {
        sessionId: payload.sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        user: {
          select: {
            id: true,
            role: true,
            departmentId: true,
            isActive: true,
          },
        },
      },
    });

    if (!session?.user?.isActive) {
      return null;
    }

    return session.user;
  } catch {
    return null;
  }
}
