import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeScope } from "@/lib/auth/policy";
import { authenticate, freshActor, checkOrigin, audit, fail, AccessError } from "@/lib/management/server";
import { validateAttendanceCorrection } from "@/lib/management/attendance-validation";
import { assertNoOtherAttendanceOverlap } from "@/lib/attendance-overlap";
import { attendanceInclude, attendanceRevision, syncAttendanceSummary } from "@/lib/attendance-record";
import { toDateOnly } from "@/lib/utils";

const interval = z.object({
  id: z.string().uuid().optional(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
});
const schema = z.object({
  recordId: z.string().uuid(),
  updatedAt: z.string().datetime({ offset: true }),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(1000),
  closeOpenSessions: z.boolean().default(false),
  workSessions: z.array(interval).min(1).max(50),
  breakSessions: z.array(interval).max(50),
  legacyBreakMinutes: z.number().int().nonnegative().max(1440),
});

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const actor = await authenticate("attendance.correct");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AccessError(parsed.error.issues[0]?.message ?? "Invalid correction.", 400);
    const input = parsed.data;
    const result = await db.$transaction(async tx => {
      // Discover the scoped target only; never use this pre-lock snapshot for validation or writes.
      const target = await tx.attendanceRecord.findFirst({
        where: { id: input.recordId, user: employeeScope(actor, "attendance.correct") }, select: { userId: true },
      });
      if (!target) throw new AccessError("Attendance correction is outside your access.");
      // All attendance writers lock the same employee first, then the record, across every date.
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${target.userId}::uuid FOR UPDATE`;
      const fresh = await freshActor(tx, actor.id);
      await tx.$queryRaw`SELECT id::text FROM attendance_records WHERE id=${input.recordId}::uuid FOR UPDATE`;
      const record = await tx.attendanceRecord.findFirst({
        where: { id: input.recordId, userId: target.userId, user: employeeScope(fresh, "attendance.correct") },
        include: attendanceInclude,
      });
      if (!record) throw new AccessError("Attendance correction is outside your access.");
      if (record.userId === actor.id && fresh.role !== "super_admin") throw new AccessError("Your own attendance requires another authorized reviewer.");
      if (record.updatedAt.toISOString() !== input.updatedAt || attendanceRevision(record) !== input.expectedRevision) {
        throw new AccessError("Attendance changed. Refresh before correcting.", 409);
      }
      const hasOpen = [...record.workSessions, ...record.breakSessions].some(s => !s.endedAt);
      if (hasOpen && !input.closeOpenSessions) throw new AccessError("Confirm that this correction will close all open sessions on this record.", 409);
      const now = new Date();
      const error = validateAttendanceCorrection(toDateOnly(record.attendanceDate), input.workSessions, input.breakSessions, input.legacyBreakMinutes, now);
      if (error) throw new AccessError(error, 400);
      // Preserve identities and all original values in the audit; never silently discard evidence.
      for (const [old, next] of [[record.workSessions, input.workSessions], [record.breakSessions, input.breakSessions]] as const) {
        const ids = next.flatMap(s => s.id ? [s.id] : []);
        if (new Set(ids).size !== ids.length || old.some(s => !ids.includes(s.id)) || ids.some(id => !old.some(s => s.id === id))) {
          throw new AccessError("Retain all existing session IDs; add sessions separately.", 400);
        }
      }
      await assertNoOtherAttendanceOverlap(tx, record.userId, record.id, input.workSessions.map(s => ({
        startedAt: new Date(s.startedAt), endedAt: new Date(s.endedAt),
      })));
      for (const s of input.workSessions) {
        const data = { startedAt: new Date(s.startedAt), endedAt: new Date(s.endedAt), endReason: "corrected" };
        if (s.id) await tx.attendanceWorkSession.update({ where: { id: s.id }, data });
        else await tx.attendanceWorkSession.create({ data: { ...data, attendanceRecordId: record.id } });
      }
      for (const s of input.breakSessions) {
        const data = { startedAt: new Date(s.startedAt), endedAt: new Date(s.endedAt), endReason: "corrected" };
        if (s.id) await tx.attendanceBreakSession.update({ where: { id: s.id }, data });
        else await tx.attendanceBreakSession.create({ data: { ...data, attendanceRecordId: record.id } });
      }
      await tx.attendanceRecord.update({ where: { id: record.id }, data: { legacyBreakMinutes: input.legacyBreakMinutes } });
      const updated = await syncAttendanceSummary(tx, record.id, now);
      await audit(tx, actor.id, record.userId, "attendance.corrected", record, updated, input.reason);
      return updated;
    }, { isolationLevel: "ReadCommitted" });
    return NextResponse.json({
      message: "Attendance corrected; the original values are preserved in the audit log.",
      record: result, revision: attendanceRevision(result),
    });
  } catch (error) { return fail(error); }
}
