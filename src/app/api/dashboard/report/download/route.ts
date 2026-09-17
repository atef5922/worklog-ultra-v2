import { getServerAuthContext } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { dateRange, recordMetrics } from "@/lib/management/records";
import { exportResponse, type ReportSheet } from "@/lib/management/export";
import { fail, AccessError } from "@/lib/management/server";
import { buildReportSummary } from "@/lib/report-summary";
import { getHistoryData } from "@/lib/worklog";
import { formatDateInDhaka, formatMinutes } from "@/lib/utils";

export const runtime = "nodejs";

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function GET(request: Request) {
  try {
    const { user } = await getServerAuthContext();
    if (!user) throw new AccessError("Please sign in.", 401);
    const params = new URL(request.url).searchParams;
    const { from, to } = dateRange(params);
    const [tasks, attendance] = await Promise.all([
      getHistoryData(user.id, from, to),
      db.attendanceRecord.findMany({
        where: { userId: user.id, attendanceDate: { gte: new Date(from), lte: new Date(to) } },
        include: { workSessions: true, breakSessions: true },
        orderBy: { attendanceDate: "asc" },
      }),
    ]);
    const summary = buildReportSummary(tasks);
    const attendanceRows = attendance.map((record) => ({ record, metrics: recordMetrics(record) }));
    const excelSheets: ReportSheet[] = [
      {
        name: "Tasks",
        columns: ["Task", "Date", "Description", "Status", "Priority", "Tracked minutes", "Completion note"],
        rows: summary.items.map((task) => [task.title, formatDateInDhaka(task.date), task.description, task.status, task.priority, task.trackedMinutes, task.note]),
      },
      {
        name: "Attendance",
        columns: ["Date", "Actual minutes", "Counted minutes", "Break minutes", "Included break", "Extra break", "Outside minutes", "Overtime minutes"],
        rows: attendanceRows.map(({ record, metrics }) => [formatDateInDhaka(record.attendanceDate), metrics.activeMinutes, metrics.workingMinutes, metrics.breakMinutes, metrics.includedBreakMinutes, metrics.excessBreakMinutes, metrics.outsideMinutes, metrics.overtimeMinutes]),
      },
    ];
    const total = (key: "activeMinutes" | "workingMinutes" | "breakMinutes" | "excessBreakMinutes" | "outsideMinutes" | "overtimeMinutes") =>
      attendanceRows.reduce((sum, row) => sum + row.metrics[key], 0);
    const completed = summary.items.filter((task) => task.status === "done").length;
    const pending = summary.items.filter((task) => task.status === "pending").length;
    const inProgress = summary.items.length - completed - pending;
    return exportResponse(
      "Personal Work Report",
      excelSheets,
      params.get("format") ?? "xlsx",
      `worklog-personal-${from}-${to}`,
      {
        pdf: {
          subtitle: user.name + " - task and attendance record",
          period: `${formatDateInDhaka(from)} to ${formatDateInDhaka(to)}`,
          scope: "Personal report",
          metrics: [
            { label: "Planned tasks", value: summary.items.length, note: "Selected period" },
            { label: "Completed", value: completed, note: `${inProgress} in progress` },
            { label: "Pending", value: pending, note: "Not completed" },
            { label: "Task time", value: formatMinutes(summary.items.reduce((sum, task) => sum + task.trackedMinutes, 0)), note: "Saved timers" },
            { label: "Actual work", value: formatMinutes(total("activeMinutes")), note: "Attendance presence" },
            { label: "Counted work", value: formatMinutes(total("workingMinutes")), note: "After policy rules" },
            { label: "Overtime", value: formatMinutes(total("overtimeMinutes")), note: "Beyond duty window" },
          ],
        },
        pdfSheets: [
          {
            name: "Task Summary",
            columns: ["Task", "Date", "Status / Priority", "Description", "Tracked", "Completion Note"],
            widths: [1.8, 0.95, 1.15, 2.25, 0.85, 1.45],
            rows: summary.items.map((task) => [
              task.title,
              formatDateInDhaka(task.date),
              [titleCase(task.status), titleCase(task.priority)].join("\n"),
              task.description || "-",
              formatMinutes(task.trackedMinutes),
              task.note || "-",
            ]),
          },
          {
            name: "Attendance Summary",
            columns: ["Date", "Actual", "Counted", "Break", "Included Break", "Extra Break", "Outside", "Overtime"],
            widths: [1.15, 1, 1, 1, 1.2, 1.05, 1, 1],
            rows: attendanceRows.map(({ record, metrics }) => [
              formatDateInDhaka(record.attendanceDate),
              formatMinutes(metrics.activeMinutes),
              formatMinutes(metrics.workingMinutes),
              formatMinutes(metrics.breakMinutes),
              formatMinutes(metrics.includedBreakMinutes),
              formatMinutes(metrics.excessBreakMinutes),
              formatMinutes(metrics.outsideMinutes),
              formatMinutes(metrics.overtimeMinutes),
            ]),
          },
        ],
      },
    );
  } catch (error) {
    return fail(error);
  }
}
