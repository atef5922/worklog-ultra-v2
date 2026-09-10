import { UserRole } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getActiveNoticesForUser } from "@/lib/worklog";

export async function GET() {
  const user = await requireUser();
  const notices = await getActiveNoticesForUser({
    id: user.id,
    departmentId: user.departmentId,
  });

  return apiSuccess({
    notices: notices.map((notice) => ({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      publishedAt: notice.publishedAt?.toISOString() ?? null,
      authorName: notice.author?.name ?? "Management",
      departmentName: notice.targetDepartment?.name ?? "All Departments",
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (user.role !== UserRole.admin && user.role !== UserRole.manager && user.role !== UserRole.hr) {
    return apiError("Only Admin, Team Head, or HR can publish notices.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const noticeBody = typeof body.body === "string" ? body.body.trim() : "";
  const targetDepartmentId =
    typeof body.targetDepartmentId === "string" && body.targetDepartmentId.trim() ? body.targetDepartmentId : null;

  if (!title) {
    return apiError("Notice title is required.");
  }

  if (!noticeBody) {
    return apiError("Notice details are required.");
  }

  const notice = await db.hrNotice.create({
    data: {
      title,
      body: noticeBody,
      authorId: user.id,
      targetDepartmentId,
      isActive: true,
      publishedAt: new Date(),
    },
    include: {
      targetDepartment: true,
    },
  });

  return apiSuccess({
    message: "Notice published successfully.",
    notice: {
      id: notice.id,
      title: notice.title,
      body: notice.body,
      departmentName: notice.targetDepartment?.name ?? "All Departments",
    },
  });
}
