import { apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireUser();

  const unreadCount = await db.workspaceMessage.count({
    where: {
      recipientId: user.id,
      readAt: null,
    },
  });

  return apiSuccess({ unreadCount });
}
