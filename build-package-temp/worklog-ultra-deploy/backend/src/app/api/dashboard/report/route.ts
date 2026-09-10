import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { toDateOnly } from "@/lib/utils";
import { canUserEditReportDate } from "@/lib/worklog";
import { reportSubmissionSchema } from "@/lib/validators/worklog";

export async function POST(request: NextRequest) {
  const user = await requireEmployee();
  const body = await request.json();
  const parsed = reportSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid report submission.");
  }

  const taskIds = parsed.data.updates.map((update) => update.dailyTaskId);
  const allowedTaskCount = await db.dailyTask.count({
    where: { id: { in: taskIds }, userId: user.id },
  });

  if (allowedTaskCount !== taskIds.length) {
    return apiError("Task access denied.", 403);
  }

  const tasks = await db.dailyTask.findMany({
    where: { id: { in: taskIds }, userId: user.id },
    select: { id: true, planDate: true },
  });

  const reportDateOnly = toDateOnly(parsed.data.reportDate);
  const mismatchedPlan = tasks.some((task) => toDateOnly(task.planDate) !== reportDateOnly);

  if (mismatchedPlan) {
    return apiError("Report date must match the original task plan date.", 400);
  }

  const editAccess = await canUserEditReportDate(
    { id: user.id, role: user.role },
    new Date(parsed.data.reportDate),
    tasks.map((task) => task.id),
  );

  if (!editAccess.allowed) {
    return apiError("This report date is locked. Request Team Head approval from History first.", 403);
  }

  await db.$transaction(
    parsed.data.updates.map((update) =>
      db.dailyTaskUpdate.upsert({
        where: {
          dailyTaskId_reportDate: {
            dailyTaskId: update.dailyTaskId,
            reportDate: new Date(parsed.data.reportDate),
          },
        },
        update: {
          status: update.status,
          note: update.note || null,
          completionPercent: update.completionPercent,
          trackedMinutes: update.trackedMinutes,
          actualStart: update.actualStart ? new Date(update.actualStart) : null,
          actualEnd: update.actualEnd ? new Date(update.actualEnd) : null,
          difficultyLevel: update.difficultyLevel || null,
        },
        create: {
          dailyTaskId: update.dailyTaskId,
          reportDate: new Date(parsed.data.reportDate),
          status: update.status,
          note: update.note || null,
          completionPercent: update.completionPercent,
          trackedMinutes: update.trackedMinutes,
          actualStart: update.actualStart ? new Date(update.actualStart) : null,
          actualEnd: update.actualEnd ? new Date(update.actualEnd) : null,
          difficultyLevel: update.difficultyLevel || null,
        },
      }),
    ),
  );

  return apiSuccess({ message: "Evening report submitted successfully." });
}
