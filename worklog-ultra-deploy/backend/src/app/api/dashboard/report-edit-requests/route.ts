import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { reportEditRequestSchema } from "@/lib/validators/worklog";
import { toDateOnly } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const user = await requireEmployee();

  if (user.role !== UserRole.employee) {
    return apiError("Only employees can send edit requests to their Team Head.", 403);
  }

  const body = await request.json();
  const parsed = reportEditRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid edit request.");
  }

  const task = await db.dailyTask.findFirst({
    where: {
      id: parsed.data.dailyTaskId,
      userId: user.id,
    },
    select: {
      id: true,
      planDate: true,
    },
  });

  if (!task) {
    return apiError("Task not found for this employee.", 404);
  }

  if (toDateOnly(task.planDate) === toDateOnly()) {
    return apiError("Today's task does not need approval. Complete it from Evening Report.");
  }

  const existingPending = await db.reportEditRequest.findFirst({
    where: {
      dailyTaskId: task.id,
      requestedById: user.id,
      status: "pending",
    },
  });

  if (existingPending) {
    return apiError("An approval request is already pending for this task.");
  }

  await db.reportEditRequest.create({
    data: {
      dailyTaskId: task.id,
      requestedById: user.id,
      reason: parsed.data.reason,
    },
  });

  return apiSuccess({ message: "Edit request sent to Team Head successfully." });
}
