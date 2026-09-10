import { z } from "zod";

export const taskPrioritySchema = z.enum(["low", "normal", "high", "critical"]);
export const taskStatusSchema = z.enum(["done", "in_progress", "pending"]);
export const reportEditDecisionSchema = z.enum(["approved", "rejected"]);

export const dailyTaskSchema = z.object({
  id: z.string().uuid().optional(),
  taskTitle: z.string().trim().min(3, "Task title is required."),
  taskDescription: z.string().trim().optional().or(z.literal("")),
  priority: taskPrioritySchema.default("normal"),
  departmentId: z.string().uuid("Department is required."),
  assigneeId: z.string().uuid("Choose who will own this task.").optional(),
});

export const planSubmissionSchema = z.object({
  planDate: z.string().min(10),
  tasks: z.array(dailyTaskSchema).min(1, "Add at least one task."),
});

export const reportUpdateSchema = z.object({
  dailyTaskId: z.string().uuid(),
  status: taskStatusSchema,
  note: z.string().trim().optional().or(z.literal("")),
  completionPercent: z.coerce.number().min(0).max(100),
  trackedMinutes: z.coerce.number().min(0).max(1440),
  actualStart: z.string().optional().or(z.literal("")),
  actualEnd: z.string().optional().or(z.literal("")),
  difficultyLevel: z.string().trim().optional().or(z.literal("")),
});

export const reportSubmissionSchema = z.object({
  reportDate: z.string().min(10),
  updates: z.array(reportUpdateSchema).min(1, "No report entries provided."),
});

export const reportEditRequestSchema = z.object({
  dailyTaskId: z.string().uuid(),
  reason: z.string().trim().min(10, "Explain clearly why the task could not be completed today.").max(1000),
});

export const reportEditReviewSchema = z.object({
  decision: reportEditDecisionSchema,
  reviewNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export const attendanceStatusSchema = z.enum(["present", "late", "half_day", "absent", "remote"]);

export const attendanceUpdateSchema = z.object({
  attendanceDate: z.string().min(10),
  status: attendanceStatusSchema,
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  checkInAt: z.string().optional().or(z.literal("")),
  checkOutAt: z.string().optional().or(z.literal("")),
  breakMinutes: z.coerce.number().min(0).max(600),
});
