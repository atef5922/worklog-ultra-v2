export const ATTENDANCE_TIME_ZONE = "Asia/Dhaka";
export const ATTENDANCE_SHIFT_START_HOUR = 10;
export const ATTENDANCE_SHIFT_END_HOUR = 19;
export const ATTENDANCE_SCHEDULED_MINUTES = 9 * 60;
export const ATTENDANCE_INCLUDED_BREAK_MINUTES = 45;
export const ATTENDANCE_AUTO_CUTOFF_HOUR = 19;
export const ATTENDANCE_AUTO_CUTOFF_MINUTE = 30;
export const ATTENDANCE_AUTO_CUTOFF_END_REASON = "auto_cutoff_19_30";
export const ATTENDANCE_EXTENDED_CUTOFF_END_REASON = "auto_cutoff_extended";

export type AttendanceInterval = {
  startedAt: Date | string;
  endedAt?: Date | string | null;
  endReason?: string | null;
};

type AttendanceCalculationInput = {
  attendanceDate: string;
  checkInAt?: Date | string | null;
  checkOutAt?: Date | string | null;
  breakMinutes?: number | null;
  now?: Date;
};

type SegmentedAttendanceCalculationInput = {
  attendanceDate: string;
  workSessions: AttendanceInterval[];
  breakSessions?: AttendanceInterval[];
  legacyBreakMinutes?: number | null;
  now?: Date;
};

type MillisecondInterval = {
  start: number;
  end: number;
};

function validDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dhakaBoundary(attendanceDate: string, hour: number) {
  return new Date(`${attendanceDate}T${String(hour).padStart(2, "0")}:00:00+06:00`);
}

function minutes(milliseconds: number) {
  return Math.max(0, Math.floor(milliseconds / 60_000));
}

