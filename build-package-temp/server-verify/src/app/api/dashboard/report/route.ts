import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { buildContinuationDescription } from "@/lib/task-continuation";
import { addDays } from "date-fns";
import { toDateOnly } from "@/lib/utils";
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
    select: {
      id: true,
      userId: true,
      departmentId: true,
      planDate: true,
      taskTitle: true,
      taskDescription: true,
      priority: true,
      assignedBy: true,
    },
  });

  const reportDateOnly = toDateOnly(parsed.data.reportDate);
  const mismatchedPlan = tasks.some((task) => toDateOnly(task.planDate) !== reportDateOnly);

  if (mismatchedPlan) {
    return apiError("Report date must match the original task plan date.", 400);
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

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const shouldAutoContinue = (update: (typeof parsed.data.updates)[number]) =>
    update.status !== "done" &&
    update.completionPercent < 100 &&
    Boolean(
      update.actualStart ||
        update.actualEnd ||
        update.trackedMinutes > 0 ||
        update.completionPercent > 0 ||
        update.note?.trim(),
    );
  const carryForwardUpdates = parsed.data.updates.filter(
    (update) => (update.carryForward || shouldAutoContinue(update)) && update.status !== "done" && update.completionPercent < 100,
  );

  if (carryForwardUpdates.length) {
    const nextPlanDate = addDays(new Date(parsed.data.reportDate), 1);

    for (const update of carryForwardUpdates) {
      const task = tasksById.get(update.dailyTaskId);

      if (!task) {
        continue;
      }

      const existingCarryForward = await db.dailyTask.findFirst({
        where: {
          userId: task.userId,
          planDate: nextPlanDate,
          taskTitle: task.taskTitle,
        },
        select: { id: true },
      });

      const continuationNote = buildContinuationDescription({
        originalDescription: task.taskDescription,
        sourceDate: reportDateOnly,
        completionPercent: update.completionPercent,
        trackedMinutes: update.trackedMinutes,
        note: update.note,
      });

      if (existingCarryForward) {
        await db.dailyTask.update({
          where: { id: existingCarryForward.id },
          data: {
            taskDescription: continuationNote || null,
            priority: task.priority,
            assignedBy: task.assignedBy,
          },
        });
        continue;
      }

      await db.dailyTask.create({
        data: {
          userId: task.userId,
          departmentId: task.departmentId,
          planDate: nextPlanDate,
          taskTitle: task.taskTitle,
          taskDescription: continuationNote || null,
          priority: task.priority,
          assignedBy: task.assignedBy,
        },
      });
    }
  }

  return apiSuccess({
    message: carryForwardUpdates.length
      ? "Evening report submitted and continuation task moved to tomorrow."
      : "Evening report submitted successfully.",
  });
}
