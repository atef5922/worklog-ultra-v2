import { z } from "zod";

export type AttendanceAction = "check_in" | "check_out" | "break_start" | "break_end";
type Session = { startedAt: Date; endedAt: Date | null };
type RecordSessions = { workSessions: Session[]; breakSessions: Session[] };

export function isAttendanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const attendanceActionSchema = z.object({
  action: z.enum(["check_in", "check_out", "break_start", "break_end"]),
  attendanceDate: z.string().refine(isAttendanceDate, "Provide a valid attendance date."),
  expectedUserId: z.string().uuid(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  eventId: z.string().trim().min(8).max(200),
  // Kept only to reject stale/forged requests from old clients; never used as the recorded time.
  occurredAt: z.string().datetime({ offset: true }).optional(),
  endReason: z.literal("manual").optional(),
});

export function attendanceClientTimeError(value: string | undefined, now: Date) {
  if (value === undefined) return null;
  const time = new Date(value).getTime();
  return !Number.isFinite(time) || Math.abs(time - now.getTime()) > 90_000
    ? "Attendance uses server time. Backdated or future actions are not allowed; refresh and try again."
    : null;
}

/** Reject invalid transitions instead of silently fabricating a session or repairing old evidence. */
export function attendanceTransitionError(action: AttendanceAction, record: RecordSessions | null, now: Date) {
  if (!record) return action === "check_in" ? null : "Check In first.";
  const compare = (a: Session, b: Session) => a.startedAt.getTime() - b.startedAt.getTime() ||
    (a.endedAt?.getTime() ?? Infinity) - (b.endedAt?.getTime() ?? Infinity);
  const work = [...record.workSessions].sort(compare);
  const breaks = [...record.breakSessions].sort(compare);
  const openWork = work.filter(s => !s.endedAt), openBreaks = breaks.filter(s => !s.endedAt);
  if (openWork.length > 1 || openBreaks.length > 1) return "Attendance has conflicting sessions. Ask an authorized reviewer to correct it.";
  for (const sessions of [work, breaks]) {
    let previousEnd = -Infinity;
    for (let index = 0; index < sessions.length; index++) {
      const session = sessions[index], end = session.endedAt ?? now;
      if (!Number.isFinite(session.startedAt.getTime()) || !Number.isFinite(end.getTime()) ||
          end < session.startedAt || end > now || session.startedAt > now) {
        return "Attendance events are out of order. Refresh or ask an authorized reviewer to correct the record.";
      }
      if (end.getTime() === session.startedAt.getTime()) continue;
      if (session.startedAt.getTime() < previousEnd) return "Attendance events are out of order. Refresh or ask an authorized reviewer to correct the record.";
      previousEnd = end.getTime();
    }
  }
  if (breaks.some(b => !work.some(w => w.startedAt <= b.startedAt &&
      (w.endedAt ?? now) >= (b.endedAt ?? now) && (b.endedAt !== null || w.endedAt === null)))) {
    return "Breaks must remain inside a checked-in session. Ask an authorized reviewer to correct the record.";
  }
  if (action === "check_in") return openWork.length ? "You are already checked in. Refresh attendance." : null;
  if (!openWork.length) return "Check In before using this action.";
  if (action === "break_start" && openBreaks.length) return "Break is already running. Refresh attendance.";
  if (action === "break_end" && !openBreaks.length) return "No active break was found. Refresh attendance.";
  return null;
}
