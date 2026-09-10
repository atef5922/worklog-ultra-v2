import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getServerAuthContext();
    const actor = context.user;

    if (!actor) {
      return apiError("Login required.", 401);
    }

    if (actor.role !== "manager" && actor.role !== "admin") {
      return apiError("Only Team Head or Admin can update salary from Team analytics.", 403);
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
      return apiError("Team member not found.", 404);
    }

    if (actor.role === "manager" && actor.departmentId && target.departmentId !== actor.departmentId) {
      return apiError("Team Head can update salary only inside their own department.", 403);
    }

    if (actor.role === "manager" && target.role === "admin") {
      return apiError("Team Head cannot update CEO/Admin salary.", 403);
    }

    await db.user.update({
      where: { id },
      data: {
        monthlySalary,
        expectedDailyHours: Number(target.expectedDailyHours ?? 0) >= 1 ? Number(target.expectedDailyHours) : 8,
      },
    });

    return apiSuccess({ message: `${target.name}'s salary updated successfully.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Salary update failed on server.";
    return apiError(message, 500);
  }
}
