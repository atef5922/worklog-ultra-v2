"use client";

import { formatDateInDhaka } from "@/lib/utils";
import { useState, type KeyboardEvent } from "react";
import { ArrowDown, Clock3, FileClock, Flag } from "lucide-react";
import { TaskDetailsModal, type TaskDetails } from "@/components/dashboard/task-details-modal";
import type { ReportSummaryItem } from "@/lib/report-summary";
import { formatMinutes } from "@/lib/utils";

function statusTone(status: "done" | "in_progress" | "pending") {
  if (status === "done") {
    return "bg-emerald-500/10 text-emerald-600";
  }

  if (status === "in_progress") {
    return "bg-blue-500/10 text-blue-600";
  }

  return "bg-amber-500/10 text-amber-600";
}

function statusLabel(status: "done" | "in_progress" | "pending") {
  if (status === "done") return "Completed";
  if (status === "in_progress") return "In Progress";
  return "Pending";
}

function toTaskDetails(item: ReportSummaryItem): TaskDetails {
  return {
    id: item.id,
    taskTitle: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    statusLabel: statusLabel(item.status),
    departmentName: item.departmentName,
    planDate: item.date,
    trackedMinutes: item.trackedMinutes,
    actualStart: item.actualStart,
    actualEnd: item.actualEnd,
    note: item.note || null,
    isFollowUp: item.isFollowUp,
    isContinued: item.isContinued,
    isAssigned: item.isAssigned,
    continuation: item.continuation,
  };
}

// Shared by the header row and the data rows so the columns can never drift.
const gridCols = "md:grid-cols-[2.5rem_6.75rem_minmax(14rem,1fr)_10rem_7.5rem_6.25rem]";

function formatClock(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function workPeriod(item: ReportSummaryItem) {
  const start = formatClock(item.actualStart);
  const end = formatClock(item.actualEnd);
  if (!start && !end) return "Not recorded";
  return `${start ?? "Not started"} – ${end ?? "In progress"}`;
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function priorityTone(priority: string) {
  if (priority === "critical" || priority === "urgent") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-600";
  }

  if (priority === "high") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  }

  if (priority === "normal") {
    return "border-blue-500/25 bg-blue-500/10 text-blue-600";
  }

  return "border-slate-400/30 bg-slate-500/10 text-slate-600";
}

/**
 * Each row opens the same details card the dashboard's work-plan cards use, so
 * a task that has been carried forward across several days shows its full
 * day-by-day history here too, not just the most recent day's numbers.
 */
export function ReportEntriesTable({ firstIndex, items }: { firstIndex: number; items: ReportSummaryItem[] }) {
  const [detailsTask, setDetailsTask] = useState<TaskDetails | null>(null);

  function openDetails(item: ReportSummaryItem) {
    setDetailsTask(toTaskDetails(item));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, item: ReportSummaryItem) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openDetails(item);
  }

  return (
    <>
      <div
        aria-label="Report entries"
        className="dashboard-scroll-area max-h-[28rem] min-h-0 flex-1 md:max-h-none"
        role="region"
        tabIndex={0}
      >
        <div
          className={`sticky top-0 z-10 hidden border-b border-[var(--panel-border)] bg-[var(--panel-muted)] text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid md:divide-x md:divide-[var(--panel-border)] ${gridCols}`}
        >
          <span className="px-2 py-2 text-right">#</span>
          <span className="flex items-center gap-1 px-3 py-2" title="Newest workday first">
            Workday
            <ArrowDown aria-hidden="true" className="h-3 w-3 text-[#6473d7]" />
          </span>
          <span className="px-3 py-2">Task details</span>
          <span className="px-3 py-2">Work period</span>
          <span className="px-3 py-2">Status</span>
          <span className="px-3 py-2 text-right">Tracked</span>
        </div>
        <div className="divide-y divide-[var(--panel-border)]">
        {items.length ? (
          items.map((item, index) => (
            <div
              className={`cursor-pointer px-3 py-2 transition-colors even:bg-[var(--panel-muted)]/45 hover:bg-[var(--panel-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#4f5ef7] md:grid md:min-h-[3.75rem] md:items-stretch md:divide-x md:divide-[var(--panel-border)] md:px-0 md:py-0 ${gridCols}`}
              key={item.id}
              onClick={() => openDetails(item)}
              onKeyDown={(event) => handleKeyDown(event, item)}
              role="button"
              tabIndex={0}
              title="Open task details"
            >
              <p className="hidden font-mono text-[0.7rem] font-semibold tabular-nums text-[var(--muted-foreground)] md:flex md:items-center md:justify-end md:px-2 md:py-2 md:text-right">
                {String(firstIndex + index + 1).padStart(2, "0")}
              </p>
              <p className="font-mono text-[0.72rem] font-semibold tabular-nums text-[var(--muted-foreground)] md:flex md:items-center md:px-3 md:py-2">
                {formatDateInDhaka(item.date)}
              </p>
              <div className="mt-1.5 min-w-0 md:mt-0 md:flex md:flex-col md:justify-center md:px-3 md:py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="line-clamp-1 break-words text-[0.82rem] font-semibold text-[var(--foreground)]">
                    {item.title}
                  </p>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6rem] font-semibold ${priorityTone(item.priority)}`}
                    title={`${priorityLabel(item.priority)} priority`}
                  >
                    <Flag className="h-2.5 w-2.5" />
                    {priorityLabel(item.priority)}
                  </span>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold md:hidden ${statusTone(item.status)}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                  {item.continuation && item.continuation.dailyLogs.length > 1 ? (
                    <span className="inline-flex shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-violet-600">
                      {item.continuation.totalDays} days
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 break-words text-[0.72rem] text-[var(--muted-foreground)]">
                  {[item.departmentName, item.description || item.note || "No extra details"].join(" · ")}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-[var(--muted-foreground)] md:mt-0 md:px-3 md:py-2">
                <Clock3 className="h-3.5 w-3.5 shrink-0 text-[#6473d7]" />
                <span className="whitespace-nowrap font-medium tabular-nums text-[var(--foreground)]">
                  {workPeriod(item)}
                </span>
              </div>
              <div className="mt-2 hidden md:mt-0 md:flex md:items-center md:px-3 md:py-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${statusTone(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <p className="mt-2 text-[0.76rem] font-semibold tabular-nums text-[var(--foreground)] md:mt-0 md:flex md:items-center md:justify-end md:px-3 md:py-2 md:text-right">
                {formatMinutes(item.trackedMinutes)}
              </p>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 bg-[var(--panel-muted)] px-4 py-6 text-center">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-500">
              <FileClock className="h-4 w-4" />
            </span>
            <p className="text-[0.8rem] font-medium text-[var(--muted-foreground)]">No report data for this date range.</p>
          </div>
        )}
        </div>
      </div>

      <TaskDetailsModal onOpenChange={(open) => (open ? undefined : setDetailsTask(null))} task={detailsTask} />
    </>
  );
}
