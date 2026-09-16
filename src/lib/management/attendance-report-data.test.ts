import { describe, expect, it } from "vitest";
import { buildAttendanceReport, summarizeAttendance, type AttendanceReportRow } from "./attendance-report-data";

const row = (date: string, employeeId: string, status: string, options: Partial<AttendanceReportRow> = {}) => ({
  date, employeeId, employeeName: employeeId === "a" ? "Alice" : "Bob",
  department: employeeId === "a" ? "IT" : "Sales", team: "No team",
  dayKind: "workday", status, flags: [], firstIn: ["absent", "not_checked_in", "off_day"].includes(status) ? null : new Date(`${date}T04:00:00Z`),
  countedMinutes: 540, overtimeMinutes: 0, ...options,
}) as AttendanceReportRow;

describe("attendance report aggregation", () => {
  const rows = [
    row("2026-09-16", "a", "checked_out"),
    row("2026-09-17", "a", "checked_out", { flags: ["late"], countedMinutes: 480, overtimeMinutes: 30 }),
    row("2026-09-18", "a", "off_day", { dayKind: "off", countedMinutes: 0 }),
    row("2026-09-19", "a", "absent", { countedMinutes: 0 }),
    row("2026-09-20", "a", "not_checked_in", { countedMinutes: 0 }),
    row("2026-09-16", "b", "checked_out", { countedMinutes: 480 }),
  ];

  it("counts Late inside Present, excludes off/pending days, and computes average and rate", () => {
    expect(summarizeAttendance(rows.filter(item => item.employeeId === "a"))).toMatchObject({
      workdays: 3, present: 2, late: 1, absent: 1, offDays: 1,
      totalWorkMinutes: 1020, avgWorkdayMinutes: 510, overtimeMinutes: 30,
      attendanceRate: 2 / 3,
    });
  });

  it("chooses employee/day detail automatically and company monthly summary by default", () => {
    const data = { from: "2026-09-16", to: "2026-09-20", rows } as Parameters<typeof buildAttendanceReport>[0];
    const company = buildAttendanceReport(data, new URLSearchParams());
    expect(company.mode).toBe("group");
    expect(company.includeDaily).toBe(false);
    expect(company.employees.map(item => [item.employeeName, item.present])).toEqual([["Alice", 2], ["Bob", 1]]);
    expect(buildAttendanceReport(data, new URLSearchParams({ userId: "a" })).includeDaily).toBe(true);
    expect(buildAttendanceReport({ ...data, to: data.from }, new URLSearchParams()).mode).toBe("daily");
  });
});
