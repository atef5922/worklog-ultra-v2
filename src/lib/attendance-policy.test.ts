import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_INCLUDED_BREAK_MINUTES,
  ATTENDANCE_SCHEDULED_MINUTES,
  calculateAttendanceMetrics,
  calculateSegmentedAttendanceMetrics,
} from "@/lib/attendance-policy";

const attendanceDate = "2026-09-12";

describe("calculateAttendanceMetrics", () => {
  it("credits all nine hours when the included break is 45 minutes", () => {
    const result = calculateAttendanceMetrics({
      attendanceDate,
      checkInAt: "2026-09-12T10:00:00+06:00",
      checkOutAt: "2026-09-12T19:00:00+06:00",
      breakMinutes: ATTENDANCE_INCLUDED_BREAK_MINUTES,
    });
    expect(result.presenceMinutes).toBe(ATTENDANCE_SCHEDULED_MINUTES);
    expect(result.workingMinutes).toBe(ATTENDANCE_SCHEDULED_MINUTES);
    expect(result.excessBreakMinutes).toBe(0);
    expect(result.overtimeMinutes).toBe(0);
  });

  it("deducts only the portion of break above 45 minutes", () => {
    const result = calculateAttendanceMetrics({
      attendanceDate,
      checkInAt: "2026-09-12T10:00:00+06:00",
      checkOutAt: "2026-09-12T19:00:00+06:00",
      breakMinutes: 75,
    });
    expect(result.includedBreakMinutes).toBe(45);
    expect(result.excessBreakMinutes).toBe(30);
    expect(result.workingMinutes).toBe(510);
  });

  it("does not auto-stop at 7 PM and reports post-shift overtime", () => {
    const result = calculateAttendanceMetrics({
      attendanceDate,
      checkInAt: "2026-09-12T10:00:00+06:00",
      checkOutAt: null,
      breakMinutes: 45,
      now: new Date("2026-09-12T20:15:00+06:00"),
    });
    expect(result.presenceMinutes).toBe(615);
    expect(result.workingMinutes).toBe(615);
    expect(result.overtimeMinutes).toBe(75);
  });

  it("counts a session starting after 7 PM as overtime", () => {
    const result = calculateAttendanceMetrics({
      attendanceDate,
      checkInAt: "2026-09-12T19:30:00+06:00",
      checkOutAt: "2026-09-12T20:00:00+06:00",
      breakMinutes: 0,
    });
    expect(result.workingMinutes).toBe(30);
    expect(result.overtimeMinutes).toBe(30);
  });

  it("never returns negative credited work", () => {
    const result = calculateAttendanceMetrics({
      attendanceDate,
      checkInAt: "2026-09-12T10:00:00+06:00",
      checkOutAt: "2026-09-12T10:10:00+06:00",
      breakMinutes: 600,
    });
    expect(result.workingMinutes).toBe(0);
  });
  it("deducts a one-hour Out-to-In gap but keeps the 45-minute lunch included", () => {
    const result = calculateSegmentedAttendanceMetrics({
      attendanceDate,
      workSessions: [
        { startedAt: "2026-09-12T10:00:00+06:00", endedAt: "2026-09-12T16:00:00+06:00" },
        { startedAt: "2026-09-12T17:00:00+06:00", endedAt: "2026-09-12T19:00:00+06:00" },
      ],
      breakSessions: [
        { startedAt: "2026-09-12T14:00:00+06:00", endedAt: "2026-09-12T14:45:00+06:00" },
      ],
    });

    expect(result.presenceMinutes).toBe(540);
    expect(result.sessionMinutes).toBe(480);
    expect(result.outsideMinutes).toBe(60);
    expect(result.activeMinutes).toBe(435);
    expect(result.workingMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(0);
  });

  it("adds only actual active post-7 PM time as overtime", () => {
    const result = calculateSegmentedAttendanceMetrics({
      attendanceDate,
      workSessions: [
        { startedAt: "2026-09-12T10:00:00+06:00", endedAt: "2026-09-12T16:00:00+06:00" },
        { startedAt: "2026-09-12T17:00:00+06:00", endedAt: "2026-09-12T20:00:00+06:00" },
      ],
      breakSessions: [
        { startedAt: "2026-09-12T14:00:00+06:00", endedAt: "2026-09-12T14:45:00+06:00" },
      ],
    });

    expect(result.outsideMinutes).toBe(60);
    expect(result.activeMinutes).toBe(495);
    expect(result.workingMinutes).toBe(540);
    expect(result.overtimeMinutes).toBe(60);
  });
});

describe("segmented attendance safety", () => {
  const day = "2026-09-14";
  const time = (clock: string) => day + "T" + clock + "+06:00";
  const s = (start: string, end: string | null) => ({ startedAt: time(start), endedAt: end ? time(end) : null });
  const calculate = (workSessions: { startedAt: string; endedAt: string | null }[], breakSessions: { startedAt: string; endedAt: string | null }[] = [], clock = "20:00:00") =>
    calculateSegmentedAttendanceMetrics({ attendanceDate: day, workSessions, breakSessions, now: new Date(time(clock)) });
  it("does not grant a rounded-up minute before it has elapsed", () => {
    expect(calculate([s("10:00:00", "10:00:59")]).workingMinutes).toBe(0);
    expect(calculate([s("10:00:00", "10:00:59")]).workingSeconds).toBe(59);
  });
  it("deducts excess break using exact duration before rounding", () => {
    const result = calculate([s("10:00:00", "19:00:00")], [s("14:00:00", "14:45:01")]);
    expect(result.workingSeconds).toBe(540 * 60 - 1);
    expect(result.workingMinutes).toBe(539);
  });
  it("uses one 45-minute allowance across multiple breaks and entries", () => {
    const result = calculate([s("10:00:00", "16:00:00"), s("17:00:00", "19:00:00")],
      [s("13:00:00", "13:30:00"), s("17:30:00", "18:00:00")]);
    expect(result).toMatchObject({ outsideMinutes: 60, breakMinutes: 60, includedBreakMinutes: 45, excessBreakMinutes: 15, workingMinutes: 465 });
  });
  it("does not deduct a break outside office presence a second time", () => {
    const result = calculate([s("10:00:00", "16:00:00"), s("17:00:00", "19:00:00")],
      [s("15:45:00", "17:15:00")]);
    expect(result).toMatchObject({ breakMinutes: 30, outsideMinutes: 60, workingMinutes: 480, activeMinutes: 450 });
  });
  it("merges overlapping legacy sessions instead of double counting", () => {
    expect(calculate([s("10:00:00", "12:00:00"), s("11:00:00", "13:00:00")],
      [s("11:00:00", "11:30:00"), s("11:15:00", "11:45:00")])).toMatchObject({ sessionMinutes: 180, breakMinutes: 45, workingMinutes: 180 });
  });
  it("never counts future work or future break timestamps", () => {
    expect(calculate([s("10:00:00", "19:00:00")], [s("14:00:00", "15:00:00")], "12:00:00")).toMatchObject({ workingMinutes: 120, breakMinutes: 0, overtimeMinutes: 0 });
  });
  it("ignores an invalid explicit end instead of treating it as an open session", () => {
    expect(calculate([{ startedAt: time("10:00:00"), endedAt: "invalid" }]).workingMinutes).toBe(0);
  });
  it("credits no break when there is no office session", () => {
    expect(calculate([], [s("10:00:00", "11:00:00")])).toMatchObject({ breakMinutes: 0, workingMinutes: 0, includedBreakMinutes: 0 });
  });
  it("excludes both post-shift break and outside gaps from overtime", () => {
    expect(calculate([s("10:00:00", "19:15:00"), s("19:30:00", "20:00:00")],
      [s("19:45:00", "20:00:00")])).toMatchObject({ overtimeMinutes: 30, outsideMinutes: 15 });
  });
});
