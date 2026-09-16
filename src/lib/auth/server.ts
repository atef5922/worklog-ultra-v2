import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessTeamAnalytics, routeByRole } from "@/lib/auth/roles";
import { canViewAttendanceDetails } from "@/lib/auth/policy";
import { verifySessionToken } from "@/lib/auth/session";

export async function getServerAuthContext() {
  const token = (await cookies()).get("worklog_session")?.value;

  if (!token) {
    return { user: null, staleSession: false };
  }

  try {
    const payload = await verifySessionToken(token);
    const session = await db.userSession.findFirst({
      where: {
        sessionId: payload.sessionId,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            department: true,
            permissions: true,
            accessScopes: true,
            ledTeams: { select: { id: true } },
            team: true,
          },
        },
      },
    });

    if (!session?.user?.isActive) {
      return { user: null, staleSession: true };
    }

    return { user: session.user, sessionId: payload.sessionId, staleSession: false };
  } catch {
    return { user: null, staleSession: true };
  }
}

export async function requireUser() {
  const context = await getServerAuthContext();

  if (!context.user) {
    redirect("/auth/login");
  }

  return context.user;
}

export async function requireEmployee() {
  return requireUser();
}

export async function requireAttendancePageAccess() {
  const user = await requireUser();

  if (!canViewAttendanceDetails(user)) {
    redirect(routeByRole());
  }

  return user;
}

export async function requireAdminOrManager() {
  const user = await requireUser();

  if (user.role !== UserRole.super_admin) {
    redirect(routeByRole());
  }

  return user;
}

export async function requireManager() {
  const user = await requireUser();

  if (user.role !== UserRole.super_admin) {
    redirect(routeByRole());
  }

  return user;
}

export async function requireHrAnalyticsAccess() {
  const user = await requireUser();

  if (!canAccessTeamAnalytics(user.role)) {
    redirect(routeByRole());
  }

  return user;
}
