import { NextRequest } from "next/server";
import { personalOrScopedTasks } from "@/lib/auth/policy";
import { getServerAuthContext } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/api";
import { db } from "@/lib/db";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

async function visibleThread(id: string, actor: NonNullable<Awaited<ReturnType<typeof getServerAuthContext>>["user"]>) {
  if (!uuid.test(id)) return null;
  const task = await db.dailyTask.findFirst({
    where: { id, ...personalOrScopedTasks(actor, "tasks.view") },
    select: { id: true, commentThreadId: true, taskTitle: true },
  });
  return task ? { threadId: task.commentThreadId ?? task.id, taskTitle: task.taskTitle } : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user: actor } = await getServerAuthContext();
  if (!actor) return apiError("Your session has expired. Please sign in again.", 401);
  const thread = await visibleThread((await params).id, actor);
  if (!thread) return apiError("Task not found.", 404);

  const read = await db.taskCommentRead.findUnique({
    where: { threadId_userId: { threadId: thread.threadId, userId: actor.id } },
    select: { lastReadAt: true },
  });
  const unreadCount = await db.taskComment.count({
    where: {
      threadId: thread.threadId,
      authorId: { not: actor.id },
      ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
    },
  });
  if (request.nextUrl.searchParams.get("summary") === "1") {
    return apiSuccess({ unreadCount });
  }

  const before = request.nextUrl.searchParams.get("before");
  if (before && !uuid.test(before)) return apiError("Invalid comment cursor.", 400);
  if (before) {
    const cursor = await db.taskComment.findFirst({
      where: { id: before, threadId: thread.threadId },
      select: { id: true },
    });
    if (!cursor) return apiError("Invalid comment cursor.", 400);
  }
  const page = await db.taskComment.findMany({
    where: { threadId: thread.threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true, body: true, createdAt: true, authorId: true,
      author: { select: { name: true, avatarUrl: true } },
    },
  });
  const visible = page.slice(0, PAGE_SIZE);
  return apiSuccess({
    taskTitle: thread.taskTitle,
    unreadCount,
    hasMore: page.length > PAGE_SIZE,
    nextCursor: page.length > PAGE_SIZE ? visible.at(-1)?.id ?? null : null,
    comments: visible.reverse().map(comment => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      authorId: comment.authorId,
      authorName: comment.author.name,
      authorAvatarUrl: comment.author.avatarUrl,
    })),
    currentUserId: actor.id,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user: actor } = await getServerAuthContext();
  if (!actor) return apiError("Your session has expired. Please sign in again.", 401);
  const thread = await visibleThread((await params).id, actor);
  if (!thread) return apiError("Task not found.", 404);
  const input = await request.json().catch(() => null);
  if (!input || typeof input.body !== "string") return apiError("Write a comment first.", 400);
  const body = input.body.trim();
  if (!body || body.length > 2000) return apiError("Comment must be between 1 and 2000 characters.", 400);
  const comment = await db.taskComment.create({
    data: { threadId: thread.threadId, authorId: actor.id, body },
    select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { name: true, avatarUrl: true } } },
  });
  return apiSuccess({
    comment: {
      id: comment.id, body: comment.body, createdAt: comment.createdAt.toISOString(),
      authorId: comment.authorId, authorName: comment.author.name,
      authorAvatarUrl: comment.author.avatarUrl,
    },
  }, 201);
}
