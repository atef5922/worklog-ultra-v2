import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { embedHistoryMeta, stripHistoryMeta } from "@/lib/task-history-shared";
import { buildContinuationDescription } from "@/lib/task-continuation";
import { buildFollowUpDescription } from "@/lib/task-follow-up";
import { embedReopenMeta, isReopenedTask, stripReopenMeta } from "@/lib/task-reopen";
import { addDays } from "date-fns";
import { parseDhakaDateTime, toDateOnly } from "@/lib/utils";
import { replaceReadableTaskDescription } from "@/lib/task-description-edit";

const TASK_ACTIONS = [
  "schedule_continuation",
  "clear_continuation",
  "restore_to_dashboard",
  "reopen_task",
  "move_to_history",
  "complete_task",
] as const;

function buildTaskVisibilityWhere(actor: Awaited<ReturnType<typeof requireUser>>) {
  if (actor.role === UserRole.employee) {
    return { userId: actor.id };
  }

  if (actor.role === UserRole.manager) {
    return actor.departmentId
      ? {
          OR: [
            { userId: actor.id },
            { departmentId: actor.departmentId },
          ],
        }
      : { userId: actor.id };
  }

  return {};
}

async function clearAutoContinuationTask(task: {
  userId: string;
  planDate: Date;
  taskTitle: string;
}) {
  const nextPlanDate = addDays(new Date(task.planDate), 1);
  const existingCarryForward = await db.dailyTask.findFirst({
    where: {
      userId: task.userId,
      planDate: nextPlanDate,
      taskTitle: task.taskTitle,
    },
    select: { id: true, taskDescription: true },
  });

  if (!existingCarryForward?.taskDescription?.includes("[continued-task]")) {
    return;
  }

  await db.dailyTask.delete({
    where: { id: existingCarryForward.id },
  });
}

