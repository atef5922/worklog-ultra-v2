import "server-only";
import {pauseUserTaskTimers} from "@/lib/task-timer-service";
import { assertNoOtherAttendanceOverlap } from "@/lib/attendance-overlap";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { AccessError, audit, checkDashboardActionOrigin, freshActor } from "@/lib/management/server";
import { toDateOnly } from "@/lib/utils";
import { attendanceActionSchema, attendanceClientTimeError, attendanceTransitionError } from "@/lib/attendance-action-validation";
import { attendanceInclude, attendanceRevision, serializeAttendanceRecord, syncAttendanceSummary, type AttendanceRecordWithSessions } from "@/lib/attendance-record";
import { attendanceAutoCutoffAt, autoCloseAttendanceForUser } from "@/lib/attendance-cutoff";

const continuationSchema = z.object({
  expectedUserId: z.string().uuid(),
  attendanceDate: z.iso.date(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** A confirmed one-hour continuation is stored on the record, never in browser state. */
export async function continueAttendance(request: Request) {
  try {
    checkDashboardActionOrigin(request);
    const { user } = await getServerAuthContext();
    if (!user) return apiError("Authentication required.", 401);
    const parsed = continuationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.expectedUserId !== user.id) return apiError("Refresh attendance and try again.", 400);
    const now = new Date();
    await autoCloseAttendanceForUser(user.id, now);
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      await freshActor(tx, user.id);
      const record = await tx.attendanceRecord.findUnique({
        where: { userId_attendanceDate: { userId: user.id, attendanceDate: new Date(parsed.data.attendanceDate) } },
        include: attendanceInclude,
      });
      if (!record || parsed.data.attendanceDate !== toDateOnly(now) ||
          attendanceRevision(record) !== parsed.data.expectedRevision ||
          record.workSessions.filter(session => !session.endedAt).length !== 1) {
        throw new AccessError("Attendance changed. Refresh and try again.", 409);
      }
      const cutoff = attendanceAutoCutoffAt(record.attendanceDate, record.cutoffExtendedUntil);
      const reminderAt = new Date(cutoff.getTime() - 15 * 60_000);
      const latest = new Date(`${parsed.data.attendanceDate}T23:30:00+06:00`);
      if (now < reminderAt || now >= cutoff || cutoff >= latest) {
        throw new AccessError("Continue work during the reminder window before the cutoff.", 409);
      }
      const next = new Date(Math.min(cutoff.getTime() + 60 * 60_000, latest.getTime()));
      const updated = await tx.attendanceRecord.update({
        where: { id: record.id }, data: { cutoffExtendedUntil: next }, include: attendanceInclude,
      });
      await audit(tx, user.id, user.id, "attendance.continued_work", record, updated,
        `Employee confirmed continued work until ${next.toISOString()}.`);
      return { snapshot: serializeAttendanceRecord(updated, now), serverNow: now.toISOString(),
        message: "Work continuation confirmed. Check Out when you finish." };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 });
    return apiSuccess({ ...result, userId: user.id });
  } catch (error) { return failure(error); }
}

const AUTO_RECONCILIATION_REASON = "Automatically closed an earlier open attendance day at the next recorded office entry boundary.";

function firstWorkStart(record: AttendanceRecordWithSessions) {
  return record.workSessions[0]?.startedAt ?? null;
}

/**
 * Legacy/concurrent data can contain open sessions on more than one attendance day.
 * While the employee row is locked, retain the newest requested day and close each
 * older day exactly where the following day's first office entry begins. This
 * removes overlap without inventing a 7 PM or midnight checkout.
 */
async function reconcileEarlierOpenDays(
  tx: Prisma.TransactionClient,
  actorId: string,
  records: AttendanceRecordWithSessions[],
  requestedRecordId: string,
  now: Date,
) {
  if (records.length <= 1) return 0;
  const ordered = [...records].sort((left, right) =>
    left.attendanceDate.getTime() - right.attendanceDate.getTime() ||
    (firstWorkStart(left)?.getTime() ?? Infinity) - (firstWorkStart(right)?.getTime() ?? Infinity) ||
    left.id.localeCompare(right.id));
  if (ordered.at(-1)?.id !== requestedRecordId) {
    throw new AccessError("A newer attendance day is already open. Refresh before taking another action.", 409);
  }

  for (let index = 0; index < ordered.length - 1; index++) {
    const record = ordered[index], boundary = firstWorkStart(ordered[index + 1]);
    const openWork = record.workSessions.filter(session => !session.endedAt);
    const openBreak = record.breakSessions.filter(session => !session.endedAt);
    if (!boundary || boundary > now || openWork.length !== 1 || openBreak.length > 1 ||
        openWork[0].startedAt > boundary) {
      throw new AccessError("Attendance has conflicting sessions. Ask an authorized reviewer to correct it.", 409);
    }
    const transitionError = attendanceTransitionError("check_out", record, boundary);
    if (transitionError) throw new AccessError(transitionError, 409);

    if (openBreak[0]) {
      await tx.attendanceBreakSession.update({
        where: { id: openBreak[0].id },
        data: { endedAt: boundary, endReason: "reconciled_next_entry" },
      });
    }
    await tx.attendanceWorkSession.update({
      where: { id: openWork[0].id },
      data: { endedAt: boundary, endReason: "reconciled_next_entry" },
    });
    const updated = await syncAttendanceSummary(tx, record.id, now);
    await audit(tx, actorId, actorId, "attendance.auto_reconciled", record, updated, AUTO_RECONCILIATION_REASON);
  }
  return ordered.length - 1;
}

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
    await autoCloseAttendanceForUser(user.id, now);
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
    checkDashboardActionOrigin(request);
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
    await autoCloseAttendanceForUser(user.id, new Date());

    const result = await db.$transaction(async tx => {
      // Lock the employee before reading ANY day's records, including the first In of a new day.
      // Record-only locks cannot prevent two open sessions on different attendance dates.
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      await freshActor(tx, user.id);
      const openRecords = await tx.attendanceRecord.findMany({
        where: { userId: user.id, workSessions: { some: { endedAt: null } } },
        orderBy: [{ attendanceDate: "asc" }, { id: "asc" }], include: attendanceInclude,
      });
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
      if (input.action === "check_in" && now >= attendanceAutoCutoffAt(today)) {
        throw new AccessError("Check In is closed after the 7:30 PM attendance cutoff.", 409);
      }
      if (openRecords.length > 1 && record) {
        await reconcileEarlierOpenDays(tx, user.id, openRecords, record.id, now);
      }
      const retainedOpenRecord = openRecords.at(-1);
      if (retainedOpenRecord && retainedOpenRecord.id !== record?.id) {
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
      if (input.action === "break_start" || input.action === "check_out") await pauseUserTaskTimers(tx, user.id, now, input.action);
      const saved = await syncAttendanceSummary(tx, record.id, now);
      return { snapshot: serializeAttendanceRecord(saved, now), message, serverNow: now.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 });
    return apiSuccess({ ...result, userId: user.id, record: result.snapshot });
  } catch (error) { return failure(error); }
}
