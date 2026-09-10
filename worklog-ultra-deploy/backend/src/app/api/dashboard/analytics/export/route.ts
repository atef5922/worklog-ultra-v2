import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { roleUiTitle } from "@/lib/auth/roles";
import { requireAdminOrManager } from "@/lib/auth/server";
import { db } from "@/lib/db";
import {
  calculateDailyRate,
  calculateHourlyRate,
  calculateOvertimeMinutes,
  calculateWeeklyRate,
  calculateWorkValue,
} from "@/lib/utils";

function csvEscape(value: string | number) {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET() {
  const user = await requireAdminOrManager();
  const from = startOfDay(subDays(new Date(), 29));
  const to = endOfDay(new Date());

  const [users, tasks, reports] = await Promise.all([
    db.user.findMany({
      where:
        user.role === UserRole.manager && user.departmentId
          ? { departmentId: user.departmentId }
          : undefined,
      include: { department: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.dailyTask.findMany({
      where: {
        planDate: {
          gte: from,
          lte: to,
        },
        ...(user.role === UserRole.manager && user.departmentId ? { departmentId: user.departmentId } : {}),
      },
      include: { user: true },
    }),
    db.dailyTaskUpdate.findMany({
      where: {
        reportDate: {
          gte: from,
          lte: to,
        },
        dailyTask:
          user.role === UserRole.manager && user.departmentId
            ? { departmentId: user.departmentId }
            : undefined,
      },
      include: {
        dailyTask: {
          include: {
            user: true,
          },
        },
      },
    }),
  ]);

  const rows = users.map((employee) => {
    const monthlySalary = Number(employee.monthlySalary ?? 0);
    const expectedDailyHours = Number(employee.expectedDailyHours ?? 8);
    const employeeTasks = tasks.filter((task) => task.userId === employee.id);
    const employeeReports = reports.filter((report) => report.dailyTask.userId === employee.id);
    const totalTrackedMinutes = employeeReports.reduce((sum, report) => sum + report.trackedMinutes, 0);
    const totalCompletion = employeeReports.reduce((sum, report) => sum + report.completionPercent, 0);
    const completedCount = employeeReports.filter((report) => report.status === "done").length;
    const averageCompletion = employeeReports.length ? Math.round(totalCompletion / employeeReports.length) : 0;
    const workValue = calculateWorkValue(totalTrackedMinutes, monthlySalary, expectedDailyHours);
    const overtimeMinutes = calculateOvertimeMinutes(totalTrackedMinutes, expectedDailyHours);
    const performanceMark = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          averageCompletion * 0.55 +
            completedCount * 4 +
            Math.min(totalTrackedMinutes / 60, expectedDailyHours * 6) * 3,
        ),
      ),
    );

    return {
      name: employee.name,
      role: roleUiTitle(employee.role),
      status: employee.isActive ? "Active" : "Inactive",
      department: employee.department?.name ?? "No department",
      monthlySalary,
      weeklySalary: calculateWeeklyRate(monthlySalary),
      dailySalary: calculateDailyRate(monthlySalary),
      hourlyRate: calculateHourlyRate(monthlySalary, expectedDailyHours),
      tasksPlanned: employeeTasks.length,
      reportsSubmitted: employeeReports.length,
      completedReports: completedCount,
      trackedMinutes: totalTrackedMinutes,
      trackedHours: (totalTrackedMinutes / 60).toFixed(2),
      overtimeMinutes,
      workValue: workValue.toFixed(2),
      averageCompletion,
      performanceMark,
    };
  });

  const header = [
    "Name",
    "Role",
    "Status",
    "Department",
    "Monthly Salary",
    "Weekly Salary",
    "Daily Salary",
    "Hourly Rate",
    "Tasks Planned",
    "Reports Submitted",
    "Completed Reports",
    "Tracked Minutes",
    "Tracked Hours",
    "Overtime Minutes",
    "Work Value",
    "Average Completion",
    "Performance Mark",
  ];

  const csv = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.role,
        row.status,
        row.department,
        row.monthlySalary,
        row.weeklySalary.toFixed(2),
        row.dailySalary.toFixed(2),
        row.hourlyRate.toFixed(2),
        row.tasksPlanned,
        row.reportsSubmitted,
        row.completedReports,
        row.trackedMinutes,
        row.trackedHours,
        row.overtimeMinutes,
        row.workValue,
        row.averageCompletion,
        row.performanceMark,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="worklog-analytics-${user.role}.csv"`,
    },
  });
}
