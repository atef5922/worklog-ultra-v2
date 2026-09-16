import type { attendanceOverview } from "@/lib/management/attendance-overview";

type AttendanceData = Awaited<ReturnType<typeof attendanceOverview>>;
export type AttendanceReportRow = AttendanceData["rows"][number];

export type EmployeeAttendanceSummary = {
  employeeId: string;
  employeeName: string;
  department: string;
  team: string;
  workdays: number;
  present: number;
  late: number;
  absent: number;
  offDays: number;
  offDayWorked: number;
  totalWorkMinutes: number;
  avgWorkdayMinutes: number;
  overtimeMinutes: number;
  attendanceRate: number | null;
};

export function summarizeAttendance(rows: AttendanceReportRow[], employeeId = ""): EmployeeAttendanceSummary {
  const workdays = rows.filter(row => row.dayKind === "workday" &&
    row.status !== "scheduled" && row.status !== "not_checked_in");
  const present = workdays.filter(row => row.firstIn);
  const absent = workdays.filter(row => row.status === "absent").length;
  const workdayMinutes = present.reduce((sum, row) => sum + row.countedMinutes, 0);
  const first = rows[0];
  return {
    employeeId,
    employeeName: first?.employeeName ?? "",
    department: first?.department ?? "",
    team: first?.team ?? "",
    workdays: workdays.length,
    present: present.length,
    late: present.filter(row => row.flags.includes("late")).length,
    absent,
    offDays: rows.filter(row => row.dayKind !== "workday" && !row.firstIn).length,
    offDayWorked: rows.filter(row => row.dayKind !== "workday" && row.firstIn).length,
    totalWorkMinutes: rows.reduce((sum, row) => sum + row.countedMinutes, 0),
    avgWorkdayMinutes: present.length ? Math.round(workdayMinutes / present.length) : 0,
    overtimeMinutes: rows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
    attendanceRate: workdays.length ? present.length / workdays.length : null,
  };
}

export function buildAttendanceReport(data: AttendanceData, params: URLSearchParams) {
  const byEmployee = new Map<string, AttendanceReportRow[]>();
  for (const row of data.rows) {
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }
  const employees = [...byEmployee].map(([id, rows]) => summarizeAttendance(rows, id))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.employeeId.localeCompare(b.employeeId));
  const singleDay = data.from === data.to;
  const individual = Boolean(params.get("userId"));
  return {
    mode: singleDay ? "daily" as const : individual ? "individual" as const : "group" as const,
    includeDaily: singleDay || individual || params.get("detail") === "1",
    employees,
    overall: summarizeAttendance(data.rows),
    rows: data.rows,
  };
}
