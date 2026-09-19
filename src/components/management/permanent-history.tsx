import Link from "next/link";
import { History, Clock3, CalendarDays, Building2, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/dashboard/page-header";
import { HistoryDateFilter } from "@/components/management/history-date-filter";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getReadableTaskDescription } from "@/lib/report-summary";
import { formatDateInDhaka, formatMinutes, toDateOnly } from "@/lib/utils";

export async function PermanentHistory({ userId, search }: {
  userId: string;
  search: { from?: string; to?: string };
}) {
  const today = toDateOnly();
  const valid = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today ? value : undefined;
  };
  const from = valid(search.from) ?? today;
  const to = valid(search.to) ?? today;
  const range = { gte: new Date(from), lte: new Date(to) };
  const where: Prisma.DailyTaskWhereInput = {
    userId,
    OR: [
      { activityEvents: { some: { eventType: "completed", reportDate: range } } },
      { updates: { some: { status: "done", reportDate: range } } },
    ],
  };
  const tasks = from > to ? [] : await db.dailyTask.findMany({
    where,
    include: { updates: { orderBy: { reportDate: "desc" } }, department: { select: { name: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  return (
    <div data-fit-viewport data-history-page className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PageHeader icon={History} title="My History" subtitle="Permanent, read-only records. Previous completion history is kept when a task is reopened." />
      <HistoryDateFilter key={`${from}:${to}`} from={from} to={to} today={today}>
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel)]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 id="work-history-heading" className="text-sm font-semibold">Work History</h2>
              <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">{tasks.length} {tasks.length === 1 ? "record" : "records"}</span>
            </div>
            <span className="text-xs text-[var(--muted-foreground)]">
              {from === to ? formatDateInDhaka(from) : `${formatDateInDhaka(from)} – ${formatDateInDhaka(to)}`}
            </span>
          </div>
          <div key={`${from}:${to}`} role="region" aria-labelledby="work-history-heading" tabIndex={0} className="dashboard-scroll-area min-h-0 flex-1 focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
            {tasks.map((task) => (
              <article className="flex items-start justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-4 last:border-b-0 hover:bg-[var(--panel-muted)] sm:gap-5" key={task.id}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold">{task.taskTitle}</h3>
                    <Badge variant={task.updates[0]?.status === "done" ? "success" : "warning"} className="px-2 py-0.5 text-[10px] normal-case tracking-normal">
                      {task.updates[0]?.status === "done" ? "Completed" : "Reopened"}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--muted-foreground)]">{getReadableTaskDescription(task.taskDescription)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--muted-foreground)]">
                    <span className="inline-flex min-w-0 items-center gap-1.5"><Building2 aria-hidden="true" className="size-3.5 shrink-0" />{task.department.name}</span>
                    <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-3.5" />Planned {formatDateInDhaka(task.planDate)}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{formatMinutes(task.updates.reduce((minutes, update) => minutes + update.trackedMinutes, 0))}</span>
                  </div>
                </div>
                <Link aria-label={`Details for ${task.taskTitle}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--panel-muted)]" href={`/dashboard/tasks/${task.id}`}>
                  Details<ChevronRight aria-hidden="true" className="size-3.5" />
                </Link>
              </article>
            ))}
            {!tasks.length && (
              <div className="flex min-h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center text-[var(--muted-foreground)]">
                <History aria-hidden="true" className="mb-1 size-7 opacity-50" />
                <p className="text-sm font-medium">{from > to ? "Choose a start date before the end date." : "No completed task records in this range."}</p>
              </div>
            )}
          </div>
        </section>
      </HistoryDateFilter>
    </div>
  );
}
