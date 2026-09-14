import { describe, expect, it } from "vitest";
import { attendanceActionSchema, attendanceClientTimeError, attendanceTransitionError, isAttendanceDate } from "./attendance-action-validation";
const now = new Date("2026-09-14T12:00:00+06:00");
const s = (start: string, end: string | null = null) => ({ startedAt: new Date(`2026-09-14T${start}+06:00`), endedAt: end ? new Date(`2026-09-14T${end}+06:00`) : null });
const record = (workSessions = [s("10:00:00")], breakSessions: ReturnType<typeof s>[] = []) => ({ workSessions, breakSessions });
describe("attendance transition validation", () => {
  it("accepts tied zero-duration work and break sessions regardless of database ID order", () => {
    for (const reverse of [false, true]) {
      const work = [s("10:00:00"), s("10:00:00", "10:00:00")];
      const breaks = [s("11:00:00"), s("11:00:00", "11:00:00")];
      expect(attendanceTransitionError("check_out", record(reverse ? work.reverse() : work, reverse ? breaks.reverse() : breaks), now)).toBeNull();
    }
  });
  it.each(["2026-02-30", "2026-13-14", "2026-00-01", "invalid", "2026-9-14"])("rejects impossible calendar dates: %s", value => expect(isAttendanceDate(value)).toBe(false));
  it("accepts leap-day only in leap years", () => { expect(isAttendanceDate("2024-02-29")).toBe(true); expect(isAttendanceDate("2026-02-29")).toBe(false); });
  it.each(["check_out", "break_start", "break_end"] as const)("requires In before %s", action => expect(attendanceTransitionError(action, null, now)).toMatch(/Check In/));
  it("allows first In and a later same-day In", () => { expect(attendanceTransitionError("check_in", null, now)).toBeNull(); expect(attendanceTransitionError("check_in", record([s("10:00:00", "11:00:00")]), now)).toBeNull(); });
  it("does not open a second work session", () => expect(attendanceTransitionError("check_in", record(), now)).toMatch(/already checked in/));
  it("rejects a new break while a break is running", () => expect(attendanceTransitionError("break_start", record(undefined, [s("11:00:00")]), now)).toMatch(/already running/));
  it("rejects ending a nonexistent break", () => expect(attendanceTransitionError("break_end", record(), now)).toMatch(/No active break/));
  it("allows Out during a valid break", () => expect(attendanceTransitionError("check_out", record(undefined, [s("11:00:00")]), now)).toBeNull());
  it("rejects a break beginning before In", () => expect(attendanceTransitionError("break_end", record(undefined, [s("09:59:00")]), now)).toMatch(/inside/));
  it("rejects overlapping work sessions", () => expect(attendanceTransitionError("check_out", record([s("10:00:00", "11:00:00"), s("10:30:00")]), now)).toMatch(/out of order/));
  it("rejects two open work sessions", () => expect(attendanceTransitionError("check_out", record([s("10:00:00"), s("11:00:00")]), now)).toMatch(/conflicting/));
  it("rejects old future-dated events rather than extending them", () => expect(attendanceTransitionError("check_out", record([s("12:01:00")]), now)).toMatch(/out of order/));
  it("permits a genuinely zero-duration session without generating negative time", () => expect(attendanceTransitionError("check_in", record([s("12:00:00", "12:00:00")]), now)).toBeNull());
  it("rejects backdated/future client times, while accepting omitted time", () => {
    expect(attendanceClientTimeError(undefined, now)).toBeNull();
    expect(attendanceClientTimeError("2026-09-14T11:59:00+06:00", now)).toBeNull();
    expect(attendanceClientTimeError("2026-09-13T12:00:00+06:00", now)).toMatch(/server time/);
    expect(attendanceClientTimeError("2026-09-14T12:02:00+06:00", now)).toMatch(/server time/);
  });
  it("requires a version precondition and rejects device shutdown writes", () => {
    const body = { action: "check_in", attendanceDate: "2026-09-14", eventId: "check-in-test", expectedUserId: "11111111-1111-4111-8111-111111111111" };
    expect(attendanceActionSchema.safeParse(body).success).toBe(false);
    expect(attendanceActionSchema.safeParse({ ...body, expectedRevision: null }).success).toBe(true);
    expect(attendanceActionSchema.safeParse({ ...body, expectedRevision: null, endReason: "device_shutdown" }).success).toBe(false);
  });
});
