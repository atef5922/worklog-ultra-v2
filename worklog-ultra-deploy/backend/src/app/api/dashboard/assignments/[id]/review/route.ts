import { ReportEditRequestStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { buildAssignmentReviewReason, extractAssignmentReviewReason, ASSIGNMENT_REVIEW_PREFIX } from "@/lib/assignment-review";
import { db } from "@/lib/db";

function serializeReview(
  request: {
    id: string;
    status: ReportEditRequestStatus;
    reason: string;
    reviewNote: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    requestedById: string;
    reviewerId: string | null;
  } | null,
) {
  if (!request) {
    return null;
  }

  return {
    id: request.id,
    status: request.status,
    submitNote: extractAssignmentReviewReason(request.reason) ?? "",
    reviewNote: request.reviewNote,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
    requestedById: request.requestedById,
    reviewerId: request.reviewerId,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireUser();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!["submit", "approve", "reject"].includes(action)) {
    return apiError("Invalid assignment review action.", 400);
  }

  const task = await db.dailyTask.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      assignedBy: true,
    },
  });

  if (!task) {
    return apiError("Assignment task not found.", 404);
  }

  if (action === "submit") {
    if (task.userId !== actor.id) {
      return apiError("Only the assignee can submit this assignment.", 403);
    }

    if (!task.assignedBy || task.assignedBy === actor.id) {
      return apiError("This task does not need assignment approval.", 400);
    }

    if (!note) {
      return apiError("Add a short submit note first.", 400);
    }

    const existingPending = await db.reportEditRequest.findFirst({
      where: {
        dailyTaskId: task.id,
        requestedById: actor.id,
        status: "pending",
        reason: { startsWith: ASSIGNMENT_REVIEW_PREFIX },
      },
      orderBy: { createdAt: "desc" },
    });

    const saved =
      existingPending
        ? await db.reportEditRequest.update({
            where: { id: existingPending.id },
            data: {
              reason: buildAssignmentReviewReason(note),
              reviewerId: null,
              reviewNote: null,
              reviewedAt: null,
              status: "pending",
            },
          })
        : await db.reportEditRequest.create({
            data: {
              dailyTaskId: task.id,
              requestedById: actor.id,
              reason: buildAssignmentReviewReason(note),
            },
          });

    return apiSuccess({
      message: "Assignment submitted for approval.",
      review: serializeReview(saved),
    });
  }

  if (actor.id !== task.assignedBy && actor.role !== UserRole.admin) {
    return apiError("Only the assigner can review this assignment.", 403);
  }

  const latestPending = await db.reportEditRequest.findFirst({
    where: {
      dailyTaskId: task.id,
      status: "pending",
      reason: { startsWith: ASSIGNMENT_REVIEW_PREFIX },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestPending) {
    return apiError("No pending assignment submission found.", 404);
  }

  const decision = action === "approve" ? "approved" : "rejected";
  const updated = await db.reportEditRequest.update({
    where: { id: latestPending.id },
    data: {
      status: decision,
      reviewNote: note || null,
      reviewerId: actor.id,
      reviewedAt: new Date(),
    },
  });

  return apiSuccess({
    message: decision === "approved" ? "Assignment approved successfully." : "Assignment returned with note.",
    review: serializeReview(updated),
  });
}
