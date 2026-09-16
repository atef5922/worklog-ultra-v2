import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  records: vi.fn(),
  overrides: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: mocks.users },
    attendanceRecord: { findMany: mocks.records },
    attendanceDayOverride: { findMany: mocks.overrides },
  },
}));
import { attendanceDayKind, attendanceOverview } from "./attendance-overview";

const employeeId = "11111111-1111-4111-8111-111111111111";
const departmentId = "22222222-2222-4222-8222-222222222222";
const actor = {
  id: "33333333-3333-4333-8333-333333333333",
  role: "admin",
  isActive: true,
  managementEnabled: true,
  permissions: [
    { permissionKey: "employees.view", isGranted: true },
    { permissionKey: "attendance.view", isGranted: true },
  ],
  accessScopes: [{ scopeType: "departments", departmentId }],
};
const person = {
  id: employeeId, name: "Jane Doe", email: "jane@example.com",
  isActive: true, createdAt: new Date("2026-01-01T00:00:00Z"), departmentId, teamId: null,
  department: { id: departmentId, name: "IT" }, team: null,
};
const day = (date: string, subjectKey: string, kind: string) => ({
  attendanceDate: new Date(date), subjectKey, kind, reason: "Approved schedule change.",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  mocks.users.mockResolvedValue([person]);
  mocks.records.mockResolvedValue([]);
  mocks.overrides.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("management attendance overview", () => {
  it("keeps today's missing Check In pending until 7:30 PM, then marks Absent", async () => {
    const params = new URLSearchParams({ from: "2026-09-20", to: "2026-09-20" });
    vi.setSystemTime(new Date("2026-09-20T19:29:59+06:00"));
    expect((await attendanceOverview(actor, params)).rows[0].status).toBe("not_checked_in");
    vi.setSystemTime(new Date("2026-09-20T19:30:00+06:00"));
    const result = await attendanceOverview(actor, params);
    expect(result.rows[0].status).toBe("absent");
    expect(result.totals.absent).toBe(1);
  });

  it("counts 10:00 as on time and later first In as Late while both are present", async () => {
    mocks.records.mockResolvedValue([{
      userId: employeeId, attendanceDate: new Date("2026-09-19"), legacyBreakMinutes: 0,
      workSessions: [{ id: "work", startedAt: new Date("2026-09-19T10:00:00+06:00"),
        endedAt: new Date("2026-09-19T19:00:00+06:00"), endReason: "manual" }],
      breakSessions: [],
    }]);
    const params = new URLSearchParams({ from: "2026-09-19", to: "2026-09-19" });
    expect((await attendanceOverview(actor, params)).totals.late).toBe(0);
    mocks.records.mockResolvedValue([{
      userId: employeeId, attendanceDate: new Date("2026-09-19"), legacyBreakMinutes: 0,
      workSessions: [{ id: "work", startedAt: new Date("2026-09-19T10:00:01+06:00"),
        endedAt: new Date("2026-09-19T19:00:00+06:00"), endReason: "manual" }],
      breakSessions: [],
    }]);
    const result = await attendanceOverview(actor, params);
    expect(result.totals.recorded).toBe(1);
    expect(result.totals.late).toBe(1);
  });
  it("treats Friday as off, but an unrecorded normal past workday as absent", async () => {
    const data = await attendanceOverview(actor, new URLSearchParams({ from: "2026-09-18", to: "2026-09-19" }));
    expect(data.rows.map(row => [row.date, row.status])).toEqual([
      ["2026-09-19", "absent"],
      ["2026-09-18", "off_day"],
    ]);
    expect(data.totals.absent).toBe(1);
  });

  it("applies individual exceptions before department and company exceptions", () => {
    const overrides = new Map([
      ["2026-09-18:company", day("2026-09-18", "company", "workday")],
      [`2026-09-18:department:${departmentId}`, day("2026-09-18", `department:${departmentId}`, "off")],
      [`2026-09-18:employee:${employeeId}`, day("2026-09-18", `employee:${employeeId}`, "leave")],
    ]);
    expect(attendanceDayKind("2026-09-18", employeeId, departmentId, overrides).kind).toBe("leave");
    overrides.delete(`2026-09-18:employee:${employeeId}`);
    expect(attendanceDayKind("2026-09-18", employeeId, departmentId, overrides).kind).toBe("off");
    overrides.delete(`2026-09-18:department:${departmentId}`);
    expect(attendanceDayKind("2026-09-18", employeeId, departmentId, overrides).kind).toBe("workday");
  });

  it("marks real Friday work separately without inventing payable overtime", async () => {
    mocks.records.mockResolvedValue([{
      userId: employeeId, attendanceDate: new Date("2026-09-18"),
      legacyBreakMinutes: 0,
      workSessions: [{
        id: "work", startedAt: new Date("2026-09-18T10:00:00+06:00"),
        endedAt: new Date("2026-09-18T13:00:00+06:00"), endReason: "manual",
      }],
      breakSessions: [],
    }]);
    const data = await attendanceOverview(actor, new URLSearchParams({ from: "2026-09-18", to: "2026-09-18" }));
    expect(data.rows[0]).toMatchObject({
      status: "worked_off_day", countedMinutes: 180,
      offDayWorkMinutes: 180, overtimeMinutes: 0,
    });
  });

  it("shows a former employee's recorded days but does not mark later days missing", async () => {
    mocks.users.mockResolvedValue([{ ...person, isActive: false }]);
    mocks.records.mockResolvedValue([{
      userId: employeeId, attendanceDate: new Date("2026-09-18"), legacyBreakMinutes: 0,
      workSessions: [{ id: "work", startedAt: new Date("2026-09-18T18:00:00+06:00"),
        endedAt: new Date("2026-09-18T19:20:00+06:00"), endReason: "manual" }],
      breakSessions: [],
    }]);
    const data = await attendanceOverview(actor, new URLSearchParams({ from: "2026-09-18", to: "2026-09-19" }));
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      status: "worked_off_day", offDayWorkMinutes: 80, overtimeMinutes: 0,
    });
  });

  it("does not inflate an open session after the 7:30 PM safety cutoff", async () => {
    mocks.records.mockResolvedValue([{
      userId: employeeId, attendanceDate: new Date("2026-09-19"),
      legacyBreakMinutes: 0,
      workSessions: [{
        id: "work", startedAt: new Date("2026-09-19T10:00:00+06:00"),
        endedAt: null, endReason: null,
      }],
      breakSessions: [],
    }]);
    const data = await attendanceOverview(actor, new URLSearchParams({ from: "2026-09-19", to: "2026-09-19" }));
    expect(data.rows[0]).toMatchObject({
      status: "pending_auto_close", active: false, countedMinutes: 540,
    });
  });

  it("intersects both management scopes before reading attendance", async () => {
    await attendanceOverview(actor, new URLSearchParams({ from: "2026-09-18", to: "2026-09-18" }));
    expect(mocks.users.mock.calls[0][0].where.AND.slice(0, 2)).toEqual([
      { OR: [{ departmentId }] }, { OR: [{ departmentId }] },
    ]);
    expect(mocks.records.mock.calls[0][0].where.userId).toEqual({ in: [employeeId] });
  });

  it("does not query data when attendance view permission is absent", async () => {
    const denied = { ...actor, permissions: [{ permissionKey: "employees.view", isGranted: true }] };
    await expect(attendanceOverview(denied, new URLSearchParams())).rejects.toThrow(/access/);
    expect(mocks.users).not.toHaveBeenCalled();
  });

  it("rejects large or malformed date ranges", async () => {
    await expect(attendanceOverview(actor, new URLSearchParams({ from: "2026-01-01", to: "2026-09-18" }))).rejects.toThrow(/93 days/);
    await expect(attendanceOverview(actor, new URLSearchParams({ departmentId: "bad" }))).rejects.toThrow(/Invalid/);
  });
});
