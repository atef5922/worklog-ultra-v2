import { apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import type { SessionUserResponse } from "@/lib/contracts/user";
import { clearUserSession } from "@/lib/auth/session";

export async function POST() {
  const context = await getServerAuthContext();
  if (context.staleSession) {
    await clearUserSession(context.sessionId);
  }

  return apiSuccess({
    user: context.user
      ? ({
          id: context.user.id,
          email: context.user.email,
          name: context.user.name,
          role: context.user.role,
          avatarUrl: context.user.avatarUrl ?? null,
          department: context.user.department?.name ?? null,
        } satisfies SessionUserResponse)
      : null,
  });
}
