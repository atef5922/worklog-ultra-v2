import { authenticate, AccessError, fail } from "@/lib/management/server";
import { canViewAttendanceDetails } from "@/lib/auth/policy";
import { attendanceOverview } from "@/lib/management/attendance-overview";
import { attendanceExportResponse } from "@/lib/management/attendance-report";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await authenticate("reports.export");
    if (!canViewAttendanceDetails(actor)) throw new AccessError("Attendance view permission is also required.");
    const params = new URL(request.url).searchParams;
    const format = params.get("format") ?? "xlsx";
    if (!["xlsx", "pdf"].includes(format)) throw new AccessError("Choose Excel or PDF.", 400);
    // Status/attention filters are for on-screen investigation. Applying them to
    // the report denominator would produce misleading attendance percentages.
    const reportParams = new URLSearchParams(params);
    reportParams.delete("status");
    reportParams.delete("attention");
    const data = await attendanceOverview(actor, reportParams);
    const daily = data.from === data.to || Boolean(reportParams.get("userId")) || reportParams.get("detail") === "1";
    if (format === "pdf" && daily && data.rows.length > 1000) throw new AccessError("Narrow the dates or employee filter before exporting a day-wise PDF (maximum 1,000 rows).", 400);
    const response = await attendanceExportResponse(
      { data, params: reportParams, preparedBy: actor.name ?? "Management" },
      format as "pdf" | "xlsx",
      `worklog-attendance-${data.from}-${data.to}`,
    );
    await db.managementAuditLog.create({
      data: {
        actorId: actor.id,
        targetId: null,
        action: "attendance.report_exported",
        reason: `${format.toUpperCase()} attendance report`,
        afterValue: { from: data.from, to: data.to, filters: Object.fromEntries(reportParams), rows: data.total },
      },
    });
    return response;
  } catch (error) {
    return fail(error);
  }
}