function normalizeIntervals(intervals: AttendanceInterval[], now: Date) {
  const nowMs = now.getTime();
  const normalized = intervals
    .map((interval) => {
      const start = validDate(interval.startedAt)?.getTime();
      const explicitEnd = validDate(interval.endedAt)?.getTime();
      if (!Number.isFinite(start)) return null;
      if (interval.endedAt != null && !Number.isFinite(explicitEnd)) return null;
      const end = Number.isFinite(explicitEnd) ? Math.min(explicitEnd as number, nowMs) : nowMs;
      if (end <= (start as number)) return null;
      return { start: start as number, end };
    })
    .filter((interval): interval is MillisecondInterval => Boolean(interval))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: MillisecondInterval[] = [];
  for (const interval of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function intersectIntervals(left: MillisecondInterval[], right: MillisecondInterval[]) {
  const result: MillisecondInterval[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start), end = Math.min(left[i].end, right[j].end);
    if (end > start) result.push({ start, end });
    if (left[i].end <= right[j].end) i++; else j++;
  }
  return result;
}

function totalDuration(intervals: MillisecondInterval[]) {
  return intervals.reduce((total, interval) => total + interval.end - interval.start, 0);
}

function durationAfter(intervals: MillisecondInterval[], boundary: number) {
  return intervals.reduce(
    (total, interval) => total + Math.max(0, interval.end - Math.max(interval.start, boundary)),
    0,
  );
}

/**
 * Multiple office entries/exits are measured as independent work sessions.
 * The first 45 minutes of explicit break remain credited; time outside between
 * an Out and the next In is always excluded. Overtime is actual active time
 * after 7 PM, so neither breaks nor outside gaps inflate it.
 */
export function calculateSegmentedAttendanceMetrics(input: SegmentedAttendanceCalculationInput) {
  const now = validDate(input.now) ?? new Date();
  const shiftEnd = dhakaBoundary(input.attendanceDate, ATTENDANCE_SHIFT_END_HOUR).getTime();
  // A safety cutoff proves only that the session was left open. Keep 7:30 PM
  // as the audited checkout, but never turn the unverified buffer into pay time.
  const countableSessions = input.workSessions.map((session) => {
    if (![ATTENDANCE_AUTO_CUTOFF_END_REASON, ATTENDANCE_EXTENDED_CUTOFF_END_REASON].includes(session.endReason ?? "") || !Number.isFinite(shiftEnd)) return session;
    const end = validDate(session.endedAt);
    return end && end.getTime() > shiftEnd ? { ...session, endedAt: new Date(shiftEnd) } : session;
  });
  const workSessions = normalizeIntervals(countableSessions, now);
  // Invalid/legacy break fragments outside office sessions never deduct outside time twice.
  const breakSessions = intersectIntervals(normalizeIntervals(input.breakSessions ?? [], now), workSessions);
  const legacy = Number(input.legacyBreakMinutes ?? 0);
  const legacyBreakMs = (Number.isFinite(legacy) ? Math.max(0, Math.round(legacy)) : 0) * 60_000;
  const sessionMs = totalDuration(workSessions);
  const breakMs = workSessions.length ? legacyBreakMs + totalDuration(breakSessions) : 0;
  const includedMs = Math.min(breakMs, ATTENDANCE_INCLUDED_BREAK_MINUTES * 60_000);
  const excessMs = Math.max(0, breakMs - includedMs);
  const presenceMs = workSessions.length ? workSessions.at(-1)!.end - workSessions[0].start : 0;
  const workingMs = Math.max(0, sessionMs - excessMs);
  const activeMs = Math.max(0, sessionMs - breakMs);
  const overtimeMs = Number.isFinite(shiftEnd) ? Math.max(0,
    durationAfter(workSessions, shiftEnd) - durationAfter(breakSessions, shiftEnd)) : 0;

  // Calculate from exact durations before rounding once; no credit for unfinished minutes.
  return {
    presenceMinutes: minutes(presenceMs),
    sessionMinutes: minutes(sessionMs),
    activeMinutes: minutes(activeMs),
    outsideMinutes: minutes(Math.max(0, presenceMs - sessionMs)),
    workingMinutes: minutes(workingMs),
    workingSeconds: Math.floor(workingMs / 1000),
    shortfallMinutes: Math.max(0, ATTENDANCE_SCHEDULED_MINUTES - minutes(workingMs)),
    breakMinutes: minutes(breakMs),
    includedBreakMinutes: minutes(includedMs),
    excessBreakMinutes: minutes(excessMs),
    overtimeMinutes: minutes(overtimeMs),
  };
}

/** Legacy single-session calculation retained for old exports and safe fallback. */
export function calculateAttendanceMetrics(input: AttendanceCalculationInput) {
  const checkInAt = validDate(input.checkInAt);
  const explicitCheckOutAt = validDate(input.checkOutAt);
  const calculationEnd = explicitCheckOutAt ?? validDate(input.now) ?? new Date();
  const rawBreakMinutes = Number(input.breakMinutes ?? 0);
  const breakMinutes = Number.isFinite(rawBreakMinutes) ? Math.max(0, Math.round(rawBreakMinutes)) : 0;
  const includedBreakMinutes = Math.min(breakMinutes, ATTENDANCE_INCLUDED_BREAK_MINUTES);
  const excessBreakMinutes = Math.max(0, breakMinutes - ATTENDANCE_INCLUDED_BREAK_MINUTES);

  if (!checkInAt || calculationEnd <= checkInAt) {
    return {
      presenceMinutes: 0,
      workingMinutes: 0,
      breakMinutes,
      includedBreakMinutes,
      excessBreakMinutes,
      overtimeMinutes: 0,
    };
  }

  const presenceMinutes = minutes(calculationEnd.getTime() - checkInAt.getTime());
  const shiftEnd = dhakaBoundary(input.attendanceDate, ATTENDANCE_SHIFT_END_HOUR);
  const overtimeStart = new Date(Math.max(checkInAt.getTime(), shiftEnd.getTime()));
  const overtimeMinutes = calculationEnd > overtimeStart
    ? minutes(calculationEnd.getTime() - overtimeStart.getTime())
    : 0;

  return {
    presenceMinutes,
    workingMinutes: Math.max(0, presenceMinutes - excessBreakMinutes),
    breakMinutes,
    includedBreakMinutes,
    excessBreakMinutes,
    overtimeMinutes,
  };
}
