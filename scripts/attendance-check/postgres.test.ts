import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: async () => ({ user: authContext.getStore() ?? null }) }));
// Hard fail rather than ever use a developer/production database URL.
vi.mock("@/lib/db", async () => {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (process.env.WORKLOG_ISOLATED_ATTENDANCE_TEST !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/worklog_attendance_isolated_test" || url.username !== "attendance_test") throw new Error("Isolated database runner required.");
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  return { db: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) }) };
});
import { db } from "@/lib/db";
import { postAttendance } from "@/lib/attendance-service";
import { PUT } from "@/app/api/management/attendance/route";
import { actorInclude, type Actor } from "@/lib/management/server";
import { attendanceInclude, attendanceRevision } from "@/lib/attendance-record";

const authContext = new AsyncLocalStorage<Actor>();
const d = (value: string) => new Date(value);
let employee: Actor, manager: Actor;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(d("2026-09-14T13:00:00+06:00"));
  employee = await db.user.create({ data: { name: "Synthetic Employee", email: `${randomUUID()}@example.invalid`, passwordHash: "not-a-login", role: "employee" }, include: actorInclude });
  manager = await db.user.create({ data: { name: "Synthetic Reviewer", email: `${randomUUID()}@example.invalid`, passwordHash: "not-a-login", role: "super_admin" }, include: actorInclude });
});
afterEach(() => vi.useRealTimers());
afterAll(() => db.$disconnect());
async function seed(date: string, intervals: Array<[string, string | null]>) {
  return db.attendanceRecord.create({ data: { userId: employee.id, attendanceDate: d(date), status: "present",
    workSessions: { create: intervals.map(([start, end]) => ({ startedAt: d(start), endedAt: end ? d(end) : null, clientEventId: randomUUID() })) } }, include: attendanceInclude });
}
const reread = (id: string) => db.attendanceRecord.findUniqueOrThrow({ where: { id }, include: attendanceInclude });
function action(action: string, record: Awaited<ReturnType<typeof seed>> | null = null, expectedUserId = employee.id) {
  return new Request("http://localhost:3000/api/dashboard/attendance", { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ action, expectedUserId, expectedRevision: record ? attendanceRevision(record) : null, attendanceDate: record?.attendanceDate.toISOString().slice(0,10) ?? "2026-09-14", eventId: randomUUID() }) });
}
function correction(record: Awaited<ReturnType<typeof seed>>, intervals: Array<[string, string]>, closeOpenSessions = false) {
  return new Request("http://localhost:3000/api/management/attendance", { method: "PUT", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ recordId: record.id, updatedAt: record.updatedAt.toISOString(), expectedRevision: attendanceRevision(record), reason: "Synthetic regression: verified office entry/exit evidence.", closeOpenSessions,
      legacyBreakMinutes: 0, workSessions: intervals.map(([startedAt, endedAt], i) => ({ id: record.workSessions[i].id, startedAt, endedAt })), breakSessions: [] }) });
}
const post = (request: Request) => authContext.run(employee, () => postAttendance(request));
const correct = (request: Request) => authContext.run(manager, () => PUT(request));

