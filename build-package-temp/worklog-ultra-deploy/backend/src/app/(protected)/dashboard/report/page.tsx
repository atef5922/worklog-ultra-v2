import { ReportForm } from "@/components/dashboard/report-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/server";
import { canUserEditReportDate, getPlanWithReports } from "@/lib/worklog";
import { toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireEmployee();
  const { date } = await searchParams;
  const selectedDate = date ? new Date(date) : new Date();
  const tasks = await getPlanWithReports(user.id, selectedDate);
  const editAccess = await canUserEditReportDate(
    { id: user.id, role: user.role },
    selectedDate,
    tasks.map((task) => task.id),
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
        </CardContent>
      </Card>
      {!editAccess.allowed ? (
        <Card>
          <CardContent className="pt-5">
            <p className="font-semibold text-white">Backdated report locked</p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Employees can only complete their own task on the same day. If you missed this date, submit an edit request from History and wait for Team Head approval.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <ReportForm
        key={`${toDateOnly(selectedDate)}:${tasks.map((task) => task.id).join(",")}`}
        canEdit={editAccess.allowed}
        reportDate={toDateOnly(selectedDate)}
        tasks={tasks}
      />
    </div>
  );
}
