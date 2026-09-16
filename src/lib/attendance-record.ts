import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import { embedAttendanceOvertimeMeta } from "@/lib/attendance-overtime";
import { toDateOnly } from "@/lib/utils";

export const attendanceInclude = {
  workSessions: { orderBy: [{ startedAt: "asc" as const }, { id: "asc" as const }] },
  breakSessions: { orderBy: [{ startedAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.AttendanceRecordInclude;

export type AttendanceRecordWithSessions = Prisma.AttendanceRecordGetPayload<{ include: typeof attendanceInclude }>;

export function measureAttendanceRecord(record: AttendanceRecordWithSessions, now = new Date()) {
  return calculateSegmentedAttendanceMetrics({
    attendanceDate: toDateOnly(record.attendanceDate), workSessions: record.workSessions,
    breakSessions: record.breakSessions, legacyBreakMinutes: record.legacyBreakMinutes, now,
  });
}

/** Includes session identity/times so two actions in the same millisecond still have different versions. */
export function attendanceRevision(record: AttendanceRecordWithSessions) {
  const sessions = (items: AttendanceRecordWithSessions["workSessions"]) => [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [item.id, item.startedAt.toISOString(), item.endedAt?.toISOString() ?? null, item.endReason]);
  return createHash("sha256").update(JSON.stringify([
    record.id, record.updatedAt.toISOString(), record.legacyBreakMinutes, record.status,
    record.cutoffExtendedUntil?.toISOString() ?? null,
    sessions(record.workSessions), sessions(record.breakSessions),
  ])).digest("hex");
}

export function serializeAttendanceRecord(record: AttendanceRecordWithSessions, now = new Date()) {
  const openSession = record.workSessions.find(session => !session.endedAt) ?? null;
  const openBreak = record.breakSessions.find(session => !session.endedAt) ?? null;
  const sessions = (items: AttendanceRecordWithSessions["workSessions"]) => items.map(session => ({
    id: session.id, startedAt: session.startedAt.toISOString(), endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason,
  }));
  return {
    id: record.id, revision: attendanceRevision(record), attendanceDate: toDateOnly(record.attendanceDate),
    status: record.status, note: record.note ?? "",
    cutoffExtendedUntil: record.cutoffExtendedUntil?.toISOString() ?? null,
    checkInAt: record.checkInAt?.toISOString() ?? null, checkOutAt: record.checkOutAt?.toISOString() ?? null,
    active: Boolean(openSession), onBreak: Boolean(openSession && openBreak),
    currentSessionStartedAt: openSession?.startedAt.toISOString() ?? null,
    currentBreakStartedAt: openSession ? openBreak?.startedAt.toISOString() ?? null : null,
    legacyBreakMinutes: record.legacyBreakMinutes,
    workSessions: sessions(record.workSessions), breakSessions: sessions(record.breakSessions),
    ...measureAttendanceRecord(record, now),
  };
}

export async function syncAttendanceSummary(transaction: Prisma.TransactionClient, recordId: string, now: Date) {
  const record = await transaction.attendanceRecord.findUniqueOrThrow({ where: { id: recordId }, include: attendanceInclude });
  const metrics = measureAttendanceRecord(record, now);
  const openSession = record.workSessions.find(session => !session.endedAt);
  const latest = [...record.workSessions].filter(session => session.endedAt)
    .sort((a, b) => b.endedAt!.getTime() - a.endedAt!.getTime())[0];
  const checkOutAt = openSession ? null : latest?.endedAt ?? null;
  const note = embedAttendanceOvertimeMeta(record.note ?? "", {
    overtimeMinutes: metrics.overtimeMinutes,
    actualCheckOutAt: checkOutAt && metrics.overtimeMinutes > 0 ? checkOutAt.toISOString() : null,
    autoClosedAt: null,
  });
  return transaction.attendanceRecord.update({ where: { id: recordId }, data: {
    checkInAt: record.workSessions[0]?.startedAt ?? null, checkOutAt,
    breakMinutes: metrics.breakMinutes, workingMinutes: metrics.workingMinutes, note: note || null,
  }, include: attendanceInclude });
}
