import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { buildContinuationDescription } from "@/lib/task-continuation";
import { addDays } from "date-fns";
import { toDateOnly } from "@/lib/utils";

async function findVisibleTask(id: string, actor: Awaited<ReturnType<typeof requireUser>>) {
  return db.dailyTask.findFirst({
    where: {
      id,
      ...(actor.role === UserRole.employee
        ? { userId: actor.id }
        : actor.role === UserRole.manager && actor.departmentId
          ? { departmentId: actor.departmentId }
          : {}),
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

  const taskTitle = typeof body.taskTitle === "string" ? body.taskTitle.trim() : "";
  const taskDescription = typeof body.taskDescription === "string" ? body.taskDescription.trim() : "";
  const priority =
    body.priority === "low" || body.priority === "normal" || body.priority === "high" || body.priority === "critical"
      ? body.priority
      : "normal";

  if (taskTitle.length < 3) {
    return apiError("Task title must be at least 3 characters.");
  }

  await db.dailyTask.update({
    where: { id },
    data: {
      taskTitle,
      taskDescription: taskDescription || null,
      priority,
    },
  });

  return apiSuccess({ message: "Task updated successfully." });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  if (!["schedule_continuation", "clear_continuation", "restore_to_dashboard"].includes(action)) {
    return apiError("Invalid task action.", 400);
  }

  const task = await db.dailyTask.findFirst({
    where: {
      id,
      ...(user.role === UserRole.employee
        ? { userId: user.id }
        : user.role === UserRole.manager && user.departmentId
          ? { departmentId: user.departmentId }
          : {}),
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
        },
      },
    },
  });

  if (!task) {
    return apiError("Task not found.", 404);
  }

  const latestUpdate = task.updates[0];
  if (action !== "restore_to_dashboard" && (latestUpdate?.status === "done" || latestUpdate?.completionPercent === 100)) {
    return apiError("This task is already completed.", 400);
  }

  const today = toDateOnly();
  const isTodaysTask = toDateOnly(task.planDate) === today;

  if (action === "restore_to_dashboard") {
    if (isTodaysTask) {
      const resumedStatus =
        latestUpdate && (latestUpdate.trackedMinutes > 0 || latestUpdate.actualStart) ? "in_progress" : "pending";

      if (latestUpdate) {
        await db.dailyTaskUpdate.update({
          where: {
            dailyTaskId_reportDate: {
              dailyTaskId: task.id,
              reportDate: new Date(task.planDate),
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
      originalDescription: task.taskDescription,
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
