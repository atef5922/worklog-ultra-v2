import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { embedAssignmentAttachmentMeta } from "@/lib/assignment-attachments";
import { requireEmployee } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { saveUploadedFiles } from "@/lib/file-upload";
import { toDateOnly } from "@/lib/utils";

export const runtime = "nodejs";

const assignmentCreateSchema = z.object({
  taskTitle: z.string().trim().min(3, "Task title is required."),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  departmentId: z.string().uuid("Choose a valid department."),
  assigneeId: z.string().uuid("Choose a valid teammate."),
  note: z.string().trim().optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const user = await requireEmployee();
  const formData = await request.formData();
  const parsed = assignmentCreateSchema.safeParse({
    taskTitle: formData.get("taskTitle"),
    priority: formData.get("priority"),
    departmentId: formData.get("departmentId"),
    assigneeId: formData.get("assigneeId"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid assignment payload.");
  }

  const assignee = await db.user.findFirst({
    where: {
      id: parsed.data.assigneeId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!assignee) {
    return apiError("Selected teammate is not active.");
  }

  const planDate = new Date(toDateOnly());
  const normalizedTitle = parsed.data.taskTitle.trim().toLowerCase();
  const existingTask = await db.dailyTask.findFirst({
    where: {
      userId: parsed.data.assigneeId,
      planDate,
      taskTitle: {
        equals: parsed.data.taskTitle.trim(),
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (existingTask) {
    return apiError("This assignment is already in today's task list.");
  }

  const attachments = formData
    .getAll("attachments")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  let uploadedAttachments = [];
  try {
    uploadedAttachments = await saveUploadedFiles(attachments, "assignments");
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Assignment files could not be uploaded.");
  }

  const description = embedAssignmentAttachmentMeta(parsed.data.note ?? "", uploadedAttachments);

  const createdTask = await db.dailyTask.create({
    data: {
      userId: parsed.data.assigneeId,
      departmentId: parsed.data.departmentId,
      planDate,
      taskTitle: parsed.data.taskTitle.trim(),
      taskDescription: description || null,
      priority: parsed.data.priority,
      assignedBy: parsed.data.assigneeId !== user.id ? user.id : null,
    },
    select: {
      id: true,
    },
  });

  return apiSuccess({
    message: uploadedAttachments.length
      ? "Assignment and files sent successfully."
      : "Assignment sent successfully.",
    taskId: createdTask.id,
  });
}
