import { authenticate, fail, AccessError } from "@/lib/management/server";
import { can, employeeScope } from "@/lib/auth/policy";
import { managementRecords } from "@/lib/management/records";
import { exportResponse, type ReportSheet } from "@/lib/management/export";
import { db } from "@/lib/db";
import { roleUiTitle } from "@/lib/auth/roles";
import { formatMinutes } from "@/lib/utils";

export const runtime = "nodejs";

const duration = (minutes: number | null) => minutes === null ? "-" : formatMinutes(minutes);

export async function GET(request: Request) {
  try {
    const actor = await authenticate("reports.export");
    if (!can(actor, "reports.view")) throw new AccessError("Report view permission is also required.");
    const params = new URL(request.url).searchParams;
    const data = await managementRecords(actor, params, true);
    // Intersect view and export scopes, never broaden the result with query parameters.
    const allowed = new Set((await db.user.findMany({
      where: employeeScope(actor, "reports.export"),
      select: { id: true },
    })).map((user) => user.id));
    const rows = data.rows.filter((row) => allowed.has(row.id));
    const excelSheets: ReportSheet[] = [{
      name: "Employee Summary",
      columns: ["Employee", "Employee ID", "Role", "Department", "Team", "Attendance", "Planned", "Completed", "In progress", "Pending", "Task minutes", "Actual minutes", "Counted minutes", "Break minutes", "Outside minutes", "Overtime minutes"],
      rows: rows.map((row) => [row.name, row.id, roleUiTitle(row.role), row.department?.name ?? "", row.team?.name ?? "", row.state, row.planned, row.completed, row.inProgress, row.pending, row.tracked, row.actual, row.counted, row.break, row.outside, row.overtime]),
    }];
    const sum = (key: "planned" | "completed" | "inProgress" | "pending" | "tracked" | "counted" | "overtime") =>
      rows.reduce((total, row) => total + (row[key] ?? 0), 0);
    return exportResponse(
      "Management Report",
      excelSheets,
      params.get("format") ?? "xlsx",
      `worklog-management-${data.from}-${data.to}`,
      {
        pdf: {
          subtitle: "Employee work, task and attendance summary",
          period: `${data.from} to ${data.to}`,
          scope: `${rows.length} authorized employee record${rows.length === 1 ? "" : "s"}`,
          metrics: [
            { label: "People in scope", value: rows.length, note: "Authorized records" },
            { label: "Working now", value: rows.filter((row) => row.state === "Working").length, note: "Currently checked in" },
            { label: "Completed tasks", value: sum("completed"), note: `${sum("planned")} total tasks` },
            { label: "Pending tasks", value: sum("pending"), note: `${sum("inProgress")} in progress` },
            { label: "Task time", value: formatMinutes(sum("tracked")), note: "Saved task timers" },
            { label: "Counted work", value: formatMinutes(sum("counted")), note: "Attendance-based" },
            { label: "Overtime", value: formatMinutes(sum("overtime")), note: "Beyond duty window" },
          ],
        },
        pdfSheets: [{
          name: "Employee Summary",
          columns: ["Employee", "Role / Team", "Attendance", "Tasks", "Task Time", "Counted Work", "Break / Outside", "Overtime"],
          widths: [1.6, 1.45, 1.05, 1.55, 0.9, 0.95, 1.2, 0.8],
          rows: rows.map((row) => [
            row.name,
            [roleUiTitle(row.role), row.department?.name ?? "No department", row.team?.name ?? "No team"].join("\n"),
            row.state ?? "Not available",
            [`${row.completed ?? 0}/${row.planned ?? 0} completed`, `${row.inProgress ?? 0} in progress`, `${row.pending ?? 0} pending`].join("\n"),
            duration(row.tracked),
            [duration(row.counted), `Actual: ${duration(row.actual)}`].join("\n"),
            [`Break: ${duration(row.break)}`, `Outside: ${duration(row.outside)}`].join("\n"),
            duration(row.overtime),
          ]),
        }],
      },
    );
  } catch (error) {
    return fail(error);
  }
}
