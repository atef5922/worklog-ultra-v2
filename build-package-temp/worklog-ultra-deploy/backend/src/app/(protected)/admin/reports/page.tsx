import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAdminOrManager } from "@/lib/auth/server";
import { getAdminOverview } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requireAdminOrManager();
  const { reports } = await getAdminOverview();

  return (
    <Card>
      <CardHeader><CardTitle>Reports</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <THead><TR><TH>Employee</TH><TH>Task</TH><TH>Status</TH><TH>Minutes</TH></TR></THead>
          <TBody>
            {reports.map((report) => (
              <TR key={report.id}>
                <TD>{report.dailyTask.user.name}</TD>
                <TD>{report.dailyTask.taskTitle}</TD>
                <TD><Badge>{report.status}</Badge></TD>
                <TD>{report.trackedMinutes}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
