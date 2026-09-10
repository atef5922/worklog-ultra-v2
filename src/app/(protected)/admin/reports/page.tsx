import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminOrManager } from "@/lib/auth/server";
import { extractContinuationMeta, stripContinuationMeta } from "@/lib/task-continuation";
import { getAdminOverview } from "@/lib/worklog";
import { formatDateTimeInDhaka, formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "done") return "success" as const;
  if (status === "in_progress") return "purple" as const;
  return "warning" as const;
}

export default async function AdminReportsPage() {
  const actor = await requireAdminOrManager();
  const { reports } = await getAdminOverview({
    role: actor.role,
    departmentId: actor.departmentId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
        <CardDescription>
          Review each employee&apos;s submitted work, including recurring multi-day task history, daily progress, and overall tracked time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(reports ?? []).length ? (
          (reports ?? []).map((report) => {
            const continuationMeta = extractContinuationMeta(report.dailyTask.taskDescription);
            const cleanedDescription = stripContinuationMeta(report.dailyTask.taskDescription).trim();
            const dailyLogs = continuationMeta?.dailyLogs ?? [];
            const totalDays = Math.max(continuationMeta?.daysActive ?? 0, dailyLogs.length, continuationMeta ? 1 : 0);
            const totalTrackedMinutes = dailyLogs.reduce((sum, entry) => sum + entry.trackedMinutes, 0);

            return (
              <div
                key={report.id}
                className="rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-[var(--foreground)]">{report.dailyTask.taskTitle}</p>
                      <Badge variant={statusTone(report.status)}>{report.status.replace("_", " ")}</Badge>
                      {continuationMeta ? <Badge variant="purple">Recurring multi-day</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>{report.dailyTask.user.name}</span>
                      <span>{report.dailyTask.department.name}</span>
                      <span>{formatDateTimeInDhaka(report.reportDate)}</span>
                      <span>Today {formatMinutes(report.trackedMinutes)}</span>
                      {continuationMeta ? <span>Overall {formatMinutes(totalTrackedMinutes)}</span> : null}
                      {continuationMeta ? <span>{totalDays} day(s)</span> : null}
                    </div>
                    {cleanedDescription ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{cleanedDescription}</p>
                    ) : null}
                    {continuationMeta ? (
                      <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/80 p-3">
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-violet-700">
                          <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1">
                            Continued from {continuationMeta.sourceDate}
                          </span>
                          <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1">
                            {totalDays} day(s)
                          </span>
                          <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1">
                            Total {formatMinutes(totalTrackedMinutes)}
                          </span>
                        </div>
                        {dailyLogs.length ? (
                          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {dailyLogs.map((entry) => (
                              <div key={`${report.id}-${entry.date}`} className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-xs text-slate-700">
                                <p className="font-semibold text-violet-700">{entry.date}</p>
                                <p className="mt-1">{entry.progress}% complete</p>
                                <p>{formatMinutes(entry.trackedMinutes)}</p>
                                <p className="mt-1 text-[var(--muted-foreground)]">{entry.note || "No note"}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
            No reports found right now.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