async function findVisibleTask(id: string, actor: Awaited<ReturnType<typeof requireUser>>) {
  return db.dailyTask.findFirst({
    where: {
      id,
      ...buildTaskVisibilityWhere(actor),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = await request.json();

  const task = await findVisibleTask(id, user);

  if (!task) {
    return apiError("Task not found.", 404);
  }

  const latestUpdate = await db.dailyTaskUpdate.findFirst({
    where: { dailyTaskId: id },
    orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }],
    select: { status: true },
  });

  if (latestUpdate?.status === "done") {
    return apiError("Reopen the completed task before editing it.", 409);
  }

  if (user.role === UserRole.employee && task.assignedBy) {
    return apiError(
      "Assigned task details are read-only. Contact the task assigner.",
      403,
    );
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(body, "taskTitle");
  const hasDescription = Object.prototype.hasOwnProperty.call(body, "taskDescription");
  const hasPriority = Object.prototype.hasOwnProperty.call(body, "priority");

  if (!hasTitle && !hasDescription && !hasPriority) {
    return apiError("Choose at least one task field to update.");
  }

  const taskTitle = hasTitle && typeof body.taskTitle === "string" ? body.taskTitle.trim() : null;
  if (hasTitle && (!taskTitle || taskTitle.length < 3)) {
    return apiError("Task title must be at least 3 characters.");
  }

  if (hasDescription && typeof body.taskDescription !== "string") {
    return apiError("Task description is invalid.");
  }

  if (
    hasPriority &&
    body.priority !== "low" &&
    body.priority !== "normal" &&
    body.priority !== "high" &&
    body.priority !== "critical"
  ) {
    return apiError("Task priority is invalid.");
  }

  if (taskTitle) {
    const duplicate = await db.dailyTask.findFirst({
      where: {
        id: { not: id },
        userId: task.userId,
        planDate: task.planDate,
        taskTitle: { equals: taskTitle, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return apiError("A task with this title already exists for that day.");
    }
  }

  const updatedTask = await db.dailyTask.update({
    where: { id },
    data: {
      ...(taskTitle ? { taskTitle } : {}),
      ...(hasDescription
        ? {
            taskDescription:
              replaceReadableTaskDescription(task.taskDescription, body.taskDescription) || null,
          }
        : {}),
      ...(hasPriority ? { priority: body.priority } : {}),
    },
    select: {
      id: true,
      taskTitle: true,
      taskDescription: true,
      priority: true,
    },
  });

  return apiSuccess({ message: "Task updated successfully.", task: updatedTask });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  const actionReportDate =
    typeof body?.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)
      ? new Date(body.reportDate)
      : new Date(toDateOnly());

  if (!TASK_ACTIONS.includes(action as (typeof TASK_ACTIONS)[number])) {
    return apiError("Invalid task action.", 400);
  }

  const task = await db.dailyTask.findFirst({
    where: {
      id,
      ...buildTaskVisibilityWhere(user),
    },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      planDate: true,
      taskTitle: true,
      taskDescription: true,
      priority: true,
      assignedBy: true,
      updates: {
        orderBy: { reportDate: "desc" },
        take: 1,
        select: {
          status: true,
          note: true,
          trackedMinutes: true,
          completionPercent: true,
          actualStart: true,
          actualEnd: true,
          difficultyLevel: true,
          reportDate: true,
        },
      },
    },
  });

  if (!task) {
    return apiError("Task not found.", 404);
  }

  const latestUpdate = task.updates[0];
  if (
    !["restore_to_dashboard", "reopen_task", "move_to_history", "complete_task"].includes(action) &&
    (latestUpdate?.status === "done" || latestUpdate?.completionPercent === 100)
  ) {
    return apiError("This task is already completed.", 400);
  }

  const today = toDateOnly();
  const isTodaysTask = toDateOnly(task.planDate) === today;
  // A task carried forward from an earlier planDate (still open, or just
  // completed today) already has today's own dailyTaskUpdate row — same
  // shape as a genuinely-today task from restore_to_dashboard's point of
  // view, so it takes the simple "flip the existing row back" path too
  // instead of the continuation-task path meant for reviving something
  // actually archived in History.
  const latestUpdateIsToday = Boolean(latestUpdate?.reportDate && toDateOnly(latestUpdate.reportDate) === today);

  if (action === "complete_task") {
    if (latestUpdate?.status === "done" && latestUpdate.completionPercent === 100) {
      return apiError("This task is already completed.", 409);
    }

    const completionStatus = body.completionStatus === "partial" ? "partial" : "done";
    const completionNote = typeof body.completionNote === "string" ? body.completionNote.trim() : "";
    const needFollowUp = Boolean(body.needFollowUp);
    const followUpDate = typeof body.followUpDate === "string" ? body.followUpDate.trim() : "";
    const followUpTime = typeof body.followUpTime === "string" ? body.followUpTime.trim() : "";
    const followUpNote = typeof body.followUpNote === "string" ? body.followUpNote.trim() : "";
    const trackedMinutes = Math.max(
      0,
      Number(body.trackedMinutes ?? latestUpdate?.trackedMinutes ?? 0),
    );
    const actualStart = body.actualStart
      ? parseDhakaDateTime(String(body.actualStart))
      : latestUpdate?.actualStart ?? null;
    const actualEnd = body.actualEnd
      ? parseDhakaDateTime(String(body.actualEnd))
      : latestUpdate?.actualEnd ?? new Date();
    const wantsFollowUp = needFollowUp || completionStatus === "partial";

    if (wantsFollowUp && (!followUpDate || !followUpTime)) {
      return apiError("Follow-up date and time are required.");
    }

    const completionPercent = completionStatus === "partial" ? 50 : 100;
    const reportDate = actionReportDate;

    await db.$transaction(async (transaction) => {
      await transaction.dailyTaskUpdate.upsert({
        where: {
          dailyTaskId_reportDate: {
            dailyTaskId: task.id,
            reportDate,
          },
        },
        update: {
          status: "done",
          note: completionNote || null,
          completionPercent,
          trackedMinutes,
          actualStart,
          actualEnd,
        },
        create: {
          dailyTaskId: task.id,
          reportDate,
          status: "done",
          note: completionNote || null,
          completionPercent,
          trackedMinutes,
          actualStart,
          actualEnd,
          difficultyLevel: null,
        },
      });

      const completedCycles = await transaction.taskActivityEvent.count({
        where: {
          dailyTaskId: task.id,
          eventType: "completed",
        },
      });

      await transaction.taskActivityEvent.create({
        data: {
          dailyTaskId: task.id,
          actorId: user.id,
          eventType: "completed",
          cycle: completedCycles + 1,
          note: completionNote || null,
          reportDate,
          trackedMinutes,
          actualStart,
          actualEnd,
        },
      });
    });

    await clearAutoContinuationTask(task);

    // Finishing the task ends the reopened state: the marker describes an open
    // task that came back from the Complete column, not a permanent property.
    if (isReopenedTask(task.taskDescription)) {
      await db.dailyTask.update({
        where: { id: task.id },
        data: { taskDescription: stripReopenMeta(task.taskDescription) || null },
      });
    }

    let followUpTaskId: string | null = null;

    if (wantsFollowUp) {
      const continuationDescription = buildContinuationDescription({
        originalDescription: stripReopenMeta(stripHistoryMeta(task.taskDescription)),
        sourceDate: toDateOnly(reportDate),
        completionPercent,
        trackedMinutes,
        note: completionNote,
      });

      const followUpDescription = buildFollowUpDescription({
        originalDescription: continuationDescription,
        sourceTaskId: task.id,
        scheduledDate: followUpDate,
        scheduledTime: followUpTime,
        reminderNote: followUpNote || completionNote,
        completionStatus,
      });

      const existingFollowUp = await db.dailyTask.findFirst({
        where: {
          userId: task.userId,
          planDate: new Date(followUpDate),
          taskTitle: task.taskTitle,
        },
        select: { id: true },
      });

      if (existingFollowUp) {
        await db.dailyTask.update({
          where: { id: existingFollowUp.id },
          data: {
            taskDescription: followUpDescription,
            priority: task.priority,
            assignedBy: task.assignedBy,
          },
        });
        followUpTaskId = existingFollowUp.id;
      } else {
        const created = await db.dailyTask.create({
          data: {
            userId: task.userId,
            departmentId: task.departmentId,
            planDate: new Date(followUpDate),
            taskTitle: task.taskTitle,
            taskDescription: followUpDescription,
            priority: task.priority,
            assignedBy: task.assignedBy,
          },
          select: { id: true },
        });
        followUpTaskId = created.id;
      }
    }

    return apiSuccess({
      message: wantsFollowUp
        ? "Task completed and follow-up reminder scheduled."
        : "Task completed successfully.",
      followUpCreated: wantsFollowUp,
      followUpTaskId,
      followUpDate: wantsFollowUp ? followUpDate : null,
      followUpTime: wantsFollowUp ? followUpTime : null,
      trackedMinutes,
      completionStatus,
    });
  }

  if (action === "move_to_history") {
    const reportDate = actionReportDate;
    const resolvedActualEnd = latestUpdate?.actualEnd ?? new Date();
    await db.dailyTaskUpdate.upsert({
      where: {
        dailyTaskId_reportDate: {
          dailyTaskId: task.id,
          reportDate,
        },
      },
      update: {
        status: "done",
        note: latestUpdate?.note ?? null,
        completionPercent: latestUpdate?.completionPercent && latestUpdate.completionPercent > 0 ? latestUpdate.completionPercent : 100,
        trackedMinutes: latestUpdate?.trackedMinutes ?? 0,
        actualStart: latestUpdate?.actualStart ?? null,
        actualEnd: resolvedActualEnd,
      },
      create: {
        dailyTaskId: task.id,
        reportDate,
        status: "done",
        note: latestUpdate?.note ?? null,
        completionPercent: latestUpdate?.completionPercent && latestUpdate.completionPercent > 0 ? latestUpdate.completionPercent : 100,
        trackedMinutes: latestUpdate?.trackedMinutes ?? 0,
        actualStart: latestUpdate?.actualStart ?? null,
        actualEnd: resolvedActualEnd,
        difficultyLevel: latestUpdate?.difficultyLevel ?? null,
      },
    });

    await db.dailyTask.update({
      where: { id: task.id },
      data: {
        taskDescription: embedHistoryMeta(task.taskDescription),
      },
    });

    return apiSuccess({ message: "Task moved to history successfully." });
  }

  if (action === "reopen_task") {
    const reopenReason =
      typeof body.reopenReason === "string" ? body.reopenReason.trim() : "";

    if (reopenReason.length < 10) {
      return apiError("Reopen reason must be at least 10 characters.");
    }

    if (reopenReason.length > 500) {
      return apiError("Reopen reason must be 500 characters or less.");
    }

    if (!latestUpdate || latestUpdate.status !== "done") {
      return apiError("Only a completed task can be reopened.", 409);
    }

    const latestCompletion = await db.taskActivityEvent.findFirst({
      where: {
        dailyTaskId: task.id,
        eventType: "completed",
      },
      orderBy: [{ cycle: "desc" }, { createdAt: "desc" }],
      select: { cycle: true },
    });
    const cycle = latestCompletion?.cycle ?? 1;

    await db.$transaction(async (transaction) => {
      await transaction.dailyTask.update({
        where: { id: task.id },
        data: {
          taskDescription: embedReopenMeta(
            stripHistoryMeta(task.taskDescription),
          ),
        },
      });

      await transaction.dailyTaskUpdate.update({
        where: {
          dailyTaskId_reportDate: {
            dailyTaskId: task.id,
            reportDate: latestUpdate.reportDate,
          },
        },
        data: {
          status: "in_progress",
          note: `Reopened: ${reopenReason}`,
          completionPercent: 0,
          actualEnd: null,
        },
      });

      await transaction.taskActivityEvent.create({
        data: {
          dailyTaskId: task.id,
          actorId: user.id,
          eventType: "reopened",
          cycle,
          reason: reopenReason,
          reportDate: latestUpdate.reportDate,
          trackedMinutes: latestUpdate.trackedMinutes,
          actualStart: latestUpdate.actualStart,
          actualEnd: latestUpdate.actualEnd,
        },
      });
    });

    return apiSuccess({
      message: "Task reopened successfully.",
      taskId: task.id,
      reportDate: toDateOnly(latestUpdate.reportDate),
      status: "in_progress",
    });
  }

  if (action === "restore_to_dashboard") {
    if (isTodaysTask || latestUpdateIsToday) {
      const resumedStatus =
        latestUpdate && (latestUpdate.trackedMinutes > 0 || latestUpdate.actualStart) ? "in_progress" : "pending";

      await db.dailyTask.update({
        where: { id: task.id },
        data: {
          // Stamped, not just un-archived: the card needs to say it came back
          // from Complete, and the update row alone cannot carry that.
          taskDescription: embedReopenMeta(stripHistoryMeta(task.taskDescription)),
        },
      });

      if (latestUpdate) {
        await db.dailyTaskUpdate.update({
          where: {
            dailyTaskId_reportDate: {
              dailyTaskId: task.id,
              reportDate: new Date(today),
            },
          },
          data: {
            status: resumedStatus,
            actualEnd: null,
          },
        });
      }

      return apiSuccess({
        message: "Task returned to today's dashboard.",
        taskId: task.id,
        reportDate: today,
      });
    }

    const continuationNote = buildContinuationDescription({
      originalDescription: stripHistoryMeta(task.taskDescription),
      sourceDate: toDateOnly(task.planDate),
      completionPercent: latestUpdate?.completionPercent ?? 0,
      trackedMinutes: latestUpdate?.trackedMinutes ?? 0,
      note: latestUpdate?.note ?? "",
    });

    const existingTodayTask = await db.dailyTask.findFirst({
      where: {
        userId: task.userId,
        planDate: new Date(today),
        taskTitle: task.taskTitle,
      },
      select: {
        id: true,
        updates: {
          orderBy: { reportDate: "desc" },
          take: 1,
          select: {
            trackedMinutes: true,
            actualStart: true,
            status: true,
          },
        },
      },
    });

    let targetTaskId = existingTodayTask?.id;

    if (existingTodayTask) {
      await db.dailyTask.update({
        where: { id: existingTodayTask.id },
        data: {
          taskDescription: continuationNote || null,
          priority: task.priority,
          assignedBy: task.assignedBy,
        },
      });

      const todayUpdate = existingTodayTask.updates[0];
      if (todayUpdate?.status === "done") {
        await db.dailyTaskUpdate.update({
          where: {
            dailyTaskId_reportDate: {
              dailyTaskId: existingTodayTask.id,
              reportDate: new Date(today),
            },
          },
          data: {
            status: todayUpdate.trackedMinutes > 0 || todayUpdate.actualStart ? "in_progress" : "pending",
            actualEnd: null,
          },
        });
      }
    } else {
      const created = await db.dailyTask.create({
        data: {
          userId: task.userId,
          departmentId: task.departmentId,
          planDate: new Date(today),
          taskTitle: task.taskTitle,
          taskDescription: continuationNote || null,
          priority: task.priority,
          assignedBy: task.assignedBy,
        },
        select: { id: true },
      });

      targetTaskId = created.id;
    }

    return apiSuccess({
      message: "Task moved back to today's dashboard.",
      taskId: targetTaskId,
      reportDate: today,
    });
  }

  const nextPlanDate = addDays(new Date(task.planDate), 1);
  const sourceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(task.planDate));

  const continuationNote = buildContinuationDescription({
    originalDescription: task.taskDescription,
    sourceDate,
    completionPercent: latestUpdate?.completionPercent ?? 0,
    trackedMinutes: latestUpdate?.trackedMinutes ?? 0,
    note: latestUpdate?.note ?? "",
  });

  const existingCarryForward = await db.dailyTask.findFirst({
    where: {
      userId: task.userId,
      planDate: nextPlanDate,
      taskTitle: task.taskTitle,
    },
    select: { id: true },
  });

  if (action === "clear_continuation") {
    if (existingCarryForward) {
      await db.dailyTask.delete({
        where: { id: existingCarryForward.id },
      });
    }

    return apiSuccess({ message: "Continuation cleared." });
  }

  if (existingCarryForward) {
    await db.dailyTask.update({
      where: { id: existingCarryForward.id },
      data: {
        taskDescription: continuationNote || null,
        priority: task.priority,
        assignedBy: task.assignedBy,
      },
    });

    return apiSuccess({ message: "Tomorrow's continuation task is already ready." });
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

  return apiSuccess({ message: "Task scheduled for tomorrow successfully." });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const task = await findVisibleTask(id, user);

  if (!task) {
    return apiError("Task not found.", 404);
  }

  await db.$transaction([
    db.dailyTaskUpdate.deleteMany({ where: { dailyTaskId: id } }),
    db.reportEditRequest.deleteMany({ where: { dailyTaskId: id } }),
    db.dailyTask.delete({ where: { id } }),
  ]);

  return apiSuccess({ message: "Task deleted successfully." });
}
