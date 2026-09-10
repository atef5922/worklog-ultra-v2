"use client";

import { useState, type KeyboardEvent } from "react";
import { FileClock } from "lucide-react";
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
const gridCols = "md:grid-cols-[2.75rem_7rem_minmax(0,1fr)_7.5rem_5.5rem]";

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
        className={`hidden border-b-2 border-[var(--panel-border)] bg-[var(--panel-muted)] text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:grid ${gridCols} md:divide-x md:divide-[var(--panel-border)]`}
      >
        <span className="px-2 py-2 text-right">#</span>
        <span className="px-3 py-2">Date</span>
        <span className="px-3 py-2">Task</span>
        <span className="px-3 py-2">Status</span>
        <span className="px-3 py-2 text-right">Time</span>
      </div>
      {/* Rows share the leftover so the last one ends flush with the box.
          Safe now only because the tiles fit on one line: five rows at their
          natural height are shorter than this container, so flex-1 can only
          grow them. It cannot shrink a row below its own text, which is what
          cropped the fifth row while the tiles were still stacked. */}
      <div className="flex min-h-0 flex-1 flex-col divide-y divide-[var(--panel-border)]">
        {items.length ? (
          items.map((item, index) => (
            <div
              className={`cursor-pointer px-3 py-1.5 transition-colors even:bg-[var(--panel-muted)]/60 hover:bg-[var(--panel-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#4f5ef7] md:grid ${gridCols} md:flex-1 md:items-center md:divide-x md:divide-[var(--panel-border)] md:px-0 md:py-0`}
              key={item.id}
              onClick={() => openDetails(item)}
              onKeyDown={(event) => handleKeyDown(event, item)}
              role="button"
              tabIndex={0}
              title="Open task details"
            >
              {/* Numbering runs across pages, not per page. */}
              <p className="hidden font-mono text-[0.7rem] font-semibold tabular-nums text-[var(--muted-foreground)] md:block md:px-2 md:py-2 md:text-right">
                {String(firstIndex + index + 1).padStart(2, "0")}
              </p>
              <p className="font-mono text-[0.72rem] font-semibold tabular-nums text-[var(--muted-foreground)] md:px-3 md:py-2">
                {item.date}
              </p>
              <div className="mt-1.5 min-w-0 md:mt-0 md:px-3 md:py-2">
                <div className="flex flex-wrap items-center gap-2 md:block">
                  <p className="line-clamp-1 break-words text-[0.82rem] font-semibold text-[var(--foreground)]">
                    {item.title}
                  </p>
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
              <div className="mt-2 hidden md:mt-0 md:block md:px-3 md:py-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${statusTone(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <p className="mt-2 font-mono text-[0.76rem] font-bold tabular-nums text-[var(--foreground)] md:mt-0 md:px-3 md:py-2 md:text-right">
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

      <TaskDetailsModal onOpenChange={(open) => (open ? undefined : setDetailsTask(null))} task={detailsTask} />
    </>
  );
}
