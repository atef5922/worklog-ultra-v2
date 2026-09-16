import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const records = { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() };
  const tx = { dailyTask:{findMany:vi.fn().mockResolvedValue([])}, $queryRaw: vi.fn(), user: { findUnique: vi.fn() }, attendanceRecord: records,
    attendanceWorkSession: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() }, attendanceBreakSession: { create: vi.fn(), update: vi.fn() },
    managementAuditLog: { create: vi.fn() } };
  return { auth: vi.fn(), tx, db: { $transaction: vi.fn(), attendanceRecord: records } };
});
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
import { getAttendance, postAttendance } from "./attendance-service";
import { attendanceRevision, type AttendanceRecordWithSessions } from "./attendance-record";
const userId = "11111111-1111-4111-8111-111111111111";
const actor = { id: userId, role: "employee", isActive: true };
const day = "2026-09-14";
let rows: AttendanceRecordWithSessions[], serial = 0;
const id = () => `22222222-2222-4222-8222-${String(++serial).padStart(12, "0")}`;
function record(date = day): AttendanceRecordWithSessions {
  return { id: id(), userId, attendanceDate: new Date(date), status: "present", note: null,
    checkInAt: null, checkOutAt: null, breakMinutes: 0, legacyBreakMinutes: 0, workingMinutes: 0,
    createdAt: new Date(), updatedAt: new Date(), workSessions: [], breakSessions: [] };
}
function session(start: string, end: string | null = null) {
  return { id: id(), attendanceRecordId: "record", startedAt: new Date(start), endedAt: end ? new Date(end) : null,
    endReason: end ? "manual" : null, clientEventId: id(), createdAt: new Date(), updatedAt: new Date() };
}
function request(action: string, extra: Record<string, unknown> = {}) {
  const attendanceDate = String(extra.attendanceDate ?? day);
  const current = rows.find(r => r.attendanceDate.toISOString().slice(0, 10) === attendanceDate);
  return new Request("http://localhost:3000/api/dashboard/attendance", { method: "POST",
    headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ action, expectedUserId: userId, attendanceDate, eventId: id(), expectedRevision: current ? attendanceRevision(current) : null, ...extra }) });
}
beforeEach(() => {
  vi.clearAllMocks(); serial = 0; rows = []; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T10:00:37+06:00"));
  mocks.auth.mockResolvedValue({ user: actor }); mocks.tx.user.findUnique.mockResolvedValue(actor);
  // Serialize this synthetic database like the employee row lock. This is not a real PostgreSQL concurrency test.
  let queue = Promise.resolve();
  mocks.db.$transaction.mockImplementation((fn: (tx: typeof mocks.tx) => Promise<unknown>) => {
    const next = queue.then(() => fn(mocks.tx)); queue = next.then(() => undefined, () => undefined); return next;
  });
  mocks.tx.attendanceRecord.findMany.mockImplementation(() => Promise.resolve(structuredClone(rows.filter(r => r.workSessions.some(s => !s.endedAt)))));
  mocks.tx.attendanceRecord.findFirst.mockImplementation(() => Promise.resolve(structuredClone(rows.find(r => r.workSessions.some(s => !s.endedAt)) ?? null)));
  const find = ({ where }: { where: { id?: string; userId_attendanceDate?: { attendanceDate: Date } } }) =>
    Promise.resolve(structuredClone(rows.find(r => where.id ? r.id === where.id : r.attendanceDate.getTime() === where.userId_attendanceDate?.attendanceDate.getTime()) ?? null));
  mocks.tx.attendanceRecord.findUnique.mockImplementation(find); mocks.tx.attendanceRecord.findUniqueOrThrow.mockImplementation(find);
  mocks.tx.attendanceWorkSession.findMany.mockResolvedValue([]);
  mocks.tx.attendanceRecord.create.mockImplementation(({ data }) => { const row = { ...record(data.attendanceDate.toISOString().slice(0, 10)), ...data }; rows.push(row); return Promise.resolve(structuredClone(row)); });
  mocks.tx.attendanceRecord.update.mockImplementation(({ where, data }) => { const row = rows.find(r => r.id === where.id)!; Object.assign(row, data, { updatedAt: new Date() }); return Promise.resolve(structuredClone(row)); });
  for (const [model, field] of [[mocks.tx.attendanceWorkSession, "workSessions"], [mocks.tx.attendanceBreakSession, "breakSessions"]] as const) {
    model.create.mockImplementation(({ data }) => { const row = rows.find(r => r.id === data.attendanceRecordId)!; const item = { ...session(data.startedAt.toISOString()), ...data }; row[field].push(item); return Promise.resolve(structuredClone(item)); });
    model.update.mockImplementation(({ where, data }) => { const item = rows.flatMap(r => r[field]).find(s => s.id === where.id)!; Object.assign(item, data, { updatedAt: new Date() }); return Promise.resolve(structuredClone(item)); });
  }
});
afterEach(() => vi.useRealTimers());

