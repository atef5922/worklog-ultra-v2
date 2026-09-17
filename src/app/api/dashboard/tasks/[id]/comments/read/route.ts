import { personalOrScopedTasks } from "@/lib/auth/policy";
import { getServerAuthContext } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/api";
import { db } from "@/lib/db";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user: actor } = await getServerAuthContext();
  if (!actor) return apiError("Your session has expired. Please sign in again.", 401);
  const { id } = await params;
  if (!uuid.test(id)) return apiError("Task not found.", 404);
  const task = await db.dailyTask.findFirst({
    where: { id, ...personalOrScopedTasks(actor, "tasks.view") },
    select: { id: true, commentThreadId: true },
  });
  if (!task) return apiError("Task not found.", 404);
  const input = await request.json().catch(() => null);
  if (!input || typeof input.commentId !== "string" || !uuid.test(input.commentId)) {
    return apiError("Invalid comment.", 400);
  }
  const threadId = task.commentThreadId ?? task.id;
  const comment = await db.taskComment.findFirst({
    where: { id: input.commentId, threadId },
    select: { createdAt: true },
  });
  if (!comment) return apiError("Comment not found.", 404);
  await db.taskCommentRead.createMany({
    data: [{ threadId, userId: actor.id, lastReadAt: comment.createdAt }],
    skipDuplicates: true,
  });
  await db.taskCommentRead.updateMany({
    where: { threadId, userId: actor.id, lastReadAt: { lt: comment.createdAt } },
    data: { lastReadAt: comment.createdAt },
  });
  return apiSuccess({ message: "Comments marked as read." });
}
