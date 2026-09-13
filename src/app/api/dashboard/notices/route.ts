import {apiSuccess} from '@/lib/api';
import {requireUser} from '@/lib/auth/server';
import {getActiveNoticesForUser} from '@/lib/worklog';
export {publishNotice as POST} from '@/lib/management/notice-actions';
export async function GET() {
  const user = await requireUser();
  const notices = await getActiveNoticesForUser({
    id: user.id,
    departmentId: user.departmentId,
  });

  return apiSuccess({
    notices: (notices ?? []).map((notice) => ({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      publishedAt: notice.publishedAt?.toISOString() ?? null,
      authorName: notice.author?.name ?? "Management",
      departmentName: notice.targetDepartment?.name ?? "All Departments",
    })),
  });
}
