import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireAdminOrManager } from "@/lib/auth/server";
import { ROLE_RANK, roleUiTitle } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdminOrManager();
  const { id } = await params;
  const body = await request.json();
  const nextIsActive = Boolean(body.isActive);

  if (id === actor.id) {
    return apiError("You cannot deactivate your own account from here.", 400);
  }

  const target = await db.user.findUnique({
    where: { id },
    include: { department: true },
  });

  if (!target) {
    return apiError("User not found.", 404);
  }

  if (actor.role === UserRole.manager) {
    if (!actor.departmentId || target.departmentId !== actor.departmentId) {
      return apiError("You can only manage users from your own department.", 403);
    }

    if (ROLE_RANK[target.role] >= ROLE_RANK[UserRole.manager]) {
      return apiError("Team Head can only activate or deactivate employee and HR accounts.", 403);
    }
  }

  await db.user.update({
    where: { id },
    data: {
      isActive: nextIsActive,
    },
  });

  if (!nextIsActive) {
    await db.userSession.updateMany({
      where: {
        userId: id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  return apiSuccess({
    message: `${target.name} is now ${nextIsActive ? "active" : "inactive"}.`,
    user: {
      id: target.id,
      isActive: nextIsActive,
      role: roleUiTitle(target.role),
    },
  });
}
