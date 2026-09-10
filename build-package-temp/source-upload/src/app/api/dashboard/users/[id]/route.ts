import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { MANAGER_GRANTABLE_EXTRA_ACCESS, normalizeExtraAccess } from "@/lib/auth/permissions";
import { requireAdminOrManager } from "@/lib/auth/server";
import { roleUiTitle } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdminOrManager();
    const { id } = await params;

    if (id === actor.id) {
      return apiError("Use another account to change your own admin role.", 400);
    }

    const body = await request.json().catch(() => ({}));
    const nextRole =
      body.role === "employee" || body.role === "hr" || body.role === "manager" || body.role === "admin"
        ? body.role
        : null;
    const nextDepartmentId =
      body.departmentId === null || body.departmentId === "" || typeof body.departmentId === "string"
        ? body.departmentId
        : undefined;
    const nextExtraAccess = normalizeExtraAccess(body.extraAccess);

    if (!nextRole || typeof nextDepartmentId === "undefined") {
      return apiError("Role and department are required.", 400);
    }

    const target = await db.user.findUnique({
      where: { id },
      include: { department: true },
    });

    if (!target) {
      return apiError("User not found.", 404);
    }

    if (actor.role === UserRole.manager) {
      if (target.role !== UserRole.employee) {
        return apiError("Team Head can only shift employee departments.", 403);
      }

      if (!actor.departmentId || target.departmentId !== actor.departmentId) {
        return apiError("You can only shift employees from your own department.", 403);
      }

      if (nextRole !== target.role) {
        return apiError("Team Head cannot change user role.", 403);
      }

      const invalidAccess = nextExtraAccess.some((item) => !MANAGER_GRANTABLE_EXTRA_ACCESS.includes(item));

      if (invalidAccess) {
        return apiError("Team Head can only grant limited extra access.", 403);
      }
    } else if (actor.role !== UserRole.admin) {
      return apiError("Only admin can change user role or department.", 403);
    }

    if (nextDepartmentId && nextDepartmentId !== target.departmentId) {
      const department = await db.department.findUnique({
        where: { id: nextDepartmentId },
        select: { id: true },
      });

      if (!department) {
        return apiError("Selected department was not found.", 404);
      }
    }

    const data: Prisma.UserUpdateInput = {
      role: actor.role === UserRole.manager ? target.role : nextRole,
      extraAccess: nextExtraAccess,
      department:
        nextDepartmentId === target.departmentId
          ? undefined
          : nextDepartmentId
            ? { connect: { id: nextDepartmentId } }
            : { disconnect: true },
    };

    const updated = await db.user.update({
      where: { id },
      data,
      include: {
        department: true,
      },
    });

    return apiSuccess({
      message: `${updated.name} is now ${roleUiTitle(updated.role)} in ${updated.department?.name ?? "Executive"}.`,
      user: {
        id: updated.id,
        role: updated.role,
        departmentId: updated.departmentId,
        extraAccess: updated.extraAccess,
      },
    });
  } catch (error) {
    console.error("User update failed", error);
    return apiError(error instanceof Error ? error.message : "User update failed.", 500);
  }
}
