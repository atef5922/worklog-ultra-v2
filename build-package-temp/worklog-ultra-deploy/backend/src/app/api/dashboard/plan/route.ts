import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { planSubmissionSchema } from "@/lib/validators/worklog";

export async function POST(request: NextRequest) {
  const user = await requireEmployee();
  const body = await request.json();
  const parsed = planSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid plan submission.");
  }

  const planDate = new Date(parsed.data.planDate);
  const assigneeIds = parsed.data.tasks.map((task) => task.assigneeId ?? user.id);
  const activeAssigneeCount = await db.user.count({
    where: {
      id: { in: assigneeIds },
      isActive: true,
    },
  });

  if (activeAssigneeCount !== assigneeIds.length) {
    return apiError("One or more selected assignees are not active.");
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
          taskTitle: true,
          departmentId: true,
        },
      }),
    ),
  );

  return apiSuccess({ message: "Morning plan added successfully.", tasks: createdTasks });
}
