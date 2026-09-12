export const ATTENDANCE_TIME_ZONE = "Asia/Dhaka";
export const ATTENDANCE_SHIFT_START_HOUR = 10;
export const ATTENDANCE_SHIFT_END_HOUR = 19;
export const ATTENDANCE_SCHEDULED_MINUTES = 9 * 60;
export const ATTENDANCE_INCLUDED_BREAK_MINUTES = 45;

export type AttendanceInterval = {
  startedAt: Date | string;
  endedAt?: Date | string | null;
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
  return Math.max(0, Math.round(milliseconds / 60_000));
}

function normalizeIntervals(intervals: AttendanceInterval[], now: Date) {
  const nowMs = now.getTime();
  const normalized = intervals
    .map((interval) => {
      const start = validDate(interval.startedAt)?.getTime();
      const explicitEnd = validDate(interval.endedAt)?.getTime();
      if (!Number.isFinite(start)) return null;
      const end = Number.isFinite(explicitEnd) ? explicitEnd as number : nowMs;
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
  const workSessions = normalizeIntervals(input.workSessions, now);
  const breakSessions = normalizeIntervals(input.breakSessions ?? [], now);
  const legacyBreakMinutes = Math.max(0, Math.round(Number(input.legacyBreakMinutes ?? 0) || 0));
  const segmentedBreakMilliseconds = totalDuration(breakSessions);
  const segmentedBreakMinutes = minutes(segmentedBreakMilliseconds);
  const breakMinutes = legacyBreakMinutes + segmentedBreakMinutes;
  const includedBreakMinutes = Math.min(breakMinutes, ATTENDANCE_INCLUDED_BREAK_MINUTES);
  const excessBreakMinutes = Math.max(0, breakMinutes - ATTENDANCE_INCLUDED_BREAK_MINUTES);
  const sessionMilliseconds = totalDuration(workSessions);
  const sessionMinutes = minutes(sessionMilliseconds);

  if (!workSessions.length) {
    return {
      presenceMinutes: 0,
      sessionMinutes: 0,
      activeMinutes: 0,
      outsideMinutes: 0,
      workingMinutes: 0,
      shortfallMinutes: ATTENDANCE_SCHEDULED_MINUTES,
      breakMinutes,
      includedBreakMinutes,
      excessBreakMinutes,
      overtimeMinutes: 0,
    };
  }

  const firstStartedAt = workSessions[0].start;
  const lastEndedAt = workSessions[workSessions.length - 1].end;
  const presenceMinutes = minutes(lastEndedAt - firstStartedAt);
  const outsideMinutes = Math.max(0, presenceMinutes - sessionMinutes);
  const activeMinutes = Math.max(0, sessionMinutes - breakMinutes);
  const workingMinutes = Math.max(0, sessionMinutes - excessBreakMinutes);
  const shiftEnd = dhakaBoundary(input.attendanceDate, ATTENDANCE_SHIFT_END_HOUR).getTime();
  const overtimeMilliseconds = Math.max(
    0,
    durationAfter(workSessions, shiftEnd) - durationAfter(breakSessions, shiftEnd),
  );
  const overtimeMinutes = minutes(overtimeMilliseconds);

  return {
    presenceMinutes,
    sessionMinutes,
    activeMinutes,
    outsideMinutes,
    workingMinutes,
    shortfallMinutes: Math.max(0, ATTENDANCE_SCHEDULED_MINUTES - workingMinutes),
    breakMinutes,
    includedBreakMinutes,
    excessBreakMinutes,
    overtimeMinutes,
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