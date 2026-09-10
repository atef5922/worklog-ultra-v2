import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { buildAssignmentReviewReason, ASSIGNMENT_REVIEW_PREFIX } from "@/lib/assignment-review";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { parseDhakaDateTime, toDateOnly } from "@/lib/utils";
import { reportSubmissionSchema } from "@/lib/validators/worklog";

function parseReportDateTime(value?: string) {
  if (!value) {
    return null;
  }

  return parseDhakaDateTime(value);
}

function hasMeaningfulAssignmentSubmission(update: {
  status: "done" | "in_progress" | "pending";
  note?: string;
  completionPercent: number;
  trackedMinutes: number;
  actualStart?: string;
  actualEnd?: string;
}) {
  return Boolean(
    update.status !== "pending" ||
      update.note?.trim() ||
      update.completionPercent > 0 ||
      update.trackedMinutes > 0 ||
      update.actualStart ||
      update.actualEnd,
  );
}

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
  // A task carried forward because it was still open (see
  // isVisibleInTodaysWorkPlan) is logged against today's date while its
  // planDate stays back on the day it was originally planned, so the two no
  // longer have to match exactly — only a report dated before the task even
  // existed is actually invalid.
  const invalidPlan = tasks.some((task) => toDateOnly(task.planDate) > reportDateOnly);

  if (invalidPlan) {
    return apiError("Report date cannot be earlier than the task's plan date.", 400);
  }

  const dayStart = new Date(`${reportDateOnly}T00:00:00+06:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const latestAllowedTime = Date.now() + 2 * 60 * 1000;
  const invalidTimeRange = parsed.data.updates.some((update) => {
    const start = update.actualStart
      ? (parseReportDateTime(update.actualStart)?.getTime() ?? null)
      : null;
    const end = update.actualEnd
      ? (parseReportDateTime(update.actualEnd)?.getTime() ?? null)
      : null;

    if (update.actualStart && start === null) return true;
    if (update.actualEnd && end === null) return true;
    if (start !== null && (start < dayStart || start >= dayEnd || start > latestAllowedTime)) return true;
    if (end !== null && (start === null || end < start || end > dayEnd || end > latestAllowedTime)) return true;
    return false;
  });

  if (invalidTimeRange) {
    return apiError("Task Start/End time is invalid for this workday.", 400);
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
          completionPercent: update.completionPercent,
          trackedMinutes: update.trackedMinutes,
          actualStart: parseReportDateTime(update.actualStart),
          actualEnd: parseReportDateTime(update.actualEnd),
          // Only overwrite the fields the caller actually sent. The timer omits
          // these, and blindly writing "" would erase a saved completion note.
          ...(update.note === undefined ? {} : { note: update.note || null }),
          ...(update.difficultyLevel === undefined
            ? {}
            : { difficultyLevel: update.difficultyLevel || null }),
        },
        create: {
          dailyTaskId: update.dailyTaskId,
          reportDate: new Date(parsed.data.reportDate),
          status: update.status,
          note: update.note || null,
          completionPercent: update.completionPercent,
          trackedMinutes: update.trackedMinutes,
          actualStart: parseReportDateTime(update.actualStart),
          actualEnd: parseReportDateTime(update.actualEnd),
          difficultyLevel: update.difficultyLevel || null,
        },
      }),
    ),
  );

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  const assignmentSubmissionUpdates = parsed.data.updates.filter((update) => {
    const task = tasksById.get(update.dailyTaskId);
    return task?.assignedBy && hasMeaningfulAssignmentSubmission(update);
  });

  if (assignmentSubmissionUpdates.length) {
    await db.$transaction(async (tx) => {
      for (const update of assignmentSubmissionUpdates) {
        const task = tasksById.get(update.dailyTaskId);

        if (!task?.assignedBy) {
          continue;
        }

        const submitNote =
          update.note?.trim() ||
          `Progress updated: ${update.completionPercent}% complete, ${update.trackedMinutes} min tracked.`;

        const existingPending = await tx.reportEditRequest.findFirst({
          where: {
            dailyTaskId: task.id,
            requestedById: user.id,
            status: "pending",
            reason: { startsWith: ASSIGNMENT_REVIEW_PREFIX },
          },
          orderBy: { createdAt: "desc" },
        });

        if (existingPending) {
          await tx.reportEditRequest.update({
            where: { id: existingPending.id },
            data: {
              reason: buildAssignmentReviewReason(submitNote),
              reviewerId: null,
              reviewNote: null,
              reviewedAt: null,
              status: "pending",
            },
          });
          continue;
        }

        await tx.reportEditRequest.create({
          data: {
            dailyTaskId: task.id,
            requestedById: user.id,
            reason: buildAssignmentReviewReason(submitNote),
          },
        });
      }
    });
  }

  const carryForwardUpdates = parsed.data.updates.filter(
    (update) => update.carryForward && update.status !== "done" && update.completionPercent < 100,
  );

  return apiSuccess({
    message: carryForwardUpdates.length
      ? "Report saved. Unfinished tasks will remain in tomorrow's work plan."
      : "Report submitted successfully.",
  });
}
