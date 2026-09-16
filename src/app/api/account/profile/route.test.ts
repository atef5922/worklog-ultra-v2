import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ db: { user: { update: mocks.update } } }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    role: "employee",
    departmentId: "22222222-2222-4222-8222-222222222222",
  });
});

describe("self-service profile identity protection", () => {
  it("rejects a forged email field without updating the user", async () => {
    const request = new Request("http://localhost:3000/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Doe", email: "new@example.com" }),
    });
    const response = await POST(request as Parameters<typeof POST>[0]);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a forged department change without updating the user", async () => {
    const request = new Request("http://localhost:3000/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jane Doe",
        departmentId: "33333333-3333-4333-8333-333333333333",
      }),
    });
    const response = await POST(request as Parameters<typeof POST>[0]);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves other profile fields without writing department", async () => {
    mocks.update.mockResolvedValue({
      name: "Jane Doe",
      avatarUrl: null,
      designation: null,
      department: { name: "Engineering" },
    });
    const request = new Request("http://localhost:3000/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Doe" }),
    });
    expect((await POST(request as Parameters<typeof POST>[0])).status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("departmentId");
  });
});
