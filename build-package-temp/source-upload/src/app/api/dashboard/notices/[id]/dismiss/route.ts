import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const notice = await db.hrNotice.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!notice) {
    return apiError("Notice not found.", 404);
  }

  await db.hrNoticeDismissal.upsert({
    where: {
      noticeId_userId: {
        noticeId: id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      noticeId: id,
      userId: user.id,
    },
  });

  return apiSuccess({ message: "Notice dismissed." });
}
