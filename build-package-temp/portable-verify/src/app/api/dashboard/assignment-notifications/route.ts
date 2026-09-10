import { apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { getAssignmentNotifications } from "@/lib/worklog";

export async function GET() {
  const user = await requireUser();
  const notifications = await getAssignmentNotifications(user.id);

  return apiSuccess({ notifications });
}
