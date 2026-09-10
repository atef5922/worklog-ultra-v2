import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireManager } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { reportEditReviewSchema } from "@/lib/validators/worklog";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reviewer = await requireManager();
  const { id } = await params;
  const body = await request.json();
  const parsed = reportEditReviewSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid review action.");
  }

  const editRequest = await db.reportEditRequest.findUnique({
    where: { id },
    include: {
      dailyTask: true,
    },
  });

  if (!editRequest) {
    return apiError("Edit request not found.", 404);
  }

  if (reviewer.departmentId && editRequest.dailyTask.departmentId !== reviewer.departmentId) {
    return apiError("This request belongs to another department.", 403);
  }

  await db.reportEditRequest.update({
    where: { id },
    data: {
      status: parsed.data.decision,
      reviewNote: parsed.data.reviewNote || null,
      reviewerId: reviewer.id,
      reviewedAt: new Date(),
    },
  });

  return apiSuccess({
    message:
      parsed.data.decision === "approved"
        ? "Backdated edit request approved."
        : "Backdated edit request rejected.",
  });
}