describe("real PostgreSQL attendance invariants (synthetic isolated data)", () => {
  it("serializes simultaneous first In and rejects the stale request", async () => {
    const results = await Promise.all([post(action("check_in")), post(action("check_in"))]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
    expect(await db.attendanceWorkSession.count({ where: { attendanceRecord: { userId: employee.id } } })).toBe(1);
  });
  it("locks across different dates so concurrent corrections cannot introduce double-counted time", async () => {
    const yesterday = await seed("2026-09-13", [["2026-09-13T18:00:00+06:00", "2026-09-13T19:00:00+06:00"]]);
    const today = await seed("2026-09-14", [["2026-09-14T12:00:00+06:00", "2026-09-14T13:00:00+06:00"]]);
    const results = await Promise.all([
      correct(correction(yesterday, [["2026-09-13T18:00:00+06:00", "2026-09-14T11:00:00+06:00"]])),
      correct(correction(today, [["2026-09-14T10:00:00+06:00", "2026-09-14T13:00:00+06:00"]])),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
    const a = await reread(yesterday.id), b = await reread(today.id);
    expect(a.workSessions[0].endedAt!.getTime()).toBeLessThanOrEqual(b.workSessions[0].startedAt.getTime());
    expect(await db.managementAuditLog.count({where:{targetId:employee.id}})).toBe(1);
  });
  it("serializes correction versus employee In without silently applying both stale snapshots", async () => {
    const row = await seed("2026-09-14", [["2026-09-14T10:00:00+06:00", "2026-09-14T11:00:00+06:00"]]);
    const results = await Promise.all([post(action("check_in", row)), correct(correction(row, [["2026-09-14T10:00:00+06:00", "2026-09-14T12:00:00+06:00"]]))]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
  });
  it("explicitly repairs multiple open sessions, retains the audit, and permits a later In", async () => {
    const row = await seed("2026-09-14", [["2026-09-14T10:00:00+06:00", null], ["2026-09-14T11:00:00+06:00", null]]);
    expect((await post(action("check_out", row))).status).toBe(409);
    const response = await correct(correction(row, [["2026-09-14T10:00:00+06:00", "2026-09-14T11:00:00+06:00"], ["2026-09-14T11:00:00+06:00", "2026-09-14T12:00:00+06:00"]], true));
    expect(response.status).toBe(200);
    const saved = await reread(row.id);
    expect(saved.workSessions.every(s => s.endedAt !== null)).toBe(true);
    const audit = await db.managementAuditLog.findFirstOrThrow({where:{targetId:employee.id}});
    expect(JSON.stringify(audit.beforeValue)).toContain('"endedAt":null');
    expect((await post(action("check_in", saved))).status).toBe(200);
  });
  it("recovers multiple open attendance days by closing the older day at the next entry boundary", async () => {
    const old = await seed("2026-09-13", [["2026-09-13T18:00:00+06:00", null]]);
    const today = await seed("2026-09-14", [["2026-09-14T10:00:00+06:00", null]]);
    expect((await post(action("check_out", today))).status).toBe(409);
    expect((await correct(correction(old, [["2026-09-13T18:00:00+06:00", "2026-09-14T10:00:00+06:00"]], true))).status).toBe(200);
    expect((await post(action("check_out", today))).status).toBe(200);
  });
  it("rejects an account-switched first In without writing either account's attendance", async () => {
    const response = await authContext.run(manager, () => postAttendance(action("check_in", null, employee.id)));
    expect(response.status).toBe(409);
    expect(await db.attendanceRecord.count({where:{userId:{in:[employee.id,manager.id]}}})).toBe(0);
  });
  it("preserves authorization: an employee cannot use the recovery endpoint", async () => {
    const row = await seed("2026-09-14", [["2026-09-14T10:00:00+06:00", null]]);
    expect((await authContext.run(employee, () => PUT(correction(row, [["2026-09-14T10:00:00+06:00", "2026-09-14T12:00:00+06:00"]], true)))).status).toBe(403);
    expect((await reread(row.id)).workSessions[0].endedAt).toBeNull();
  });
  it("accepts zero-duration evidence with UUID ordering that puts the open session first", async () => {
    const row = await db.attendanceRecord.create({data:{userId:employee.id,attendanceDate:d("2026-09-14"),status:"present",workSessions:{create:[
      {id:"ffffffff-ffff-4fff-8fff-ffffffffffff",startedAt:d("2026-09-14T10:00:00+06:00"),endedAt:d("2026-09-14T10:00:00+06:00")},
      {id:"00000000-0000-4000-8000-000000000001",startedAt:d("2026-09-14T10:00:00+06:00")},
    ]}},include:attendanceInclude});
    expect(row.workSessions[0].endedAt).toBeNull();
    expect((await post(action("check_out",row))).status).toBe(200);
    expect((await reread(row.id)).workingMinutes).toBe(180);
  });
  it("allows explicitly granted HR recovery only within the assigned employee scope", async () => {
    const department = await db.department.create({data:{name:"Synthetic department "+randomUUID()}});
    await db.user.update({where:{id:employee.id},data:{departmentId:department.id}});
    const hr = await db.user.create({data:{name:"Synthetic HR",email:randomUUID()+"@example.invalid",passwordHash:"not-a-login",role:"admin",managementEnabled:true,
      permissions:{create:{permissionKey:"attendance.correct",isGranted:true,grantedBy:manager.id}},
      accessScopes:{create:{scopeType:"departments",departmentId:department.id,grantedBy:manager.id}},
    },include:actorInclude});
    const row = await seed("2026-09-14",[["2026-09-14T10:00:00+06:00",null]]);
    expect((await authContext.run(hr,()=>PUT(correction(row,[["2026-09-14T10:00:00+06:00","2026-09-14T12:00:00+06:00"]],true)))).status).toBe(200);
    await db.user.update({where:{id:employee.id},data:{departmentId:null}});
    const current = await reread(row.id);
    expect((await authContext.run(hr,()=>PUT(correction(current,[["2026-09-14T10:00:00+06:00","2026-09-14T11:00:00+06:00"]])))).status).toBe(403);
  });
  it("rolls back session changes if the mandatory audit write fails", async () => {
    const row = await seed("2026-09-14", [["2026-09-14T10:00:00+06:00", "2026-09-14T11:00:00+06:00"]]);
    await db.$executeRawUnsafe("CREATE FUNCTION reject_synthetic_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END; $$");
    await db.$executeRawUnsafe("CREATE TRIGGER reject_synthetic_audit BEFORE INSERT ON management_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_synthetic_audit()");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await correct(correction(row, [["2026-09-14T10:00:00+06:00", "2026-09-14T12:00:00+06:00"]]))).status).toBe(500);
      expect(attendanceRevision(await reread(row.id))).toBe(attendanceRevision(row));
      expect(await db.managementAuditLog.count({where:{targetId:employee.id}})).toBe(0);
    } finally {
      log.mockRestore();
      await db.$executeRawUnsafe("DROP TRIGGER reject_synthetic_audit ON management_audit_logs");
      await db.$executeRawUnsafe("DROP FUNCTION reject_synthetic_audit()");
    }
  });
});
