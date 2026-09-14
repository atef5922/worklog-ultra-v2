import "server-only";
import { assertNoOtherAttendanceOverlap } from "@/lib/attendance-overlap";
import { Prisma } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { AccessError, checkOrigin, freshActor } from "@/lib/management/server";
import { toDateOnly } from "@/lib/utils";
import { attendanceActionSchema, attendanceClientTimeError, attendanceTransitionError } from "@/lib/attendance-action-validation";
import { attendanceInclude, attendanceRevision, serializeAttendanceRecord, syncAttendanceSummary } from "@/lib/attendance-record";

function failure(error: unknown) {
  if (error instanceof AccessError) return apiError(error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
    return apiError("Attendance changed at the same time. Refresh and try again.", 409);
  }
  console.error("Attendance request failed", error);
  return apiError("Attendance could not be updated. Please try again.", 500);
}

/** Open overnight sessions take precedence over today's closed/missing record; reads never auto-stop them. */
export async function getAttendance() {
  try {
    const { user } = await getServerAuthContext();
    if (!user) return apiError("Authentication required.", 401);
    const now = new Date();
    const open = await db.attendanceRecord.findFirst({
      where: { userId: user.id, workSessions: { some: { endedAt: null } } },
      orderBy: { attendanceDate: "desc" }, include: attendanceInclude,
    });
    const record = open ?? await db.attendanceRecord.findUnique({
      where: { userId_attendanceDate: { userId: user.id, attendanceDate: new Date(toDateOnly(now)) } },
      include: attendanceInclude,
    });
    const snapshot = record ? serializeAttendanceRecord(record, now) : null;
    return apiSuccess({ userId: user.id, serverNow: now.toISOString(), snapshot,
      active: snapshot?.active ?? false, onBreak: snapshot?.onBreak ?? false,
      checkInAt: snapshot?.checkInAt ?? null, checkOutAt: snapshot?.checkOutAt ?? null });
  } catch (error) { return failure(error); }
}

export async function postAttendance(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await getServerAuthContext();
    if (!user) return apiError("Authentication required.", 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return apiError("Invalid attendance action.");
    if (body?.action === "update_details") return apiError("Employees can only record attendance actions.", 403);
    if (body?.endReason && body.endReason !== "manual") return apiError("Attendance can only be checked out manually.", 403);
    if (body && (!("expectedRevision" in body) || !("expectedUserId" in body))) return apiError("Attendance controls were updated. Refresh before trying again.", 409);
    const parsed = attendanceActionSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid attendance action.");
    const input = parsed.data;
    if (input.expectedUserId !== user.id) return apiError("Your session changed. Please sign in again.", 409);

    const result = await db.$transaction(async tx => {
      // Lock the employee before reading ANY day's records, including the first In of a new day.
      // Record-only locks cannot prevent two open sessions on different attendance dates.
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      await freshActor(tx, user.id);
      const openRecords = await tx.attendanceRecord.findMany({
        where: { userId: user.id, workSessions: { some: { endedAt: null } } }, include: attendanceInclude,
      });
      if (openRecords.length > 1) throw new AccessError("Attendance has multiple open days. Ask an authorized reviewer to correct it.", 409);
      let record = await tx.attendanceRecord.findUnique({
        where: { userId_attendanceDate: { userId: user.id, attendanceDate: new Date(input.attendanceDate) } },
        include: attendanceInclude,
      });
      if (record) {
        await tx.$queryRaw`SELECT id::text FROM attendance_records WHERE id=${record.id}::uuid FOR UPDATE`;
        // A management correction may have committed while waiting for this lock.
        record = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: record.id }, include: attendanceInclude });
      }
      const now = new Date(), today = toDateOnly(now);
      const timeError = attendanceClientTimeError(input.occurredAt, now);
      if (timeError) throw new AccessError(timeError, 400);
      if (input.action === "check_in" && input.attendanceDate !== today) throw new AccessError("Check In must be recorded for today.", 400);
      if (openRecords[0] && openRecords[0].id !== record?.id) {
        throw new AccessError("Another attendance day is still checked in. Refresh and check Out from that session first.", 409);
      }
      if (input.attendanceDate !== today && !record?.workSessions.some(s => !s.endedAt)) {
        throw new AccessError("Closed historical attendance cannot be changed with In, Out or Break. Request an authorized correction.", 409);
      }
      if ((record ? attendanceRevision(record) : null) !== input.expectedRevision) {
        throw new AccessError("Attendance changed in another request or tab. Refresh and try again.", 409);
      }
      const transitionError = attendanceTransitionError(input.action, record, now);
      if (transitionError) throw new AccessError(transitionError, 409);
      if (record && [...record.workSessions, ...record.breakSessions].some(s => s.clientEventId === input.eventId)) {
        throw new AccessError("This attendance action was already received. Refresh before taking another action.", 409);
      }
      if (input.action === "check_in") await assertNoOtherAttendanceOverlap(tx, user.id, record?.id ?? null, [{ startedAt: now, endedAt: null }]);
      if (!record) {
        record = await tx.attendanceRecord.create({
          data: { userId: user.id, attendanceDate: new Date(today), status: "present", note: null }, include: attendanceInclude,
        });
      }
      const openWork = record.workSessions.find(s => !s.endedAt);
      const openBreak = record.breakSessions.find(s => !s.endedAt);
      let message: string;
      switch (input.action) {
        case "check_in":
          await tx.attendanceWorkSession.create({ data: { attendanceRecordId: record.id, startedAt: now, clientEventId: input.eventId } });
          message = record.workSessions.length ? "Checked in again." : "Checked in successfully.";
          break;
        case "break_start":
          await tx.attendanceBreakSession.create({ data: { attendanceRecordId: record.id, startedAt: now, clientEventId: input.eventId } });
          message = "Break started.";
          break;
        case "break_end":
          await tx.attendanceBreakSession.update({ where: { id: openBreak!.id }, data: { endedAt: now, endReason: "manual" } });
          message = "Break ended. Work resumed.";
          break;
        case "check_out":
          if (openBreak) await tx.attendanceBreakSession.update({ where: { id: openBreak.id }, data: { endedAt: now, endReason: "manual" } });
          await tx.attendanceWorkSession.update({ where: { id: openWork!.id }, data: { endedAt: now, endReason: "manual" } });
          message = "Checked out successfully. You can check in again.";
          break;
      }
      const saved = await syncAttendanceSummary(tx, record.id, now);
      return { snapshot: serializeAttendanceRecord(saved, now), message, serverNow: now.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return apiSuccess({ ...result, userId: user.id, record: result.snapshot });
  } catch (error) { return failure(error); }
}
