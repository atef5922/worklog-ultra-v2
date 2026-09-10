import { BriefcaseBusiness, History } from "lucide-react";
import { HistoryTable } from "@/components/dashboard/history-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
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
    /* One screen: the panel takes the leftover height and the table pages
       through its records instead of scrolling. */
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      <PageHeader icon={BriefcaseBusiness} title="History" />

      <section
        className="dashboard-accent accent-violet flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)] min-[900px]:flex-1"
        data-dashboard-panel
        data-page-section
      >
        <PanelHeader
          action={
            <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
              {(history ?? []).length} {(history ?? []).length === 1 ? "record" : "records"}
            </span>
          }
          icon={History}
          title="Work History"
          tone="bg-violet-500/10 text-violet-500"
        />
        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <HistoryTable
            history={history ?? []}
            pendingApprovals={pendingApprovals ?? []}
            role={user.role}
          />
        </div>
      </section>
    </div>
  );
}
