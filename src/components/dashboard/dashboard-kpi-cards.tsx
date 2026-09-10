"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  filterTodaysWorkPlanTasks,
  getTaskDaySeed,
  getTaskStatusForDashboard,
  isCarriedOverTask,
  sortTasksByRecency,
} from "@/lib/dashboard-work-plan-filter";
import { formatTaskPriority, normalizeTaskPriority } from "@/lib/task-priority";
import { isReopenedTask } from "@/lib/task-reopen";
import { formatMinutes } from "@/lib/utils";
import { buildTaskDetails, type DashboardWorkPlanTask } from "@/components/dashboard/dashboard-work-plan-table";
import { TaskDetailsModal, type TaskDetails } from "@/components/dashboard/task-details-modal";

export type DashboardKpiCardKey = "planned" | "completed" | "inProgress" | "pending" | "workTime";

export type DashboardKpiCard = {
  key: DashboardKpiCardKey;
  title: string;
  value: string | number;
  href: string;
  icon: ReactNode;
  art: string;
  iconWrap: string;
  card: string;
  border: string;
  accent: string;
  percentage?: number;
};

export type DashboardProgressSummary = {
  planned: number;
  completed: number;
  inProgress: number;
  pending: number;
};

const CHIP_CLASS = "task-chip inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.5625rem] font-semibold";

function statusChipTone(status: "done" | "in_progress" | "pending") {
  if (status === "done") return "done";
  if (status === "in_progress") return "active";
  return "pending";
}

function statusChipLabel(status: "done" | "in_progress" | "pending") {
  if (status === "done") return "Completed";
  if (status === "in_progress") return "In Progress";
  return "Pending";
}

/**
 * Which of today's tasks belong under a given KPI tile.
 *
 * Mirrors the exact same counts the tiles themselves show (countDashboardTaskStats
 * in the filter lib), so the number on the card and the length of the list that
 * opens from it never disagree. Work Time is the one tile that isn't a status
 * bucket — it lists whatever tasks actually banked time today, longest first.
 */
function selectCategoryTasks(key: DashboardKpiCardKey, visibleTasks: DashboardWorkPlanTask[]) {
  if (key === "planned") {
    return sortTasksByRecency(visibleTasks);
  }

  if (key === "workTime") {
    return [...visibleTasks]
      .filter((task) => getTaskDaySeed(task).trackedMinutes > 0)
      .sort(
        (left, right) =>
          getTaskDaySeed(right).trackedMinutes -
          getTaskDaySeed(left).trackedMinutes,
      );
  }

  const targetStatus = key === "completed" ? "done" : key === "inProgress" ? "in_progress" : "pending";
  return sortTasksByRecency(visibleTasks.filter((task) => getTaskStatusForDashboard(task) === targetStatus));
}

