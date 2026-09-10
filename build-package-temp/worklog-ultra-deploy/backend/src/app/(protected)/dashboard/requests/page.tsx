import { subDays } from "date-fns";
import { redirect } from "next/navigation";
import { HistoryTable } from "@/components/dashboard/history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/server";
import { toDateOnly } from "@/lib/utils";
import { getHistoryData, getPendingReportEditRequests } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireEmployee();

  if (user.role === "manager" || user.role === "admin") {
    const pendingApprovals = await getPendingReportEditRequests(user);

    return (
      <Card>
        <CardHeader>
          <CardTitle>Incoming Team Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            Only employees from your department can send missed-report edit requests here. Review why the task was missed, check remembered start/end time and requested status, then approve or reject it.
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Waiting now: <span className="font-semibold text-white">{pendingApprovals.length}</span>
          </p>
          <HistoryTable history={[]} pendingApprovals={pendingApprovals} role={user.role} mode="requests" />
        </CardContent>
      </Card>
    );
  }

  if (user.role !== "employee") {
    redirect("/dashboard");
  }

  const { from, to } = await searchParams;
  const effectiveFrom = from ?? toDateOnly(subDays(new Date(), 30));
  const effectiveTo = to ?? toDateOnly(new Date());
  const history = await getHistoryData(user.id, effectiveFrom, effectiveTo);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests & Approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Employees can request backdated editing from here. Choose the missed task, explain why the report was missed, add remembered start/end time if needed, and send it to your department Team Head for approval.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">Showing request-relevant tasks from the last 30 days.</p>
        <HistoryTable history={history} pendingApprovals={[]} role={user.role} mode="requests" />
      </CardContent>
    </Card>
  );
}
