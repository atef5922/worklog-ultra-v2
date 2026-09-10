import { isMovedToHistory } from "@/lib/task-history-shared";
import { extractFollowUpMeta } from "@/lib/task-follow-up";
import { isRecurringTaskDescription } from "@/lib/recurring-task-templates";
import { getNextDhakaMidnightTimestamp } from "@/lib/task-timer-math";
import { parseDhakaDateTime, toDateOnly } from "@/lib/utils";

type WorkPlanTaskUpdate = {
  status: string;
  trackedMinutes?: number;
  note?: string | null;
  reportDate?: Date | string | null;
  updatedAt?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
};

export type WorkPlanTaskLike = {
  id: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  planDate: Date | string;
  createdAt?: Date | string | null;
  updates: WorkPlanTaskUpdate[];
};

export type DashboardWorkPlanFilter =
  | "all"
  | "active"
  | "completed"
  | "in_progress"
  | "pending";

export function matchesDashboardWorkPlanFilter(
  status: "done" | "in_progress" | "pending",
  isRunning: boolean,
  filter: DashboardWorkPlanFilter,
) {
  if (filter === "all") return true;
  if (filter === "active") return status === "in_progress" && isRunning;
  if (filter === "completed") return status === "done";
  return status === filter;
}

/**
 * Generic over the update row, not the task: callers hand in richer rows than
 * WorkPlanTaskUpdate (tracked minutes, actual start/end) and need them back.
 */
export function getTaskUpdateForDate<U extends WorkPlanTaskUpdate>(
  task: { updates: U[] },
  date = toDateOnly(),
): U | null {
  const matchingUpdate = task.updates.find((update) => {
    if (!update.reportDate) {
      return false;
    }

    return toDateOnly(update.reportDate) === date;
  });

  return matchingUpdate ?? null;
}

/**
 * Status may carry into a new day, but daily measurements never do.
 * A paused task therefore remains in progress tomorrow while its timer,
 * start/end fields and note begin as a clean daily entry.
 */
export function getTaskDaySeed<U extends WorkPlanTaskUpdate>(
  task: { updates: U[] },
  date = toDateOnly(),
) {
  const exactUpdate = getTaskUpdateForDate(task, date);
  const inheritedStatus = exactUpdate?.status ?? task.updates[0]?.status ?? "pending";
  const status =
    inheritedStatus === "done" || inheritedStatus === "in_progress"
      ? inheritedStatus
      : "pending";
  const rawStart = exactUpdate?.actualStart ?? null;
  const rawEnd = exactUpdate?.actualEnd ?? null;
  const dayStart = new Date(`${date}T00:00:00+06:00`).getTime();
  const dayEnd = getNextDhakaMidnightTimestamp(date);
  const now = Date.now();
  const startTime = parseDhakaDateTime(rawStart)?.getTime() ?? Number.NaN;
  const endTime = parseDhakaDateTime(rawEnd)?.getTime() ?? Number.NaN;
  const actualStart =
    rawStart &&
    Number.isFinite(startTime) &&
    startTime >= dayStart &&
    startTime < dayEnd &&
    startTime <= now
      ? rawStart
      : null;
  const actualEnd =
    rawEnd &&
    actualStart &&
    Number.isFinite(endTime) &&
    endTime >= startTime &&
    endTime <= dayEnd &&
    endTime <= now
      ? rawEnd
      : null;

  return {
    status,
    trackedMinutes: exactUpdate?.trackedMinutes ?? 0,
    actualStart,
    actualEnd,
    note: exactUpdate?.note ?? null,
    update: exactUpdate,
  } as const;
}

