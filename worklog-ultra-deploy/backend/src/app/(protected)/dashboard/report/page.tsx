import { ReportForm } from "@/components/dashboard/report-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/server";
import { canUserEditReportDate, getPlanWithReports } from "@/lib/worklog";
import { toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; taskId?: string }>;
}) {
  const user = await requireEmployee();
  const { date, taskId } = await searchParams;
  const selectedDate = date ? new Date(date) : new Date();
  const tasks = await getPlanWithReports(user.id, selectedDate);
  const visibleTasks = taskId ? tasks.filter((task: (typeof tasks)[number]) => task.id === taskId) : tasks;
  const editAccess = await canUserEditReportDate(
    { id: user.id, role: user.role },
    selectedDate,
    visibleTasks.map((task: (typeof visibleTasks)[number]) => task.id),
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Submit Your Evening Report</CardTitle>
        </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--muted-foreground)]">
          Track completion, effort, and actual work windows for tasks on {toDateOnly(selectedDate)}.
        </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            If a task is still processing after today, just save it with progress. The system will automatically continue it on the next day.
          </p>
          {taskId ? <p className="mt-2 text-xs text-cyan-300">Focused on one selected task so it is easier to update quickly.</p> : null}
        </CardContent>
      </Card>
      <ReportForm
        key={`${toDateOnly(selectedDate)}:${visibleTasks.map((task: (typeof visibleTasks)[number]) => task.id).join(",")}`}
        canEdit={editAccess.allowed}
        reportDate={toDateOnly(selectedDate)}
        tasks={visibleTasks}
      />
    </div>
  );
}
