import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();

  if (actor.role !== UserRole.manager && actor.role !== UserRole.admin) {
    return apiError("Only Team Head or Admin can update employee compensation.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const monthlySalary = Number(body.monthlySalary ?? 0);

  if (!monthlySalary || monthlySalary < 0) {
    return apiError("Monthly salary is required.");
  }

  const target = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      departmentId: true,
      name: true,
      expectedDailyHours: true,
    },
  });

  if (!target) {
    return apiError("Employee not found.", 404);
  }

  if (actor.role === UserRole.manager && actor.departmentId && target.departmentId !== actor.departmentId) {
    return apiError("Team Head can update salary only inside their own department.", 403);
  }

  await db.user.update({
    where: { id },
    data: {
      monthlySalary,
      expectedDailyHours: Number(target.expectedDailyHours ?? 0) >= 1 ? Number(target.expectedDailyHours) : 8,
    },
  });

  return apiSuccess({ message: `${target.name}'s compensation updated successfully.` });
}