function toTimestamp(value?: Date | string | null) {
  if (!value) {
    return 0;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();

  return Number.isNaN(time) ? 0 : time;
}

/**
 * When the task last moved, which is what the dashboard orders by.
 *
 * The work plan used to be sorted by priority, so a Critical task added first
 * thing in the morning stayed pinned above one started ten minutes ago and the
 * columns never reflected what the day actually looked like. Recency reads the
 * newest signal a task has: the stop, then the start, then whatever else last
 * touched the update row, and finally the task's own creation time for one that
 * has not been worked on yet. Priority still shows on the card, it just no
 * longer decides the order.
 */
export function getTaskActivityTimestamp(task: WorkPlanTaskLike, date = toDateOnly()) {
  const update = getTaskUpdateForDate(task, date);

  return Math.max(
    toTimestamp(update?.actualEnd),
    toTimestamp(update?.actualStart),
    toTimestamp(update?.updatedAt),
    toTimestamp(task.createdAt),
  );
}

/** Newest first; equal timestamps fall back to the title so the order stays stable. */
export function compareTasksByRecency(left: WorkPlanTaskLike, right: WorkPlanTaskLike, date = toDateOnly()) {
  return (
    getTaskActivityTimestamp(right, date) - getTaskActivityTimestamp(left, date) ||
    left.taskTitle.localeCompare(right.taskTitle)
  );
}

/** Copies before sorting: callers hand in server props and React state arrays. */
export function sortTasksByRecency<T extends WorkPlanTaskLike>(tasks: T[], date = toDateOnly()) {
  return [...tasks].sort((left, right) => compareTasksByRecency(left, right, date));
}

export function getTaskStatusLabel(status: string) {
  if (status === "done") return "Completed";
  if (status === "in_progress") return "In Progress";
  return "Pending";
}

export function getTaskStatusForDashboard(task: WorkPlanTaskLike, date = toDateOnly()) {
  return getTaskDaySeed(task, date).status;
}

/** True only when the task has an update row keyed to that exact date — no falling back to the latest one. */
function hasUpdateOnDate(task: WorkPlanTaskLike, date: string) {
  return task.updates.some((update) => update.reportDate && toDateOnly(update.reportDate) === date);
}

/**
 * True for a task whose own plan date is an earlier day — purely descriptive
 * (the "Carried Over" badge), independent of whether it is still open today.
 * A carried task marked done today is still worth labelling as carried, so
 * this does not check status.
 */
export function isCarriedOverTask(task: WorkPlanTaskLike, date = toDateOnly()) {
  return toDateOnly(task.planDate) < date;
}

export function isVisibleInTodaysWorkPlan(task: WorkPlanTaskLike, date = toDateOnly()) {
  if (isMovedToHistory(task.taskDescription)) {
    return false;
  }

  const followUp = extractFollowUpMeta(task.taskDescription);
  if (followUp) {
    if (followUp.scheduledDate > date) {
      return false;
    }

    if (followUp.scheduledDate === date) {
      return true;
    }

    // An unfinished reminder stays actionable after its scheduled day, just
    // like any other pending/in-progress task. A completed reminder remains
    // visible only on a day with its own update.
    return hasUpdateOnDate(task, date) || getTaskStatusForDashboard(task, date) !== "done";
  }

  const isPlannedForToday = toDateOnly(task.planDate) === date;
  if (isPlannedForToday) {
    return true;
  }

  if (isRecurringTaskDescription(task.taskDescription)) {
    // A recurring template may create work repeatedly, but an already-finished
    // occurrence is not itself tomorrow's task. Keep an unfinished occurrence
    // actionable; hide a completed one after its own workday.
    return (
      hasUpdateOnDate(task, date) ||
      getTaskStatusForDashboard(task, date) !== "done"
    );
  }

  if (!isCarriedOverTask(task, date)) {
    return false;
  }

  // Whatever never got finished on its own day is still open work — carrying
  // it into today is what stops the dashboard from quietly losing it the
  // moment the calendar rolls over. Once it picks up an update row dated
  // today (started, paused, or finished today) it stays visible regardless
  // of status, so marking it done moves it into Complete Task instead of
  // making it vanish — only a task nobody touched today, and that was
  // already finished on some earlier day, drops back out.
  return hasUpdateOnDate(task, date) || getTaskStatusForDashboard(task, date) !== "done";
}

export function filterTodaysWorkPlanTasks<T extends WorkPlanTaskLike>(tasks: T[], date = toDateOnly()) {
  return tasks.filter((task) => isVisibleInTodaysWorkPlan(task, date));
}

export function countDashboardTaskStats(tasks: WorkPlanTaskLike[], date = toDateOnly()) {
  const visibleTasks = filterTodaysWorkPlanTasks(tasks, date);

  const completedTasks = visibleTasks.filter((task) => getTaskStatusForDashboard(task, date) === "done").length;
  const inProgressTasks = visibleTasks.filter((task) => getTaskStatusForDashboard(task, date) === "in_progress").length;
  const pendingTasks = visibleTasks.filter((task) => getTaskStatusForDashboard(task, date) === "pending").length;

  return {
    visibleTasks,
    plannedTasks: visibleTasks.length,
    completedTasks,
    inProgressTasks,
    pendingTasks,
  };
}
