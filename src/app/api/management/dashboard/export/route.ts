import { authenticate, AccessError, fail } from "@/lib/management/server";
import { can } from "@/lib/auth/policy";
import { dashboardData } from "@/lib/management/dashboard-data";
import { exportResponse, type ReportSheet } from "@/lib/management/export";
import { formatDateInDhaka, formatDateTimeInDhaka, formatMinutes } from "@/lib/utils";

export const runtime = "nodejs";

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function GET(request: Request) {
  try {
    const actor = await authenticate("reports.export");
    if (!can(actor, "reports.view")) throw new AccessError("Report view access is required.");
    const params = new URL(request.url).searchParams;
    const format = params.get("format") ?? "xlsx";
    if (!["xlsx", "pdf"].includes(format)) throw new AccessError("Choose PDF or Excel.", 400);
    const data = await dashboardData(actor, params);
    const excelSheets: ReportSheet[] = [
      {
        name: "Tasks",
        columns: ["Task", "Employee", "Department", "Project", "Client", "Priority", "Status", "Deadline (Dhaka)", "Checklist %", "Estimate minutes", "Saved task minutes"],
        rows: data.taskRows.map((task) => [task.title, task.employee, task.department, task.project, task.client, task.priority, task.status, task.deadline ? formatDateTimeInDhaka(task.deadline) : "Not set", task.progress, task.estimatedMinutes, task.trackedMinutes]),
      },
      {
        name: "Employee summary",
        columns: ["Employee", "Department", "Assigned", "Completed", "In progress", "Pending", "Overdue", "Saved task minutes", "Counted attendance minutes"],
        rows: data.employees.map((employee) => [employee.name, employee.department, data.taskAccess ? employee.assigned : null, data.taskAccess ? employee.completed : null, data.taskAccess ? employee.inProgress : null, data.taskAccess ? employee.pending : null, data.taskAccess ? employee.overdue : null, data.taskAccess ? employee.trackedMinutes : null, data.attendanceAccess ? employee.countedMinutes : null]),
      },
    ];
    return exportResponse(
      "Management Dashboard Report",
      excelSheets,
      format,
      `worklog-dashboard-${data.from}-${data.to}`,
      {
        pdf: {
          subtitle: "Team performance, task progress and attendance overview",
          period: `${formatDateInDhaka(data.from)} to ${formatDateInDhaka(data.to)}`,
          scope: "Permission-scoped management data",
          generatedAt: data.generatedAt,
          metrics: [
            { label: "Employees", value: data.kpis.employees, note: "Within access scope" },
            { label: "Present", value: data.kpis.present, note: "Checked in during period" },
            { label: "Tasks", value: data.kpis.tasks, note: "Selected period" },
            { label: "Completed", value: data.kpis.completed, note: "Marked as done" },
            { label: "In progress", value: data.kpis.inProgress, note: "Active or paused" },
            { label: "Pending", value: data.kpis.pending, note: "Not started" },
            { label: "Overdue", value: data.kpis.overdue, note: "Past deadline" },
          ],
        },
        pdfSheets: [
          {
            name: "Tasks in Selected Period",
            columns: ["Task / Project", "Employee / Department", "Priority / Status", "Deadline", "Progress", "Estimated", "Tracked"],
            widths: [2.2, 1.65, 1.25, 1.2, 0.85, 0.9, 0.9],
            rows: data.taskRows.map((task) => [
              [task.title, [task.project, task.client].filter(Boolean).join(" / ")].filter(Boolean).join("\n"),
              [task.employee, task.department].join("\n"),
              [titleCase(task.priority), titleCase(task.status)].join("\n"),
              task.deadline ? formatDateTimeInDhaka(task.deadline) : "Not set",
              task.progress === null ? "-" : `${task.progress}%${task.checklistTotal ? ` (${task.checklistDone}/${task.checklistTotal})` : ""}`,
              task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : "Not set",
              formatMinutes(task.trackedMinutes),
            ]),
          },
          {
            name: "Employee Performance Summary",
            columns: ["Employee", "Department", "Assigned", "Completed", "In Progress", "Pending / Overdue", "Task / Counted Time"],
            widths: [1.7, 1.45, 0.8, 0.85, 0.9, 1.15, 1.35],
            rows: data.employees.map((employee) => [
              employee.name,
              employee.department,
              data.taskAccess ? employee.assigned : "-",
              data.taskAccess ? `${employee.completed} (${employee.completionRate ?? 0}%)` : "-",
              data.taskAccess ? employee.inProgress : "-",
              data.taskAccess ? `${employee.pending} pending\n${employee.overdue} overdue` : "-",
              [data.taskAccess ? `Task: ${formatMinutes(employee.trackedMinutes)}` : null, data.attendanceAccess ? `Counted: ${formatMinutes(employee.countedMinutes)}` : null].filter(Boolean).join("\n") || "-",
            ]),
          },
        ],
      },
    );
  } catch (error) {
    return fail(error);
  }
}
