import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const tx = { dailyTask:{findMany:vi.fn().mockResolvedValue([])}, $queryRaw: vi.fn(), user: { findUnique: vi.fn() },
    attendanceRecord: { findMany:vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    attendanceWorkSession: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    attendanceBreakSession: { update: vi.fn(), create: vi.fn() }, managementAuditLog: { create: vi.fn() } };
  return { auth: vi.fn(), tx, transaction: vi.fn() };
});
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
import { PUT } from "@/app/api/management/attendance/route";
import { attendanceRevision } from "@/lib/attendance-record";

const manager = "11111111-1111-4111-8111-111111111111";
const employee = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const d = (time: string) => new Date(time);
const actor = { id: manager, role: "super_admin", isActive: true };
function session() { return { id: sessionId, attendanceRecordId: recordId, startedAt: d("2026-09-13T18:00:00+06:00"),
  endedAt: d("2026-09-13T19:00:00+06:00") as Date | null, endReason: "manual", clientEventId: "original-in",
  createdAt: d("2026-09-13"), updatedAt: d("2026-09-13") }; }
const initial = () => ({ id: recordId, userId: employee, attendanceDate: d("2026-09-13"), status: "present" as const,
  note: null as string | null, checkInAt: d("2026-09-13T18:00:00+06:00"), checkOutAt: d("2026-09-13T19:00:00+06:00") as Date | null,
  legacyBreakMinutes: 0, breakMinutes: 0, workingMinutes: 60, createdAt: d("2026-09-13"), updatedAt: d("2026-09-13T19:00:00+06:00"),
  workSessions: [session()], breakSessions: [] as ReturnType<typeof session>[] });
let row: ReturnType<typeof initial>;
function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost:3000/api/management/attendance", { method: "PUT",
    headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ recordId, updatedAt: row.updatedAt.toISOString(), expectedRevision: attendanceRevision(row),
      reason: "Verified the original office entry and exit times.", closeOpenSessions: false, legacyBreakMinutes: 0,
      workSessions: row.workSessions.map(s => ({ id: s.id, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() })),
      breakSessions: [], ...overrides }) });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(d("2026-09-14T13:00:00+06:00")); row = initial();
  mocks.auth.mockResolvedValue({ user: actor }); mocks.tx.user.findUnique.mockResolvedValue(actor);
  mocks.transaction.mockImplementation(fn => fn(mocks.tx));
  for (const find of [mocks.tx.attendanceRecord.findFirst, mocks.tx.attendanceRecord.findUnique, mocks.tx.attendanceRecord.findUniqueOrThrow]) find.mockImplementation(() => Promise.resolve(structuredClone(row)));
  mocks.tx.attendanceWorkSession.findMany.mockResolvedValue([]);
  mocks.tx.attendanceWorkSession.update.mockImplementation(({ where, data }) => { Object.assign(row.workSessions.find(s => s.id === where.id)!, data); return Promise.resolve(); });
  mocks.tx.attendanceBreakSession.update.mockImplementation(({ where, data }) => { Object.assign(row.breakSessions.find(s => s.id === where.id)!, data); return Promise.resolve(); });
  mocks.tx.attendanceRecord.update.mockImplementation(({ data }) => { Object.assign(row, data, { updatedAt: new Date() }); return Promise.resolve(structuredClone(row)); });
});
afterEach(() => vi.useRealTimers());

