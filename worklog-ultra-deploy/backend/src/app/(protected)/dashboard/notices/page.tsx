import { UserRole } from "@prisma/client";
import { NoticesCenter } from "@/components/dashboard/notices-center";
import { requireUser } from "@/lib/auth/server";
import { getActiveNoticesForUser, getDepartments } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const user = await requireUser();
  const [departments, notices] = await Promise.all([
    getDepartments(),
    getActiveNoticesForUser({ id: user.id, departmentId: user.departmentId }),
  ]);

  return (
    <NoticesCenter
      canPublish={user.role === UserRole.admin || user.role === UserRole.manager || user.role === UserRole.hr}
      departments={departments}
      notices={notices.map((notice) => ({
        id: notice.id,
        title: notice.title,
        body: notice.body,
        authorName: notice.author?.name ?? "Management",
        departmentName: notice.targetDepartment?.name ?? "All Departments",
        publishedAt: notice.publishedAt?.toISOString() ?? null,
      }))}
    />
  );
}
