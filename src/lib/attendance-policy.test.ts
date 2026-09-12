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
