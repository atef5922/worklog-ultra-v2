import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    department: { findUnique: vi.fn() },
    attendanceDayOverride: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    managementAuditLog: { create: vi.fn() },
  };
  return { auth: vi.fn(), transaction: vi.fn(), tx };
});
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { POST } from "./route";

const actorId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const actor = {
  id: actorId, role: "admin", isActive: true, managementEnabled: true,
  permissions: ["employees.view", "attendance.view", "attendance.correct"].map(permissionKey => ({ permissionKey, isGranted: true })),
  accessScopes: [{ scopeType: "employees", employeeId }],
};
function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost:3000/api/management/attendance/day-override", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({
      date: "2026-09-18", subjectType: "employee", subjectId: employeeId,
      kind: "leave", reason: "Approved employee leave.", ...overrides,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: actor });
  mocks.tx.user.findUnique.mockResolvedValue(actor);
  mocks.tx.user.findFirst.mockResolvedValue({ id: employeeId });
  mocks.tx.attendanceDayOverride.findUnique.mockResolvedValue(null);
  mocks.tx.attendanceDayOverride.upsert.mockResolvedValue({ id: "override", kind: "leave" });
  mocks.transaction.mockImplementation(callback => callback(mocks.tx));
});

describe("dated attendance exceptions", () => {
  it("allows a scoped reviewer to record employee leave with an audit reason", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.tx.user.findFirst.mock.calls[0][0].where.AND).toContainEqual({ OR: [{ id: employeeId }] });
    expect(mocks.tx.attendanceDayOverride.upsert.mock.calls[0][0].create).toMatchObject({
      subjectKey: `employee:${employeeId}`, kind: "leave", employeeId,
    });
    expect(mocks.tx.managementAuditLog.create.mock.calls[0][0].data.reason).toBe("Approved employee leave.");
  });

  it("denies an employee outside the reviewer's current scope", async () => {
    mocks.tx.user.findFirst.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.tx.attendanceDayOverride.upsert).not.toHaveBeenCalled();
  });

  it("requires another reviewer for the manager's own dated exception", async () => {
    mocks.tx.user.findFirst.mockResolvedValue({ id: actorId });
    expect((await POST(request({ subjectId: actorId }))).status).toBe(403);
    expect(mocks.tx.attendanceDayOverride.upsert).not.toHaveBeenCalled();
  });

  it("rejects a correction permission revoked after authentication", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({
      ...actor, permissions: actor.permissions.filter(item => item.permissionKey !== "attendance.correct"),
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.tx.attendanceDayOverride.upsert).not.toHaveBeenCalled();
  });

  it("reserves company and department exceptions for Super Admin", async () => {
    expect((await POST(request({ subjectType: "company", subjectId: null, kind: "off" }))).status).toBe(403);
    mocks.auth.mockResolvedValue({ user: { ...actor, role: "super_admin" } });
    mocks.tx.user.findUnique.mockResolvedValue({ ...actor, role: "super_admin" });
    expect((await POST(request({ subjectType: "company", subjectId: null, kind: "off" }))).status).toBe(200);
  });

  it("cannot grant company-wide leave or bypass the correction permission", async () => {
    expect((await POST(request({ subjectType: "company", subjectId: null, kind: "leave" }))).status).toBe(400);
    mocks.auth.mockResolvedValue({ user: { ...actor, permissions: actor.permissions.filter(item => item.permissionKey !== "attendance.correct") } });
    expect((await POST(request())).status).toBe(403);
  });
});
