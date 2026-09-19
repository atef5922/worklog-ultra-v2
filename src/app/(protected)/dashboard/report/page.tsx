import { formatDateInDhaka } from "@/lib/utils";
import { CheckCircle2, ClipboardList, Clock3, FileClock, PauseCircle, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { ReportDateFilter } from "@/components/dashboard/report-date-filter";
import { ReportEntriesTable } from "@/components/dashboard/report-entries-table";
import { requireEmployee } from "@/lib/auth/server";
import { buildReportSummary } from "@/lib/report-summary";
import { getHistoryData } from "@/lib/worklog";
import { toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

function normalizeDateParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return normalizeDateParam(value[0]);
  }

  if (!value) {
    return null;
  }

  const normalized = toDateOnly(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function formatRangeDate(value: string) {
  return formatDateInDhaka(value);
}

function formatRangeLabel(from: string, to: string) {
  if (from === to) {
    return formatRangeDate(from);
  }

  return `${formatRangeDate(from)} to ${formatRangeDate(to)}`;
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string | string[];
    from?: string | string[];
    to?: string | string[];
    taskId?: string | string[];
  }>;
}) {
  const user = await requireEmployee();
  const { date, from, to, taskId } = await searchParams;

  const selectedDate = normalizeDateParam(date) ?? toDateOnly();
  const requestedFrom = normalizeDateParam(from) ?? selectedDate;
  const requestedTo = normalizeDateParam(to) ?? selectedDate;
  const exactDateView = Boolean(taskId) || (!from && !to);
  const focusedFrom = exactDateView ? selectedDate : requestedFrom;
  const focusedTo = exactDateView ? selectedDate : requestedTo;

  const rangeFrom = focusedFrom <= focusedTo ? focusedFrom : focusedTo;
  const rangeTo = focusedFrom <= focusedTo ? focusedTo : focusedFrom;
  const historyTasks = await getHistoryData(user.id, rangeFrom, rangeTo);
  const summary = buildReportSummary(historyTasks);

  const summaryTiles = [
    {
      accent: "accent-indigo",
      icon: ClipboardList,
      label: "Entries",
      tone: "bg-[#4f5ef7]/10 text-[#4f5ef7]",
      value: String(summary.totals.totalTasks),
      valueTone: "text-[var(--foreground)]",
    },
    {
      accent: "accent-emerald",
      icon: CheckCircle2,
      label: "Completed",
      tone: "bg-emerald-500/10 text-emerald-500",
      value: String(summary.totals.completedTasks),
      valueTone: "text-emerald-600",
    },
    {
      accent: "accent-sky",
      icon: PlayCircle,
      label: "In Progress",
      tone: "bg-sky-500/10 text-sky-500",
      value: String(summary.totals.inProgressTasks),
      valueTone: "text-sky-600",
    },
    {
      accent: "accent-amber",
      icon: PauseCircle,
      label: "Pending",
      tone: "bg-amber-500/10 text-amber-500",
      value: String(summary.totals.pendingTasks),
      valueTone: "text-amber-600",
    },
    {
      accent: "accent-violet",
      icon: Clock3,
      label: "Tracked Time",
      tone: "bg-violet-500/10 text-violet-500",
      value: summary.totals.totalTrackedLabel,
      valueTone: "text-[var(--foreground)]",
    },
  ];

  return (
    /* One screen, no scrollers anywhere: the entries panel shows a fixed page of
       rows and the pager below it handles the rest. */
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      <PageHeader
        action={
          <ReportDateFilter key={`${rangeFrom}:${rangeTo}`} from={rangeFrom} to={rangeTo} />
        }
        icon={FileClock}
        subtitle={formatRangeLabel(rangeFrom, rangeTo)}
        title="Work Report"
      />

      {/* `lg:`, not `min-[900px]:` — Tailwind emits arbitrary media variants
          before the named breakpoints, so `sm:grid-cols-2` was winning at desktop
          width and the tiles stayed stacked two-by-two, eating a row of height
          the table needed. */}
      <section className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-5" data-page-section>
        {summaryTiles.map((tile) => {
          const Icon = tile.icon;

          return (
            <div
              className={`dashboard-accent ${tile.accent} flex items-center gap-2 rounded-[1rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2 shadow-[var(--shadow)]`}
              data-dashboard-card
              key={tile.label}
            >
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.625rem] ${tile.tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  {tile.label}
                </p>
                <p className={`truncate text-[1.05rem] font-bold leading-tight tabular-nums ${tile.valueTone}`}>
                  {tile.value}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section
        className="dashboard-accent accent-sky flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)] min-[900px]:flex-1"
        data-dashboard-panel
        data-page-section
      >
        <PanelHeader
          action={
            <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
              {summary.items.length} {summary.items.length === 1 ? "entry" : "entries"}
            </span>
          }
          icon={FileClock}
          title="Report Entries"
          tone="bg-sky-500/10 text-sky-500"
        />

        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel)]">
          <ReportEntriesTable firstIndex={0} items={summary.items} />
        </div>
      </section>
    </div>
  );
}