describe("attendance API", () => {
  it("requires account binding even for a first In with no revision", async () => {
    expect((await postAttendance(request("check_in", {expectedUserId:undefined}))).status).toBe(409);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("does not open a session that would overlap another date's future-ended legacy record", async () => {
    mocks.tx.attendanceWorkSession.findMany.mockResolvedValue([{ startedAt:new Date("2026-09-13T19:00:00+06:00"), endedAt:new Date("2026-09-14T12:00:00+06:00"), attendanceRecord:{attendanceDate:new Date("2026-09-13")} }]);
    expect((await postAttendance(request("check_in"))).status).toBe(409);
    expect(rows).toHaveLength(0);
  });
  it("includes the authenticated account in POST confirmations", async () => {
    expect(await (await postAttendance(request("check_in"))).json()).toMatchObject({success:true,userId});
  });
  it("rejects a stale tab belonging to another account before opening a transaction", async () => {
    const response = await postAttendance(request("check_in", { expectedUserId: "33333333-3333-4333-8333-333333333333" }));
    expect(response.status).toBe(409);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });
  it("returns JSON 401 without redirecting expired sessions", async () => { mocks.auth.mockResolvedValue({ user: null }); const response = await postAttendance(request("check_in")); expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ success: false }); expect(mocks.db.$transaction).not.toHaveBeenCalled(); });
  it("rejects cross-origin writes", async () => { const input = request("check_in"); input.headers.set("origin", "https://untrusted.example"); expect((await postAttendance(input)).status).toBe(403); expect(rows).toHaveLength(0); });
  it("allows a direct same-origin LAN attendance write when Next exposes an internal localhost URL", async () => {
    const input = request("check_in");
    input.headers.set("origin", "http://192.168.68.95:3001");
    input.headers.set("host", "192.168.68.95:3001");
    expect((await postAttendance(input)).status).toBe(200);
    expect(rows[0].workSessions).toHaveLength(1);
  });
  it("rejects an external origin even when the request Host is a LAN address", async () => {
    const input = request("check_in");
    input.headers.set("origin", "https://untrusted.example");
    input.headers.set("host", "192.168.68.95:3001");
    expect((await postAttendance(input)).status).toBe(403);
    expect(rows).toHaveLength(0);
  });
  it("rechecks active account under the employee lock", async () => { mocks.tx.user.findUnique.mockResolvedValue({ ...actor, isActive: false }); expect((await postAttendance(request("check_in"))).status).toBe(403); expect(mocks.tx.attendanceRecord.create).not.toHaveBeenCalled(); });
  it.each(["super_admin", "moderator", "admin", "team_head", "employee"])("allows the %s role to record their own attendance", async role => { mocks.auth.mockResolvedValue({ user: { ...actor, role } }); expect((await postAttendance(request("check_in"))).status).toBe(200); expect(rows[0].userId).toBe(userId); });
  it("uses server seconds, ignores near-current client clock and does not accept client status or owner", async () => {
    const response = await postAttendance(request("check_in", { occurredAt: "2026-09-14T10:00:00+06:00", status: "absent", userId: "someone-else" }));
    expect(response.status).toBe(200); expect(rows[0].workSessions[0].startedAt).toEqual(new Date()); expect(rows[0].status).toBe("present"); expect(rows[0].userId).toBe(userId);
    const calls = mocks.tx.$queryRaw.mock.calls.map(call => String(call[0])); expect(calls[0]).toContain("FROM users"); expect(calls[0]).toContain("FOR UPDATE");
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.attendanceRecord.findMany.mock.invocationCallOrder[0]);
  });
  it.each(["2026-09-13T10:00:00+06:00", "2026-09-14T10:05:00+06:00"])("rejects forged time %s without creating a record", async occurredAt => { expect((await postAttendance(request("check_in", { occurredAt }))).status).toBe(400); expect(rows).toHaveLength(0); });
  it("rejects historical Check In even without occurredAt", async () => { expect((await postAttendance(request("check_in", { attendanceDate: "2026-09-13" }))).status).toBe(400); expect(rows).toHaveLength(0); });
  it.each(["break_start", "break_end", "check_out"])("rejects %s before In", async action => { expect((await postAttendance(request(action))).status).toBe(409); expect(rows).toHaveLength(0); });
  it("rejects replayed/concurrent In using the original revision", async () => { const a = request("check_in"), b = request("check_in"); const results = await Promise.all([postAttendance(a), postAttendance(b)]); expect(results.map(r => r.status)).toEqual([200, 409]); expect(rows[0].workSessions).toHaveLength(1); });
  it("stale Out cannot close the next session", async () => { await postAttendance(request("check_in")); const stale = request("check_out"); await postAttendance(request("check_out")); await postAttendance(request("check_in")); expect((await postAttendance(stale)).status).toBe(409); expect(rows[0].workSessions).toHaveLength(2); expect(rows[0].workSessions[1].endedAt).toBeNull(); });
  it("stale End Break cannot end the next break", async () => { await postAttendance(request("check_in")); await postAttendance(request("break_start")); const stale = request("break_end"); await postAttendance(request("break_end")); await postAttendance(request("break_start")); expect((await postAttendance(stale)).status).toBe(409); expect(rows[0].breakSessions[1].endedAt).toBeNull(); });
  it("Out closes both active work and break at exactly the same server time", async () => { await postAttendance(request("check_in")); vi.setSystemTime(new Date("2026-09-14T14:00:00+06:00")); await postAttendance(request("break_start")); vi.setSystemTime(new Date("2026-09-14T14:45:08+06:00")); const response = await postAttendance(request("check_out")); expect(response.status).toBe(200); expect(rows[0].workSessions[0].endedAt).toEqual(new Date()); expect(rows[0].breakSessions[0].endedAt).toEqual(new Date()); });
  it("auto-closes a forgotten Out at exactly 7:30 PM without granting overtime", async () => {
    await postAttendance(request("check_in"));
    vi.setSystemTime(new Date("2026-09-15T00:30:00+06:00"));
    const get = await getAttendance();
    expect(await get.json()).toMatchObject({ snapshot: null, active: false, onBreak: false });
    expect(rows[0]).toMatchObject({
      checkOutAt: new Date("2026-09-14T19:30:00+06:00"), workingMinutes: 539,
    });
    expect(rows[0].workSessions[0]).toMatchObject({
      endedAt: new Date("2026-09-14T19:30:00+06:00"), endReason: "auto_cutoff_19_30",
    });
    expect(mocks.tx.managementAuditLog.create).toHaveBeenCalledTimes(1);
  });
  it("does not auto-close even one second before the 7:30 PM cutoff", async () => {
    await postAttendance(request("check_in"));
    vi.setSystemTime(new Date("2026-09-14T19:29:59+06:00"));
    expect((await (await getAttendance()).json()).snapshot).toMatchObject({ active: true });
    expect(rows[0].workSessions[0].endedAt).toBeNull();
    expect(mocks.tx.managementAuditLog.create).not.toHaveBeenCalled();
  });
  it("rejects a new Check In at or after the hard cutoff", async () => {
    vi.setSystemTime(new Date("2026-09-14T19:30:00+06:00"));
    const response = await postAttendance(request("check_in"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: "Check In is closed after the 7:30 PM attendance cutoff." });
    expect(rows).toHaveLength(0);
  });
  it("auto-closes an open break once and remains idempotent on later syncs", async () => {
    await postAttendance(request("check_in"));
    vi.setSystemTime(new Date("2026-09-14T14:00:00+06:00"));
    await postAttendance(request("break_start"));
    vi.setSystemTime(new Date("2026-09-14T19:30:01+06:00"));
    await getAttendance();
    const cutoff = new Date("2026-09-14T19:30:00+06:00");
    expect(rows[0].workSessions[0]).toMatchObject({ endedAt: cutoff, endReason: "auto_cutoff_19_30" });
    expect(rows[0].breakSessions[0]).toMatchObject({ endedAt: cutoff, endReason: "auto_cutoff_19_30" });
    expect(mocks.tx.managementAuditLog.create).toHaveBeenCalledTimes(1);
    await getAttendance();
    expect(mocks.tx.managementAuditLog.create).toHaveBeenCalledTimes(1);
  });
  it("prevents a second open day even if today's closed record already exists", async () => { const yesterday = record("2026-09-13"); yesterday.workSessions = [session("2026-09-13T20:00:00+06:00")]; rows.push(yesterday, record()); expect((await postAttendance(request("check_in"))).status).toBe(409); expect(rows[1].workSessions).toHaveLength(0); });
  it("does not rewrite closed historical attendance", async () => { const old = record("2026-09-13"); old.workSessions = [session("2026-09-13T10:00:00+06:00", "2026-09-13T19:00:00+06:00")]; rows.push(old); expect((await postAttendance(request("check_out", { attendanceDate: "2026-09-13" }))).status).toBe(409); expect(mocks.tx.attendanceRecord.update).not.toHaveBeenCalled(); });
  it("rejects privileged details and shutdown actions", async () => { expect((await postAttendance(request("update_details"))).status).toBe(403); expect((await postAttendance(request("check_out", { endReason: "device_shutdown" }))).status).toBe(403); });
  it.each(["null", "42", '"text"', "[]", "{"])("rejects malformed body %s with JSON 400", async body => { const response = await postAttendance(new Request("http://localhost:3000/api/dashboard/attendance", { method: "POST", body })); expect(response.status).toBe(400); });
});
