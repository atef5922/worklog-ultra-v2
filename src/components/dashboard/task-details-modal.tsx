"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Building2, CalendarDays, CheckCircle2, Flag, PlayCircle, RotateCcw, Square, Timer, UserRoundCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ContinuationOverview } from "@/lib/task-continuation";
import { formatTaskPriority } from "@/lib/task-priority";
import { formatTimeOnlyInDhaka } from "@/lib/utils";

export type TaskDetails = {
  id: string;
  taskTitle: string;
  /** Already stripped of the metadata markers; empty means no note. */
  description: string;
  priority: string;
  status: "done" | "in_progress" | "pending";
  statusLabel: string;
  departmentName: string;
  planDate: string;
  trackedMinutes: number;
  actualStart?: string | null;
  actualEnd?: string | null;
  note?: string | null;
  isFollowUp: boolean;
  isContinued: boolean;
  isAssigned: boolean;
  /** Brought back from Complete Task rather than being freshly finished-then-reopened server side. */
  isReopened?: boolean;
  /** Still open past its own planDate, so it followed the user into today automatically. */
  isCarriedOver?: boolean;
  /** Set only for a task that has been carried forward across multiple days. */
  continuation?: ContinuationOverview | null;
};

type TaskActivityEvent = {
  id: string;
  eventType: "completed" | "reopened";
  cycle: number;
  reason?: string | null;
  note?: string | null;
  trackedMinutes: number;
  actualEnd?: string | null;
  createdAt: string;
  actorName: string;
};

function formatTrackedMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}m`;
}

function formatPlanDate(value: string) {
  const parsed = new Date(`${value}T00:00:00+06:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatLogDate(value: string) {
  const parsed = new Date(`${value}T00:00:00+06:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function formatActivityDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * The header is always the app's own navy brand gradient (the same recipe as
 * the topbar/sidebar in globals.css) rather than a different saturated hue per
 * status - a flat colored band read as cheap and forced a light text color
 * that fought with this app's global light-theme override of `.text-white`.
 * Status/priority now show up only as a soft corner glow and as solid,
 * semantic badge colors, so the surface stays premium and consistent while
 * the signal is still there.
 */
const HERO_BAND = "bg-[linear-gradient(160deg,#000080_0%,#001f66_55%,#020b31_100%)]";

function heroGlow(task: TaskDetails) {
  if (task.status === "done") {
    return "rgba(16,185,129,0.38)";
  }

  if (task.status === "in_progress") {
    return "rgba(79,94,247,0.42)";
  }

  if (task.priority === "critical" || task.priority === "high") {
    return "rgba(244,63,94,0.38)";
  }

  return "rgba(217,119,6,0.34)";
}

/** Clean professional badge styling - white background with black text */
function priorityChipClass(priority: string) {
  return "bg-white border border-slate-200 text-slate-700";
}

function statusChipClass(status: TaskDetails["status"]) {
  return "bg-white border border-slate-200 text-slate-700";
}

function TimelineCell({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-3 py-3 text-center">
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          strong ? "bg-[#4f5ef7] text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p
        className={`truncate text-[0.9rem] font-semibold tabular-nums ${strong ? "text-[#4f5ef7]" : "text-slate-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

const META_TONES = {
  indigo: "bg-slate-100 text-slate-600",
  violet: "bg-slate-100 text-slate-600",
  teal: "bg-slate-100 text-slate-600",
} as const;

function MetaCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  tone: keyof typeof META_TONES;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${META_TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
        <p className="truncate text-[0.85rem] font-semibold text-slate-900" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * The full record behind a work-plan card.
 *
 * The card clamps its title and note to one line each so every row keeps the
 * same height; everything it had to cut is here, unclamped.
 */
export function TaskDetailsModal({
  onOpenChange,
  task,
}: {
  onOpenChange: (open: boolean) => void;
  task: TaskDetails | null;
}) {
  const [activityEvents, setActivityEvents] = useState<TaskActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (!task?.id) {
      setActivityEvents([]);
      return;
    }

    const controller = new AbortController();
    setActivityLoading(true);
    setActivityEvents([]);

    void fetch(`/api/dashboard/tasks/${task.id}/activity`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          events?: TaskActivityEvent[];
        };
        if (response.ok) setActivityEvents(result.events ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setActivityLoading(false);
      });

    return () => controller.abort();
  }, [task?.id]);

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(task)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(620px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)] outline-none">
          <div className="relative shrink-0 overflow-hidden border-b border-slate-200 px-6 pb-4 pt-4">
            <Dialog.Close asChild>
              <button
                aria-label="Close task details"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>

            <div className="relative z-10 pr-10">
              <p className="text-[0.5rem] font-bold uppercase tracking-[0.15em] text-slate-500">Task details</p>
              <Dialog.Title className="mt-2 max-w-[calc(100%-2.5rem)] break-words text-[1.25rem] font-bold leading-tight text-slate-900 [overflow-wrap:anywhere]">
                {task?.taskTitle ?? ""}
              </Dialog.Title>

              {task ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${priorityChipClass(task.priority)}`}
                  >
                    <Flag className="h-3 w-3" />
                    {formatTaskPriority(task.priority)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${statusChipClass(task.status)}`}
                  >
                    {task.statusLabel}
                  </span>
                  {task.isFollowUp ? (
                    <span className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      Follow-up
                    </span>
                  ) : null}
                  {task.isContinued ? (
                    <span className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      Continued
                    </span>
                  ) : null}
                  {task.isReopened ? (
                    <span className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      Reopened
                    </span>
                  ) : null}
                  {task.isCarriedOver ? (
                    <span className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      Carried Over
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {task ? (
            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-6 py-5">
              {/* Start, elapsed and finish read left to right as one line rather
                  than as three unrelated tiles: they are one span of time. */}
              <div className="flex items-stretch divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <TimelineCell
                  icon={PlayCircle}
                  label="Started"
                  value={task.actualStart ? formatTimeOnlyInDhaka(task.actualStart) : "--:--"}
                />
                <TimelineCell icon={Timer} label="Tracked" strong value={formatTrackedMinutes(task.trackedMinutes)} />
                <TimelineCell
                  icon={Square}
                  label="Finished"
                  value={task.actualEnd ? formatTimeOnlyInDhaka(task.actualEnd) : "--:--"}
                />
              </div>

              <div>
                <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Description
                </p>
                <div className="mt-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  {task.description ? (
                    <p className="whitespace-pre-wrap break-words text-[0.85rem] leading-6 text-slate-700 [overflow-wrap:anywhere]">
                      {task.description}
                    </p>
                  ) : (
                    <p className="text-[0.85rem] italic leading-6 text-slate-500">
                      No description was added for this task.
                    </p>
                  )}
                </div>
              </div>

              {task.note ? (
                <div>
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                    Latest update note
                  </p>
                  <div className="mt-1.5 rounded-xl border border-slate-200 border-l-4 border-l-[#4f5ef7] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                    <p className="whitespace-pre-wrap break-words text-[0.85rem] leading-6 text-slate-700 [overflow-wrap:anywhere]">
                      {task.note}
                    </p>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                    Activity history
                  </p>
                  {activityEvents.length ? (
                    <span className="text-[0.7rem] font-semibold text-slate-500">
                      {activityEvents.length} event{activityEvents.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  {activityLoading ? (
                    <div className="px-4 py-4 text-sm text-slate-500">
                      Loading activity...
                    </div>
                  ) : activityEvents.length ? (
                    <div className="divide-y divide-slate-100">
                      {activityEvents.map((event) => {
                        const completed = event.eventType === "completed";
                        const Icon = completed ? CheckCircle2 : RotateCcw;
                        const detail = completed ? event.note : event.reason;

                        return (
                          <div
                            className="flex items-start gap-3 px-4 py-3"
                            key={event.id}
                          >
                            <span
                              className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                completed
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-indigo-50 text-indigo-600"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                <p className="text-[0.82rem] font-bold text-slate-900">
                                  {completed ? "Completed" : "Reopened"} #{event.cycle}
                                </p>
                                <time className="text-[0.7rem] font-medium text-slate-500">
                                  {formatActivityDateTime(
                                    completed && event.actualEnd
                                      ? event.actualEnd
                                      : event.createdAt,
                                  )}
                                </time>
                              </div>
                              <p className="mt-0.5 text-[0.7rem] text-slate-500">
                                By {event.actorName}
                                {completed
                                  ? ` � ${formatTrackedMinutes(event.trackedMinutes)} recorded`
                                  : ""}
                              </p>
                              {detail ? (
                                <p className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-[0.78rem] leading-5 text-slate-700 [overflow-wrap:anywhere]">
                                  {detail}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-sm text-slate-500">
                      No completion or reopen activity yet.
                    </div>
                  )}
                </div>
              </div>

              {task.continuation && task.continuation.dailyLogs.length > 1 ? (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                      Day-by-day history
                    </p>
                    <span className="shrink-0 text-[0.7rem] font-semibold text-slate-600">
                      {task.continuation.totalDays} days · {formatTrackedMinutes(task.continuation.overallTrackedMinutes)}
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                    {task.continuation.dailyLogs.map((entry) => (
                      <div
                        className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2"
                        key={entry.date}
                      >
                        <span className="shrink-0 rounded-md bg-slate-200 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-700">
                          {formatLogDate(entry.date)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.8rem] font-semibold tabular-nums text-slate-900">
                            {entry.progress}% · {formatTrackedMinutes(entry.trackedMinutes)}
                          </p>
                          {entry.note ? (
                            <p className="mt-0.5 break-words text-[0.75rem] leading-5 text-slate-600 [overflow-wrap:anywhere]">
                              {entry.note}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <MetaCell icon={Building2} label="Department" tone="indigo" value={task.departmentName} />
                <MetaCell icon={CalendarDays} label="Planned for" tone="violet" value={formatPlanDate(task.planDate)} />
                <MetaCell
                  icon={UserRoundCheck}
                  label="Source"
                  tone="teal"
                  value={task.isAssigned ? "Assigned to you" : "Your own plan"}
                />
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
