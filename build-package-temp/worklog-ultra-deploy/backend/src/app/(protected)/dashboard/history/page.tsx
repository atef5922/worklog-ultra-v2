import { HistoryTable } from "@/components/dashboard/history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/server";
import { getHistoryData, getPendingReportEditRequests } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireEmployee();
  const { from, to } = await searchParams;
  const [history, pendingApprovals] = await Promise.all([
    getHistoryData(user.id, from, to),
    getPendingReportEditRequests(user),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <HistoryTable
          history={history}
          pendingApprovals={pendingApprovals}
          role={user.role}
        />
      </CardContent>
    </Card>
  );
}
