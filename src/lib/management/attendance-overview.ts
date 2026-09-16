import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canViewAttendanceDetails, employeeScope, type AccessActor } from "@/lib/auth/policy";
import { ATTENDANCE_AUTO_CUTOFF_END_REASON, ATTENDANCE_EXTENDED_CUTOFF_END_REASON, calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import { attendanceAutoCutoffAt } from "@/lib/attendance-cutoff";
import { toDateOnly } from "@/lib/utils";
import { AccessError } from "@/lib/management/server";
import { dateRange } from "@/lib/management/records";

export const ATTENDANCE_ROW_STATUSES = [
  "checked_in", "on_break", "checked_out", "auto_out", "not_checked_in",
  "absent", "off_day", "leave", "worked_off_day", "scheduled", "pending_auto_close",
] as const;
export const ATTENDANCE_ATTENTION = ["late", "auto_out", "pending_auto_close", "excess_break", "overtime", "absent", "worked_off_day"] as const;
export type AttendanceRowStatus = typeof ATTENDANCE_ROW_STATUSES[number];
export type AttendanceDayKind = "workday" | "off" | "leave";
export type DayOverride = {
  attendanceDate: Date;
  subjectKey: string;
  kind: string;
  reason: string;
};

export function attendanceDayKind(
  day: string,
  employeeId: string,
  departmentId: string | null,
  overrides: Map<string, DayOverride>,
): { kind: AttendanceDayKind; reason: string | null } {
  const override = overrides.get(`${day}:employee:${employeeId}`) ??
    (departmentId ? overrides.get(`${day}:department:${departmentId}`) : null) ??
    overrides.get(`${day}:company`);
  if (override && ["workday", "off", "leave"].includes(override.kind)) {
    return { kind: override.kind as AttendanceDayKind, reason: override.reason };
  }
  return { kind: new Date(`${day}T00:00:00Z`).getUTCDay() === 5 ? "off" : "workday", reason: null };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function attendanceOverview(actor: AccessActor, params: URLSearchParams) {
  if (!canViewAttendanceDetails(actor)) throw new AccessError("Management attendance access has not been granted.");
  const { from, to } = dateRange(params);
  const dayCount = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  if (dayCount > 93) throw new AccessError("Choose up to 93 days for the attendance view or export.", 400);
  const departmentId = params.get("departmentId") ?? "";
  const teamId = params.get("teamId") ?? "";
  const userId = params.get("userId") ?? "";
  for (const id of [departmentId, teamId, userId]) if (id && !uuid.test(id)) throw new AccessError("Invalid attendance filter.", 400);
  const status = params.get("status") ?? "";
  const attention = params.get("attention") ?? "";
  if (status && !ATTENDANCE_ROW_STATUSES.includes(status as AttendanceRowStatus)) throw new AccessError("Invalid attendance status.", 400);
  if (attention && !ATTENDANCE_ATTENTION.includes(attention as typeof ATTENDANCE_ATTENTION[number])) throw new AccessError("Invalid attention filter.", 400);
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const where: Prisma.UserWhereInput = {
    AND: [
      employeeScope(actor, "employees.view"),
      employeeScope(actor, "attendance.view"),
    ],
  };
  const people = await db.user.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 5001,
    select: {
      id: true, name: true, email: true, isActive: true, createdAt: true, departmentId: true, teamId: true,
      department: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });
  if (people.length > 5000) throw new AccessError("Narrow the employee scope before opening attendance.", 400);
  const departments = [...new Map(people.flatMap(person => person.department ? [[person.department.id, person.department] as const] : [])).values()];
  const teams = [...new Map(people.flatMap(person => person.team ? [[person.team.id, person.team] as const] : [])).values()];
  const selected = people.filter(person =>
    (!departmentId || person.departmentId === departmentId) &&
    (!teamId || person.teamId === teamId) &&
    (!userId || person.id === userId) &&
    (!q || `${person.name} ${person.email}`.toLowerCase().includes(q.toLowerCase())));
  if (selected.length * dayCount > 20_000) throw new AccessError("Too many employee-days. Narrow the dates or department.", 400);
  const ids = selected.map(person => person.id);
  const overrideKeys = [
    ...(selected.length ? ["company"] : []),
    ...new Set(selected.flatMap(person => person.departmentId ? [`department:${person.departmentId}`] : [])),
    ...ids.map(id => `employee:${id}`),
  ];
  const [records, overrides] = await Promise.all([
    ids.length ? db.attendanceRecord.findMany({
      where: { userId: { in: ids }, attendanceDate: { gte: new Date(from), lte: new Date(to) } },
      include: {
        workSessions: { orderBy: { startedAt: "asc" } },
        breakSessions: { orderBy: { startedAt: "asc" } },
      },
    }) : [],
    db.attendanceDayOverride.findMany({
      where: { attendanceDate: { gte: new Date(from), lte: new Date(to) }, subjectKey: { in: overrideKeys } },
      select: { attendanceDate: true, subjectKey: true, kind: true, reason: true },
    }),
  ]);
  const byRecord = new Map(records.map(record => [`${toDateOnly(record.attendanceDate)}:${record.userId}`, record]));
  const byOverride = new Map(overrides.map(override => [`${toDateOnly(override.attendanceDate)}:${override.subjectKey}`, override]));
  const now = new Date(), today = toDateOnly(now);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(Date.parse(to) - index * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
  const allRows = days.flatMap(day => selected.flatMap(person => {
    if (day < toDateOnly(person.createdAt)) return [];
    const schedule = attendanceDayKind(day, person.id, person.departmentId, byOverride);
    const record = byRecord.get(`${day}:${person.id}`);
    if (!person.isActive && !record) return [];
    const workSessions = record?.workSessions ?? [];
    const breakSessions = record?.breakSessions ?? [];
    const firstIn = workSessions[0]?.startedAt ?? null;
    const lastOut = workSessions.at(-1)?.endedAt ?? null;
    const open = workSessions.some(session => !session.endedAt);
    const cutoff = attendanceAutoCutoffAt(day, record?.cutoffExtendedUntil);
    const pendingAutoClose = open && now >= cutoff &&
      workSessions.some(session => !session.endedAt && session.startedAt <= cutoff);
    const active = open && !pendingAutoClose;
    const onBreak = active && breakSessions.some(session => !session.endedAt);
    const autoOut = workSessions.some(session => [ATTENDANCE_AUTO_CUTOFF_END_REASON, ATTENDANCE_EXTENDED_CUTOFF_END_REASON].includes(session.endReason ?? ""));
    const autoReason = record?.cutoffExtendedUntil && record.cutoffExtendedUntil > attendanceAutoCutoffAt(day)
      ? ATTENDANCE_EXTENDED_CUTOFF_END_REASON : ATTENDANCE_AUTO_CUTOFF_END_REASON;
    const projectedWorkSessions = pendingAutoClose
      ? workSessions.map(session => !session.endedAt && session.startedAt <= cutoff
        ? { ...session, endedAt: cutoff, endReason: autoReason }
        : session)
      : workSessions;
    const metrics = record ? calculateSegmentedAttendanceMetrics({
      attendanceDate: day, workSessions: projectedWorkSessions, breakSessions,
      legacyBreakMinutes: record.legacyBreakMinutes, now: pendingAutoClose ? cutoff : now,
    }) : null;
    const late = schedule.kind === "workday" && !!firstIn && firstIn > new Date(`${day}T10:00:00+06:00`);
    const workedOffDay = schedule.kind !== "workday" && !!firstIn;
    const rowStatus: AttendanceRowStatus = workedOffDay ? "worked_off_day" :
      pendingAutoClose ? "pending_auto_close" :
      active ? onBreak ? "on_break" : "checked_in" :
      firstIn ? autoOut ? "auto_out" : "checked_out" :
      schedule.kind === "leave" ? "leave" :
      schedule.kind === "off" ? "off_day" :
      day > today ? "scheduled" : day === today && now < attendanceAutoCutoffAt(day)
        ? "not_checked_in" : "absent";
    const flags = [
      late ? "late" : null,
      autoOut ? "auto_out" : null,
      pendingAutoClose ? "pending_auto_close" : null,
      metrics?.excessBreakMinutes ? "excess_break" : null,
      metrics?.overtimeMinutes ? "overtime" : null,
      rowStatus === "absent" ? "absent" : null,
      workedOffDay ? "worked_off_day" : null,
    ].filter((value): value is string => !!value);
    return [{
      date: day, employeeId: person.id, employeeName: person.name,
      departmentId: person.departmentId, department: person.department?.name ?? "No department",
      team: person.team?.name ?? "No team",
      dayKind: schedule.kind, dayReason: schedule.reason,
      status: rowStatus, flags, firstIn, lastOut, active, onBreak,
      countedMinutes: metrics?.workingMinutes ?? 0,
      activeMinutes: metrics?.activeMinutes ?? 0,
      breakMinutes: metrics?.breakMinutes ?? 0,
      outsideMinutes: metrics?.outsideMinutes ?? 0,
      overtimeMinutes: workedOffDay ? 0 : metrics?.overtimeMinutes ?? 0,
      offDayWorkMinutes: workedOffDay ? metrics?.workingMinutes ?? 0 : 0,
      workSessions, breakSessions,
    }];
  }));
  const rows = allRows.filter(row => (!status || row.status === status) && (!attention || row.flags.includes(attention)));
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount);
  return {
    from, to, rows, pageRows: rows.slice((currentPage - 1) * 50, currentPage * 50),
    page: currentPage, pageCount, people, departments, teams, dayOverrides: overrides,
    total: rows.length,
    totals: {
      recorded: rows.filter(row => !!row.firstIn).length,
      checkedIn: rows.filter(row => row.active).length,
      absent: rows.filter(row => row.status === "absent").length,
      late: rows.filter(row => row.flags.includes("late")).length,
      autoOut: rows.filter(row => row.flags.includes("auto_out")).length,
      offDayWork: rows.filter(row => row.flags.includes("worked_off_day")).length,
      countedMinutes: rows.reduce((sum, row) => sum + row.countedMinutes, 0),
      overtimeMinutes: rows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
    },
  };
}
