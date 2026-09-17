import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  task: { findFirst: vi.fn() },
  comment: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  read: { findUnique: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.user }));
vi.mock("@/lib/db", () => ({
  db: { dailyTask: mocks.task, taskComment: mocks.comment, taskCommentRead: mocks.read },
}));

import { GET, POST } from "./route";
import { POST as markRead } from "./read/route";

const managerId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const commentId = "44444444-4444-4444-8444-444444444444";
const manager = {
  id: managerId, role: "admin", isActive: true, managementEnabled: true,
  permissions: [{ permissionKey: "tasks.view", isGranted: true }],
  accessScopes: [{ scopeType: "employees", employeeId }],
};
const params = { params: Promise.resolve({ id: taskId }) };
function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/dashboard/tasks/" + taskId + "/comments", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ user: manager });
  mocks.task.findFirst.mockResolvedValue({ id: taskId, commentThreadId: null, taskTitle: "Assigned task" });
  mocks.comment.count.mockResolvedValue(0);
  mocks.comment.findMany.mockResolvedValue([]);
  mocks.read.findUnique.mockResolvedValue(null);
  mocks.comment.create.mockResolvedValue({
    id: commentId, authorId: managerId, body: "Please check this.",
    createdAt: new Date("2026-09-17T06:00:00Z"), author: { name: "Manager" },
  });
  mocks.comment.findFirst.mockResolvedValue({ createdAt: new Date("2026-09-17T06:00:00Z") });
});

describe("task comments", () => {
  it("returns JSON when the session expires", async () => {
    mocks.user.mockResolvedValue({ user: null });
    const response = await GET(new NextRequest("http://localhost:3000/api/dashboard/tasks/" + taskId + "/comments"), params);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, message: expect.stringContaining("session") });
    expect(mocks.task.findFirst).not.toHaveBeenCalled();
  });

  it("includes the author profile in loaded comments", async () => {
    mocks.comment.findMany.mockResolvedValue([{
      id: commentId, authorId: managerId, body: "Please check this.",
      createdAt: new Date("2026-09-17T06:00:00Z"),
      author: { name: "Manager", avatarUrl: "/avatars/manager.png" },
    }]);
    const response = await GET(new NextRequest("http://localhost:3000/api/dashboard/tasks/" + taskId + "/comments"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).comments[0]).toMatchObject({
      authorName: "Manager", authorAvatarUrl: "/avatars/manager.png",
    });
  });

  it("lets a scoped manager comment using the task thread", async () => {
    const response = await POST(request({ body: "  Please check this.  " }), params);
    expect(response.status).toBe(201);
    expect(mocks.task.findFirst.mock.calls[0][0].where).toMatchObject({
      id: taskId, OR: [{ userId: managerId }, { user: { OR: [{ id: employeeId }] } }],
    });
    expect(mocks.comment.create.mock.calls[0][0].data).toEqual({
      threadId: taskId, authorId: managerId, body: "Please check this.",
    });
  });

  it("lets the assigned employee reply to the same continued thread", async () => {
    mocks.user.mockResolvedValue({ user: { id: employeeId, role: "employee", isActive: true } });
    mocks.task.findFirst.mockResolvedValue({ id: taskId, commentThreadId: managerId, taskTitle: "Continued task" });
    await POST(request({ body: "I have updated it." }), params);
    expect(mocks.comment.create.mock.calls[0][0].data).toMatchObject({
      threadId: managerId, authorId: employeeId,
    });
  });

  it("does not reveal or mutate an out-of-scope task", async () => {
    mocks.task.findFirst.mockResolvedValue(null);
    const get = await GET(new NextRequest("http://localhost:3000/api/dashboard/tasks/" + taskId + "/comments"), params);
    const post = await POST(request({ body: "Hidden" }), params);
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
    expect(mocks.comment.findMany).not.toHaveBeenCalled();
    expect(mocks.comment.create).not.toHaveBeenCalled();
  });

  it("rejects blank and oversized messages", async () => {
    expect((await POST(request({ body: "   " }), params)).status).toBe(400);
    expect((await POST(request({ body: "x".repeat(2001) }), params)).status).toBe(400);
    expect(mocks.comment.create).not.toHaveBeenCalled();
  });

  it("counts only new comments by another person", async () => {
    const readAt = new Date("2026-09-17T05:00:00Z");
    mocks.read.findUnique.mockResolvedValue({ lastReadAt: readAt });
    const response = await GET(new NextRequest("http://localhost:3000/api/dashboard/tasks/" + taskId + "/comments?summary=1"), params);
    expect(response.status).toBe(200);
    expect(mocks.comment.count.mock.calls[0][0].where).toMatchObject({
      threadId: taskId, authorId: { not: managerId }, createdAt: { gt: readAt },
    });
    expect(mocks.comment.findMany).not.toHaveBeenCalled();
  });

  it("only marks a comment from the visible task thread as read", async () => {
    const response = await markRead(request({ commentId }), params);
    expect(response.status).toBe(200);
    expect(mocks.comment.findFirst.mock.calls[0][0].where).toEqual({ id: commentId, threadId: taskId });
    expect(mocks.read.createMany).toHaveBeenCalled();
    expect(mocks.read.updateMany).toHaveBeenCalled();
    mocks.comment.findFirst.mockResolvedValue(null);
    expect((await markRead(request({ commentId }), params)).status).toBe(404);
  });
});