describe("attendance correction safety", () => {
  it("locks the employee before the record and rereads the permitted record after both locks", async () => {
    expect((await PUT(request())).status).toBe(200);
    const calls = mocks.tx.$queryRaw.mock.calls.map(call => String(call[0]));
    expect(calls[0]).toContain("FROM users"); expect(calls[1]).toContain("FROM attendance_records");
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(mocks.tx.attendanceRecord.findFirst.mock.invocationCallOrder[1]);
    expect(mocks.tx.attendanceRecord.findFirst.mock.calls[1][0].where.userId).toBe(employee);
    expect(mocks.tx.attendanceWorkSession.findMany.mock.calls[0][0].where.attendanceRecord).toEqual({ userId: employee, id: { not: recordId } });
  });
  it("allows exact touching boundaries and ignores zero-duration evidence in another record", async () => {
    mocks.tx.attendanceWorkSession.findMany.mockResolvedValue([
      { startedAt: d("2026-09-13T19:00:00+06:00"), endedAt: null, attendanceRecord: { attendanceDate: d("2026-09-14") } },
      { startedAt: d("2026-09-13T18:30:00+06:00"), endedAt: d("2026-09-13T18:30:00+06:00"), attendanceRecord: { attendanceDate: d("2026-09-14") } },
    ]);
    expect((await PUT(request())).status).toBe(200);
  });
  it("rejects overlap with another record's open session", async () => {
    mocks.tx.attendanceWorkSession.findMany.mockResolvedValue([{ startedAt: d("2026-09-13T18:30:00+06:00"), endedAt: null, attendanceRecord: { attendanceDate: d("2026-09-12") } }]);
    expect((await PUT(request())).status).toBe(409); expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled();
  });
  it("does not silently remove or replace an original session ID", async () => {
    expect((await PUT(request({ workSessions: [{ startedAt: row.workSessions[0].startedAt.toISOString(), endedAt: row.workSessions[0].endedAt!.toISOString() }] }))).status).toBe(400);
    expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled();
  });
  it("requires another reviewer for a non-super-admin's own correction", async () => {
    const self = { id: employee, role: "admin", isActive: true, managementEnabled: true, permissions: [{permissionKey:"attendance.correct",isGranted:true}], accessScopes:[{scopeType:"self"}] };
    mocks.auth.mockResolvedValue({user:self}); mocks.tx.user.findUnique.mockResolvedValue(self);
    expect((await PUT(request())).status).toBe(403); expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled();
  });
  it("rejects a revoked correction permission on the post-lock scoped read", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({id:manager,role:"admin",isActive:true,managementEnabled:false});
    mocks.tx.attendanceRecord.findFirst.mockResolvedValueOnce({userId:employee}).mockResolvedValueOnce(null);
    expect((await PUT(request())).status).toBe(403);
    expect(mocks.tx.attendanceRecord.findFirst.mock.calls[1][0].where.user).toEqual({id:{in:[]}});
    expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled();
  });
  it("rejects an overnight correction overlapping the next attendance date", async () => {
    mocks.tx.attendanceWorkSession.findMany.mockResolvedValue([{ startedAt: d("2026-09-14T10:00:00+06:00"), endedAt: d("2026-09-14T12:00:00+06:00"), attendanceRecord: { attendanceDate: d("2026-09-14") } }]);
    const response = await PUT(request({ workSessions: [{ id: sessionId, startedAt: row.workSessions[0].startedAt.toISOString(), endedAt: "2026-09-14T11:00:00+06:00" }] }));
    expect(response.status).toBe(409); expect((await response.json()).message).toMatch(/overlap/);
    expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled(); expect(mocks.tx.managementAuditLog.create).not.toHaveBeenCalled();
  });
  it("allows a reviewer to explicitly close and repair a stuck open record while preserving the before values", async () => {
    row.workSessions[0].endedAt = null; row.checkOutAt = null;
    const response = await PUT(request({ closeOpenSessions: true, workSessions: [{ id: sessionId, startedAt: row.workSessions[0].startedAt.toISOString(), endedAt: "2026-09-13T19:00:00+06:00" }] }));
    expect(response.status).toBe(200);
    expect(row.workSessions[0].endReason).toBe("corrected");
    expect(mocks.tx.managementAuditLog.create.mock.calls[0][0].data.beforeValue.workSessions[0].endedAt).toBeNull();
  });
  it("requires explicit confirmation before closing any currently open session", async () => {
    row.workSessions[0].endedAt = null;
    const response = await PUT(request({ workSessions: [{ id: sessionId, startedAt: row.workSessions[0].startedAt.toISOString(), endedAt: "2026-09-13T19:00:00+06:00" }] }));
    expect(response.status).toBe(409); expect((await response.json()).message).toMatch(/confirm/i);
    expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled();
  });
  it("rejects changed session evidence even when updatedAt is unchanged", async () => {
    const input = request(); row.workSessions[0].endedAt = d("2026-09-13T19:01:00+06:00");
    expect((await PUT(input)).status).toBe(409); expect(mocks.tx.attendanceWorkSession.update).not.toHaveBeenCalled();
  });
});
