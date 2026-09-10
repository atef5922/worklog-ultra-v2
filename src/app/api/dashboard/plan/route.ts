import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { isMovedToHistory } from "@/lib/task-history-shared";
import { toDateOnly } from "@/lib/utils";
import { planSubmissionSchema } from "@/lib/validators/worklog";

export async function POST(request: NextRequest) {
  const user = await requireEmployee();
  const body = await request.json();
  const parsed = planSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid plan submission.");
  }

  const planDate = new Date(toDateOnly(parsed.data.planDate));
  const normalizedTasks = parsed.data.tasks.map((task) => ({
    ...task,
    normalizedTitle: task.taskTitle.trim().toLowerCase(),
    ownerId: task.assigneeId ?? user.id,
  }));
  const duplicateRequestKeySet = new Set<string>();

  for (const task of normalizedTasks) {
    const key = `${task.ownerId}:${task.normalizedTitle}`;
    if (duplicateRequestKeySet.has(key)) {
      return apiError(`Same task was added twice: ${task.taskTitle}`);
    }

    duplicateRequestKeySet.add(key);
  }

  const assigneeIds = parsed.data.tasks.map((task) => task.assigneeId ?? user.id);
  const uniqueAssigneeIds = Array.from(new Set(assigneeIds));
  const activeAssigneeCount = await db.user.count({
    where: {
      id: { in: uniqueAssigneeIds },
      isActive: true,
    },
  });

  if (activeAssigneeCount !== uniqueAssigneeIds.length) {
    return apiError("One or more selected assignees are not active.");
  }

  const existingTasks = await db.dailyTask.findMany({
    where: {
      userId: { in: assigneeIds },
      planDate,
    },
    select: {
      userId: true,
      taskTitle: true,
      taskDescription: true,
    },
  });

  const existingTaskKeySet = new Set(
    existingTasks
      .filter((task) => !isMovedToHistory(task.taskDescription))
      .map((task) => `${task.userId}:${task.taskTitle.trim().toLowerCase()}`),
  );

  const duplicateExistingTask = normalizedTasks.find((task) =>
    existingTaskKeySet.has(`${task.ownerId}:${task.normalizedTitle}`),
  );

  if (duplicateExistingTask) {
    return apiError(`This task is already in today's plan: ${duplicateExistingTask.taskTitle}`);
  }

  const createdTasks = await db.$transaction(
    parsed.data.tasks.map((task) =>
      db.dailyTask.create({
        data: {
          userId: task.assigneeId ?? user.id,
          departmentId: task.departmentId,
          planDate,
          taskTitle: task.taskTitle,
          taskDescription: task.taskDescription || null,
          priority: task.priority,
          assignedBy: task.assigneeId && task.assigneeId !== user.id ? user.id : null,
        },
        select: {
          id: true,
          userId: true,
          taskTitle: true,
          taskDescription: true,
          priority: true,
          planDate: true,
          assignedBy: true,
          departmentId: true,
          department: {
            select: {
              name: true,
            },
          },
        },
      }),
    ),
  );

  return apiSuccess({ message: "Today's task list saved successfully.", tasks: createdTasks });
}
