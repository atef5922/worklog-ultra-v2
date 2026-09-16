import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    userSession: { updateMany: vi.fn() },
    managementAuditLog: { create: vi.fn() },
  };
  return { auth: vi.fn(), transaction: vi.fn(), tx };
});
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { PATCH } from "./route";

const managerId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const updatedAt = new Date("2026-09-16T08:00:00.000Z");
const manager = {
  id: managerId,
  role: "admin",
  isActive: true,
  managementEnabled: true,
  permissions: [{ permissionKey: "employees.update", isGranted: true }],
  accessScopes: [{ scopeType: "all_company" }],
};
const employee = {
  id: employeeId,
  role: "employee",
  name: "Jane Doe",
  email: "jane@example.com",
  designation: null,
  phone: null,
  location: null,
  updatedAt,
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request(`http://localhost:3000/api/management/employees/${employeeId}`, {
    method: "PATCH",
    headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({
      name: employee.name,
      email: employee.email,
      designation: "",
      phone: "",
      location: "",
      updatedAt: updatedAt.toISOString(),
      reason: "Verified employee contact information.",
      ...overrides,
    }),
  });
}

function patch(overrides: Record<string, unknown> = {}) {
  return PATCH(request(overrides), { params: Promise.resolve({ id: employeeId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: manager });
  mocks.tx.user.findUnique.mockResolvedValue(manager);
  mocks.tx.user.findFirst.mockResolvedValueOnce(employee).mockResolvedValue(null);
  mocks.tx.user.update.mockImplementation(async ({ data }) => ({ ...employee, ...data }));
  mocks.transaction.mockImplementation((callback) => callback(mocks.tx));
});

describe("management employee email changes", () => {
  it("normalizes the email, audits it, and revokes existing sessions", async () => {
    const response = await patch({ email: " New.Address@Example.com " });
    expect(response.status).toBe(200);
    expect(mocks.tx.user.update.mock.calls[0][0].data.email).toBe("new.address@example.com");
    expect(mocks.tx.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: employeeId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.tx.managementAuditLog.create.mock.calls[0][0].data.beforeValue.email).toBe(employee.email);
    expect(mocks.tx.managementAuditLog.create.mock.calls[0][0].data.afterValue.email).toBe("new.address@example.com");
  });

  it("does not revoke sessions when email stays the same", async () => {
    expect((await patch()).status).toBe(200);
    expect(mocks.tx.userSession.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an email already used by another account", async () => {
    mocks.tx.user.findFirst.mockReset().mockResolvedValueOnce(employee).mockResolvedValueOnce({ id: managerId });
    const response = await patch({ email: "taken@example.com" });
    expect(response.status).toBe(409);
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects an actor without the management permission", async () => {
    mocks.auth.mockResolvedValue({ user: { ...manager, permissions: [] } });
    expect((await patch({ email: "new@example.com" })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an employee outside the actor's current scope", async () => {
    mocks.tx.user.findFirst.mockReset().mockResolvedValue(null);
    expect((await patch({ email: "new@example.com" })).status).toBe(404);
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });
});