export function DashboardKpiCards({
  cards,
  tasks,
  currentUserId,
  progress,
  trailingCard,
}: {
  cards: DashboardKpiCard[];
  tasks: DashboardWorkPlanTask[];
  currentUserId: string;
  progress: DashboardProgressSummary;
  trailingCard?: ReactNode;
}) {
  const [openKey, setOpenKey] = useState<DashboardKpiCardKey | null>(null);
  const [detailsTask, setDetailsTask] = useState<TaskDetails | null>(null);

  const visibleTasks = useMemo(() => filterTodaysWorkPlanTasks(tasks), [tasks]);
  const openCard = cards.find((card) => card.key === openKey) ?? null;
  const categoryTasks = useMemo(
    () => (openKey ? selectCategoryTasks(openKey, visibleTasks) : []),
    [openKey, visibleTasks],
  );

  return (
    <>
      <section className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5 xl:gap-2.5" data-page-section>
        {cards.map((item) => {
          const compactTitle = item.title.replace(" Tasks", "").replace("Actual Work Time", "Work Time");
          const showDonut = item.key === "planned";
          const completedEnd = progress.planned
            ? (progress.completed / progress.planned) * 100
            : 0;
          const inProgressEnd = progress.planned
            ? completedEnd + (progress.inProgress / progress.planned) * 100
            : 0;
          const pendingEnd = progress.planned
            ? inProgressEnd + (progress.pending / progress.planned) * 100
            : 0;
          const percentageTone =
            item.key === "completed"
              ? "text-emerald-600"
              : item.key === "inProgress"
                ? "text-blue-600"
                : item.key === "pending"
                  ? "text-rose-600"
                  : "text-slate-500";

          return (
            <button
              /* No drop shadow: the coloured 42px glow under each card read as a
                 smudge on the background. The tinted border and the accent bar
                 carry the separation on their own. */
              className={`group relative grid min-h-[4rem] min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_2.5rem] items-center gap-2 overflow-hidden rounded-[0.875rem] border p-2 text-left transition hover:-translate-y-0.5 sm:rounded-[1rem] ${item.card} ${item.border}`}
              data-dashboard-card
              key={item.key}
              onClick={() => setOpenKey(item.key)}
              title={`${item.title} · View details`}
              type="button"
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${item.accent}`} />
              <div className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.625rem] ${item.iconWrap}`}>
                {item.icon}
              </div>
              <div className="relative min-w-0">
                {showDonut ? (
                  <p className="truncate text-[0.7rem] font-semibold leading-tight text-slate-700">
                    <span className="sm:hidden">{compactTitle}</span>
                    <span className="hidden sm:inline">{item.title}</span>
                  </p>
                ) : (
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <p className="shrink-0 text-[1.05rem] font-bold leading-none tabular-nums text-slate-900">
                      {item.value}
                    </p>
                    <p className="min-w-0 truncate text-[0.66rem] font-semibold leading-tight text-slate-600">
                      <span className="sm:hidden">{compactTitle}</span>
                      <span className="hidden sm:inline">{item.title}</span>
                    </p>
                  </div>
                )}
                {item.percentage !== undefined ? (
                  <p className={`mt-1 text-[0.6rem] font-bold leading-none tabular-nums ${percentageTone}`}>
                    {item.percentage}% of total
                  </p>
                ) : showDonut ? (
                  <p className="mt-1 truncate text-[0.58rem] font-medium leading-none text-slate-400">
                    Today&apos;s task mix
                  </p>
                ) : null}
              </div>
              {showDonut ? (
                <div
                  aria-hidden
                  className="pointer-events-none relative h-10 w-10 rounded-full p-[5px]"
                  style={{
                    background: progress.planned
                      ? `conic-gradient(#10b981 0 ${completedEnd}%, #3b82f6 ${completedEnd}% ${inProgressEnd}%, #f43f5e ${inProgressEnd}% ${pendingEnd}%, #e2e8f0 ${pendingEnd}% 100%)`
                      : "#e2e8f0",
                  }}
                >
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-[0.68rem] font-extrabold tabular-nums text-slate-900">
                    {item.value}
                  </span>
                </div>
              ) : (
                <div className="pointer-events-none relative h-9 w-10 opacity-90">
                  <Image
                    alt=""
                    aria-hidden
                    className="object-contain object-right-bottom"
                    data-dashboard-float="soft"
                    fill
                    sizes="40px"
                    src={item.art}
                  />
                </div>
              )}
              {showDonut ? (
                <span className="sr-only">
                  {item.value} planned tasks: {progress.completed} completed, {progress.inProgress} in progress, {progress.pending} pending.
                </span>
              ) : null}
            </button>
          );
        })}
        {trailingCard}
      </section>

      <Dialog.Root onOpenChange={(open) => (open ? undefined : setOpenKey(null))} open={Boolean(openCard)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[35] flex max-h-[85vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_40px_90px_rgba(15,23,42,0.34)] outline-none">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--panel-border)] px-5 py-4">
              <div>
                <Dialog.Title className="text-base font-bold text-[var(--foreground)]">{openCard?.title ?? ""}</Dialog.Title>
                <Dialog.Description className="text-xs text-[var(--muted-foreground)]">
                  {categoryTasks.length} task{categoryTasks.length === 1 ? "" : "s"} today
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  aria-label="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--panel-border)] text-[var(--muted-foreground)] transition hover:bg-[var(--panel-muted)]"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="dashboard-scroll-area min-h-0 flex-1 space-y-1.5 p-3">
              {categoryTasks.length ? (
                categoryTasks.map((task) => {
                  const status = getTaskStatusForDashboard(task) as "done" | "in_progress" | "pending";
                  const trackedMinutes = getTaskDaySeed(task).trackedMinutes;

                  return (
                    <button
                      className="task-card flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-[0.75rem] p-2.5 pl-3 text-left transition"
                      data-tone={status === "done" ? "done" : normalizeTaskPriority(task.priority)}
                      key={task.id}
                      onClick={() => setDetailsTask(buildTaskDetails(task, currentUserId))}
                      type="button"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8rem] font-semibold text-[var(--foreground)]">{task.taskTitle}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {isReopenedTask(task.taskDescription) ? (
                            <span className={CHIP_CLASS} data-chip="reopened">
                              Reopened
                            </span>
                          ) : null}
                          {isCarriedOverTask(task) ? (
                            <span className={CHIP_CLASS} data-chip="pending" title={`Still open from ${task.planDate}`}>
                              Carried Over
                            </span>
                          ) : null}
                          <span className={CHIP_CLASS} data-chip={normalizeTaskPriority(task.priority)}>
                            {formatTaskPriority(task.priority)}
                          </span>
                          <span className={CHIP_CLASS} data-chip={statusChipTone(status)}>
                            {statusChipLabel(status)}
                          </span>
                          <span className={CHIP_CLASS} title={task.departmentName}>
                            {task.departmentName}
                          </span>
                        </div>
                      </div>
                      {trackedMinutes > 0 ? (
                        <span className="shrink-0 text-[0.7rem] font-bold tabular-nums text-[var(--muted-foreground)]">
                          {formatMinutes(trackedMinutes)}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                  Nothing here for today.
                </div>
              )}
            </div>

            {openCard ? (
              <div className="shrink-0 border-t border-[var(--panel-border)] px-5 py-3 text-center">
                <Link
                  className="text-xs font-semibold text-[#4f5ef7] hover:text-[#3f4ede]"
                  href={openCard.href}
                  onClick={() => setOpenKey(null)}
                >
                  Open full page
                </Link>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <TaskDetailsModal onOpenChange={(open) => (open ? undefined : setDetailsTask(null))} task={detailsTask} />
    </>
  );
}
