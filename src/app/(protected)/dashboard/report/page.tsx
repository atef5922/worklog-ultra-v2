import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, FileClock, PlayCircle, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { ReportDownloadButton } from "@/components/dashboard/report-download-button";
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
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+06:00`));
}

function formatRangeLabel(from: string, to: string) {
  if (from === to) {
    return formatRangeDate(from);
  }

  return `${formatRangeDate(from)} to ${formatRangeDate(to)}`;
}

/**
 * Rows per page. The entries panel is sized to show exactly this many without a
 * scroller — paging is what handles a long range, so nothing here ever scrolls.
 */
const PAGE_SIZE = 5;
const dateFieldClass =
  "h-9 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-2.5 text-[0.8rem] text-[var(--foreground)] outline-none transition focus:border-[#4f5ef7]";
const fieldLabelClass =
  "mb-1 block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]";
const pagerButtonClass =
  "inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 text-[0.7rem] font-semibold text-[var(--foreground)] transition hover:border-[#4f5ef7]/40 hover:bg-[var(--panel-alt)]";
const pagerDisabledClass =
  "inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-muted)] px-2 text-[0.7rem] font-semibold text-[var(--muted-foreground)] opacity-60";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string | string[];
    from?: string | string[];
    to?: string | string[];
    taskId?: string | string[];
    page?: string | string[];
  }>;
}) {
  const user = await requireEmployee();
  const { date, from, to, taskId, page } = await searchParams;

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

  const totalPages = Math.max(1, Math.ceil(summary.items.length / PAGE_SIZE));
  const requestedPage = Number(Array.isArray(page) ? page[0] : page);
  // Clamp rather than 404: a stale ?page= from a wider range must still render.
  const currentPage = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = summary.items.slice(firstIndex, firstIndex + PAGE_SIZE);

  function pageHref(targetPage: number) {
    const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
    if (targetPage > 1) {
      params.set("page", String(targetPage));
    }

    return `/dashboard/report?${params.toString()}`;
  }

  const summaryTiles = [
    {
      accent: "accent-indigo",
      icon: ClipboardList,
      label: "Tasks",
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
          <form
            action="/dashboard/report"
            className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_9rem_auto_auto] sm:items-end"
            method="get"
          >
          <div>
            <label className={fieldLabelClass} htmlFor="report-from">
              From
            </label>
            <input className={dateFieldClass} defaultValue={rangeFrom} id="report-from" name="from" type="date" />
          </div>
          <div>
            <label className={fieldLabelClass} htmlFor="report-to">
              To
            </label>
            <input className={dateFieldClass} defaultValue={rangeTo} id="report-to" name="to" type="date" />
          </div>
          <button
            className="button-force-white inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4f5ef7] px-3.5 text-[0.82rem] font-semibold text-white shadow-[0_10px_22px_rgba(79,94,247,0.24)] transition hover:bg-[#4453eb]"
            type="submit"
          >
            <Search className="h-3.5 w-3.5" />
            View
          </button>
          <ReportDownloadButton
            fallbackFrom={rangeFrom}
            fallbackTo={rangeTo}
            fromInputId="report-from"
            toInputId="report-to"
          />
          </form>
        }
        icon={FileClock}
        subtitle={formatRangeLabel(rangeFrom, rangeTo)}
        title="Work Report"
      />

      {/* `lg:`, not `min-[900px]:` — Tailwind emits arbitrary media variants
          before the named breakpoints, so `sm:grid-cols-2` was winning at desktop
          width and the tiles stayed stacked two-by-two, eating a row of height
          the table needed. */}
      <section className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4" data-page-section>
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

        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--panel-border)]">
          <ReportEntriesTable firstIndex={firstIndex} items={pageItems} />
        </div>

        {totalPages > 1 ? (
          <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
            <p className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
              {firstIndex + 1}-{firstIndex + pageItems.length} of {summary.items.length}
            </p>
            <div className="flex items-center gap-1.5">
              {/* Rendered as a span when there is nowhere to go, so a dead end is
                  never a clickable link. */}
              {currentPage > 1 ? (
                <Link className={pagerButtonClass} href={pageHref(currentPage - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Link>
              ) : (
                <span className={pagerDisabledClass}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </span>
              )}
              <span className="px-1 font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
                {currentPage} / {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link className={pagerButtonClass} href={pageHref(currentPage + 1)}>
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className={pagerDisabledClass}>
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
