"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { ListChecks, LockKeyhole, RotateCcw, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  DashboardInlineTaskCell,
  type DashboardEditableTaskField,
} from "@/components/dashboard/dashboard-inline-task-cell";
import { PanelHeader } from "@/components/dashboard/panel-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DashboardTaskTimerAction,
  type TaskTimerSnapshot,
} from "@/components/dashboard/dashboard-task-timer-action";
import { TaskAutoStopNoteModal } from "@/components/dashboard/task-auto-stop-note-modal";
import {
  TaskCompleteModal,
  type TaskCompletionPayload,
} from "@/components/dashboard/task-complete-modal";
import {
  TaskDetailsModal,
  type TaskDetails,
} from "@/components/dashboard/task-details-modal";
import { TaskReopenModal } from "@/components/dashboard/task-reopen-modal";
import type { DashboardWorkPlanTask } from "@/components/dashboard/dashboard-work-plan-section";
import {
  DASHBOARD_TASKS_CREATED_EVENT,
  type DashboardLiveTask,
} from "@/lib/dashboard-live-events";
import {
  readPendingTaskAutoStopNotes,
  removePendingTaskAutoStopNote,
  TASK_AUTO_STOP_NOTE_EVENT,
  type TaskAutoStopNotePayload,
} from "@/lib/task-auto-stop-note";
import {
  countDashboardTaskStats,
  filterTodaysWorkPlanTasks,
  getTaskDaySeed,
  getTaskStatusForDashboard,
  getTaskStatusLabel,
  isCarriedOverTask,
  matchesDashboardWorkPlanFilter,
  type DashboardWorkPlanFilter,
} from "@/lib/dashboard-work-plan-filter";
import {
  buildContinuationOverview,
  extractContinuationMeta,
} from "@/lib/task-continuation";
import { replaceReadableTaskDescription } from "@/lib/task-description-edit";
import { extractFollowUpMeta } from "@/lib/task-follow-up";
import { getReadableTaskDescription } from "@/lib/report-summary";
import {
  formatTaskPriority,
  normalizeTaskPriority,
  TASK_PRIORITY_OPTIONS,
  type TaskPriority,
} from "@/lib/task-priority";
import {
  embedReopenMeta,
  isReopenedTask,
  stripReopenMeta,
} from "@/lib/task-reopen";
import { formatTimeOnlyInDhaka, toDateOnly } from "@/lib/utils";

export type { DashboardWorkPlanTask } from "@/components/dashboard/dashboard-work-plan-section";

type DashboardWorkPlanSectionProps = {
  tasks: DashboardWorkPlanTask[];
  canEdit: boolean;
  attendanceRunning: boolean;
  currentUserId: string;
  formattedDate: string;
  onStatsChange?: (stats: {
    plannedTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    visibleTaskIds: string[];
  }) => void;
};

type TaskUpdate = DashboardWorkPlanTask["updates"][number];

const FILTER_LABELS: Array<{ key: DashboardWorkPlanFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "in_progress", label: "In Progress" },
  { key: "pending", label: "Pending" },
];

const TABLE_CELL_CLASS =
  "border-b border-r border-[var(--workplan-grid)] px-2 py-1.5 align-middle last:border-r-0";
const TABLE_HEAD_CLASS =
  "sticky top-0 z-10 border-b border-r border-[var(--workplan-grid)] bg-[var(--workplan-head)] px-2 py-2 text-left text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[var(--workplan-head-text)] last:border-r-0";

function parseResponse(raw: string) {
  try {
    return raw
      ? (JSON.parse(raw) as {
          message?: string;
          task?: {
            id: string;
            taskTitle: string;
            taskDescription: string | null;
            priority: string;
          };
        })
      : { message: "Task update failed." };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

function formatTrackedMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(
    safeMinutes % 60,
  ).padStart(2, "0")}m`;
}

function formatDashboardTime(value?: string | null) {
  if (!value) return "--:--";
  const formatted = formatTimeOnlyInDhaka(value);
  return formatted === "Not set" ? "--:--" : formatted;
}

function upsertTaskDayUpdate(
  task: DashboardWorkPlanTask,
  reportDate: string,
  patch: Partial<TaskUpdate> & Pick<TaskUpdate, "status">,
) {
  const exactIndex = task.updates.findIndex(
    (update) =>
      update.reportDate && toDateOnly(update.reportDate) === reportDate,
  );
  const seed = getTaskDaySeed(task, reportDate);
  const baseUpdate: TaskUpdate =
    exactIndex >= 0
      ? task.updates[exactIndex]
      : {
          status: seed.status,
          trackedMinutes: seed.trackedMinutes,
          actualStart: seed.actualStart ? String(seed.actualStart) : null,
          actualEnd: seed.actualEnd ? String(seed.actualEnd) : null,
          note: seed.note,
          reportDate,
        };
  const nextUpdate: TaskUpdate = {
    ...baseUpdate,
    ...patch,
    reportDate,
    updatedAt: new Date().toISOString(),
  };
  const remaining = task.updates.filter((_, index) => index !== exactIndex);
  return { ...task, updates: [nextUpdate, ...remaining] };
}

function emitDashboardStats(
  allTasks: DashboardWorkPlanTask[],
  onStatsChange?: DashboardWorkPlanSectionProps["onStatsChange"],
) {
  const stats = countDashboardTaskStats(allTasks);
  const detail = {
    plannedTasks: stats.plannedTasks,
    completedTasks: stats.completedTasks,
    inProgressTasks: stats.inProgressTasks,
    pendingTasks: stats.pendingTasks,
    visibleTaskIds: stats.visibleTasks.map((task) => task.id),
  };

  onStatsChange?.(detail);
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent("dashboard:stats-updated", { detail }),
      );
    });
  }
}

function getStatusMeta(
  status: "done" | "in_progress" | "pending",
  isLive: boolean,
) {
  if (status === "done") {
    return {
      label: "Completed",
      className: "border-teal-200/90 bg-teal-50/80 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-200",
    };
  }
  if (isLive) {
    return {
      label: "Active",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200",
    };
  }
  if (status === "in_progress") {
    return {
      label: "In Progress",
      className: "border-sky-200/90 bg-sky-50/80 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200",
    };
  }
  return {
    label: "Pending",
    className: "border-amber-200/90 bg-amber-50/80 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
  };
}

function getPriorityClass(priority: string) {
  const normalized = normalizeTaskPriority(priority);
  if (normalized === "critical") {
    return "border-rose-200/80 bg-rose-50/75 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200";
  }
  if (normalized === "high") {
    return "border-orange-200/90 bg-orange-50/75 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-200";
  }
  if (normalized === "low") {
    return "border-teal-200/90 bg-teal-50/75 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-200";
  }
  return "border-blue-200/80 bg-blue-50/70 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200";
}

function getFilterButtonClass(
  filter: DashboardWorkPlanFilter,
  selected: boolean,
) {
  if (selected) {
    const selectedTone = {
      all: "border-indigo-700 bg-indigo-700",
      active: "border-emerald-700 bg-emerald-700",
      completed: "border-teal-700 bg-teal-700",
      in_progress: "border-sky-700 bg-sky-700",
      pending: "border-amber-700 bg-amber-700",
    }[filter];

    return `${selectedTone} !text-white shadow-[0_5px_12px_rgba(15,23,42,0.14)]`;
  }

  const hoverTone = {
    all: "hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200",
    active: "hover:border-emerald-200 hover:bg-emerald-50/70 hover:text-emerald-700 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200",
    completed: "hover:border-teal-200 hover:bg-teal-50/70 hover:text-teal-700 dark:hover:border-teal-500/40 dark:hover:bg-teal-500/10 dark:hover:text-teal-200",
    in_progress: "hover:border-sky-200 hover:bg-sky-50/70 hover:text-sky-700 dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10 dark:hover:text-sky-200",
    pending: "hover:border-amber-200 hover:bg-amber-50/70 hover:text-amber-700 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-200",
  }[filter];

  return `border-slate-200 bg-white text-slate-600 ${hoverTone} dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300`;
}

type TaskTimerActionWrapperProps = {
  task: DashboardWorkPlanTask;
  canEdit: boolean;
  attendanceRunning: boolean;
  onDoneClick: (taskId: string) => void;
  onSnapshotChange: (
    taskId: string,
    snapshot: TaskTimerSnapshot,
    snapshotReportDate: string,
  ) => void;
};

function TaskTimerActionWrapper({
  task,
  canEdit,
  attendanceRunning,
  onDoneClick,
  onSnapshotChange,
}: TaskTimerActionWrapperProps) {
  const reportDate = toDateOnly();
  const seed = getTaskDaySeed(task, reportDate);
  const handleDone = useCallback(
    () => onDoneClick(task.id),
    [onDoneClick, task.id],
  );
  const handleSnapshot = useCallback(
    (snapshot: TaskTimerSnapshot) =>
      onSnapshotChange(task.id, snapshot, reportDate),
    [onSnapshotChange, reportDate, task.id],
  );

  return (
    <DashboardTaskTimerAction
      key={`${task.id}:${reportDate}`}
      canEdit={canEdit}
      compact
      initialActualEnd={seed.actualEnd}
      initialActualStart={seed.actualStart}
      initialAttendanceRunning={attendanceRunning}
      initialStatus={seed.status}
      initialTrackedMinutes={seed.trackedMinutes}
      onDoneClick={handleDone}
      onSnapshotChange={handleSnapshot}
      reportDate={reportDate}
      taskId={task.id}
      taskTitle={task.taskTitle}
      variant="table"
    />
  );
}

export function buildTaskDetails(
  task: DashboardWorkPlanTask,
  currentUserId: string,
): TaskDetails {
  const status = getTaskStatusForDashboard(task) as
    | "done"
    | "in_progress"
    | "pending";
  const seed = getTaskDaySeed(task);

  return {
    id: task.id,
    taskTitle: task.taskTitle,
    description: getReadableTaskDescription(task.taskDescription),
    priority: task.priority,
    status,
    statusLabel: getTaskStatusLabel(status),
    departmentName: task.departmentName,
    planDate: task.planDate,
    trackedMinutes: seed.trackedMinutes,
    actualStart: seed.actualStart ? String(seed.actualStart) : null,
    actualEnd: seed.actualEnd ? String(seed.actualEnd) : null,
    note: seed.note,
    isFollowUp: Boolean(extractFollowUpMeta(task.taskDescription)),
    isContinued: Boolean(extractContinuationMeta(task.taskDescription)),
    isReopened: isReopenedTask(task.taskDescription),
    isCarriedOver: isCarriedOverTask(task),
    isAssigned: Boolean(task.assignedBy) && task.userId === currentUserId,
    continuation: buildContinuationOverview({
      taskDescription: task.taskDescription,
      currentDate: task.planDate,
      currentProgress: status === "done" ? 100 : 0,
      currentTrackedMinutes: seed.trackedMinutes,
      currentNote: seed.note,
    }),
  };
}

export function DashboardWorkPlanSection({
  tasks: initialTasks,
  canEdit,
  attendanceRunning,
  currentUserId,
  formattedDate,
  onStatsChange,
}: DashboardWorkPlanSectionProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedFilter, setSelectedFilter] =
    useState<DashboardWorkPlanFilter>("all");
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [detailsTask, setDetailsTask] = useState<TaskDetails | null>(null);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [autoStopQueue, setAutoStopQueue] = useState<TaskAutoStopNotePayload[]>(
    () =>
      typeof window === "undefined" ? [] : readPendingTaskAutoStopNotes(),
  );
  const [savingAutoStopNote, setSavingAutoStopNote] = useState(false);
  const [reopeningTaskId, setReopeningTaskId] = useState<string | null>(null);
  const [reopenDialogTaskId, setReopenDialogTaskId] = useState<string | null>(
    null,
  );
  const [savingPriorityTaskId, setSavingPriorityTaskId] = useState<
    string | null
  >(null);
  const timerSnapshotsRef = useRef<Record<string, TaskTimerSnapshot>>({});
  const [liveTaskIds, setLiveTaskIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handle = window.setTimeout(() => setTasks(initialTasks), 0);
    return () => window.clearTimeout(handle);
  }, [initialTasks]);

  useEffect(() => {
    emitDashboardStats(tasks, onStatsChange);
  }, [onStatsChange, tasks]);

  useEffect(() => {
    function handleTasksCreated(event: Event) {
      const createdTasks =
        (event as CustomEvent<{ tasks?: DashboardLiveTask[] }>).detail?.tasks ??
        [];
      if (!createdTasks.length) return;

      setTasks((current) => {
        const currentIds = new Set(current.map((task) => task.id));
        return [
          ...createdTasks
            .filter((task) => !currentIds.has(task.id))
            .map((task) => ({
              ...task,
              updates: [],
              latestReview: null,
              createdAt: new Date().toISOString(),
            })),
          ...current,
        ];
      });
    }

    window.addEventListener(DASHBOARD_TASKS_CREATED_EVENT, handleTasksCreated);
    return () =>
      window.removeEventListener(
        DASHBOARD_TASKS_CREATED_EVENT,
        handleTasksCreated,
      );
  }, []);

  useEffect(() => {
    function handleAutoStopNoteNeeded(event: Event) {
      const detail = (event as CustomEvent<TaskAutoStopNotePayload>).detail;
      if (!detail?.taskId || !detail.reportDate) return;

      setAutoStopQueue((current) =>
        [
          ...current.filter(
            (entry) =>
              entry.taskId !== detail.taskId ||
              entry.reportDate !== detail.reportDate,
          ),
          detail,
        ].sort((left, right) => left.timestamp - right.timestamp),
      );
    }

    window.addEventListener(
      TASK_AUTO_STOP_NOTE_EVENT,
      handleAutoStopNoteNeeded,
    );
    return () =>
      window.removeEventListener(
        TASK_AUTO_STOP_NOTE_EVENT,
        handleAutoStopNoteNeeded,
      );
  }, []);

  const handleSnapshotChange = useCallback(
    (
      taskId: string,
      snapshot: TaskTimerSnapshot,
      snapshotReportDate: string,
    ) => {
      timerSnapshotsRef.current = {
        ...timerSnapshotsRef.current,
        [taskId]: snapshot,
      };

      const isRunning = Boolean(snapshot.runningStartedAt);
      setLiveTaskIds((current) =>
        Boolean(current[taskId]) === isRunning
          ? current
          : { ...current, [taskId]: isRunning },
      );

      setTasks((current) => {
        const task = current.find((item) => item.id === taskId);
        if (!task) return current;
        const seed = getTaskDaySeed(task, snapshotReportDate);
        const trackedMinutes = Number(snapshot.trackedMinutes || 0);
        const same =
          seed.status === snapshot.status &&
          seed.trackedMinutes === trackedMinutes &&
          (seed.actualStart ?? "") === snapshot.actualStart &&
          (seed.actualEnd ?? "") === snapshot.actualEnd;
        if (same) return current;

        return current.map((item) =>
          item.id === taskId
            ? upsertTaskDayUpdate(item, snapshotReportDate, {
                status: snapshot.status,
                trackedMinutes,
                actualStart: snapshot.actualStart || null,
                actualEnd: snapshot.actualEnd || null,
              })
            : item,
        );
      });
    },
    [],
  );

  const visibleTasks = useMemo(() => {
    const filtered = filterTodaysWorkPlanTasks(tasks);
    const originalOrder = new Map(
      filtered.map((task, index) => [task.id, index]),
    );

    function taskRank(task: DashboardWorkPlanTask) {
      const status = getTaskStatusForDashboard(task);
      if (status === "in_progress" && liveTaskIds[task.id]) return 0;
      if (status === "in_progress") return 1;
      if (status === "pending") return 2;
      return 3;
    }

    return [...filtered].sort((left, right) => {
      const leftRank = taskRank(left);
      const rightRank = taskRank(right);
      if (leftRank !== rightRank) return leftRank - rightRank;

      if (leftRank === 0) {
        const leftStartedAt = new Date(
          timerSnapshotsRef.current[left.id]?.runningStartedAt ?? "",
        ).getTime();
        const rightStartedAt = new Date(
          timerSnapshotsRef.current[right.id]?.runningStartedAt ?? "",
        ).getTime();
        const safeLeftStartedAt = Number.isFinite(leftStartedAt)
          ? leftStartedAt
          : 0;
        const safeRightStartedAt = Number.isFinite(rightStartedAt)
          ? rightStartedAt
          : 0;
        if (safeLeftStartedAt !== safeRightStartedAt) {
          return safeRightStartedAt - safeLeftStartedAt;
        }
      }

      return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
    });
  }, [liveTaskIds, tasks]);

  const filterCounts = useMemo(() => {
    const counts: Record<DashboardWorkPlanFilter, number> = {
      all: visibleTasks.length,
      active: 0,
      completed: 0,
      in_progress: 0,
      pending: 0,
    };

    for (const task of visibleTasks) {
      const status = getTaskStatusForDashboard(task);
      if (status === "done") counts.completed += 1;
      if (status === "in_progress") counts.in_progress += 1;
      if (status === "pending") counts.pending += 1;
      if (status === "in_progress" && liveTaskIds[task.id]) {
        counts.active += 1;
      }
    }
    return counts;
  }, [liveTaskIds, visibleTasks]);

  const rowMatchesFilter = useCallback(
    (task: DashboardWorkPlanTask) => {
      const status = getTaskStatusForDashboard(task);
      return matchesDashboardWorkPlanFilter(
        status,
        Boolean(liveTaskIds[task.id]),
        selectedFilter,
      );
    },
    [liveTaskIds, selectedFilter],
  );

  const matchingTasks = useMemo(
    () => visibleTasks.filter(rowMatchesFilter),
    [rowMatchesFilter, visibleTasks],
  );
  const serialByTaskId = useMemo(
    () =>
      new Map(matchingTasks.map((task, index) => [task.id, index + 1])),
    [matchingTasks],
  );

  const completingTask =
    tasks.find((task) => task.id === completeTaskId) ?? null;
  const reopenDialogTask =
    tasks.find((task) => task.id === reopenDialogTaskId) ?? null;
  const reopenDialogSeed = reopenDialogTask
    ? getTaskDaySeed(reopenDialogTask)
    : null;
  const activeAutoStopPrompt = autoStopQueue[0] ?? null;
  const activeAutoStopTask = activeAutoStopPrompt
    ? tasks.find((task) => task.id === activeAutoStopPrompt.taskId) ?? null
    : null;

  async function saveTaskField(
    task: DashboardWorkPlanTask,
    field: DashboardEditableTaskField,
    nextValue: string,
  ) {
    const previousValue =
      field === "taskTitle" ? task.taskTitle : task.taskDescription ?? "";
    const optimisticValue =
      field === "taskDescription"
        ? replaceReadableTaskDescription(task.taskDescription, nextValue)
        : nextValue;

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, [field]: optimisticValue } : item,
      ),
    );

    const rollback = () =>
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, [field]: previousValue } : item,
        ),
      );

    try {
      const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: nextValue }),
      });
      const result = parseResponse(await response.text());

      if (!response.ok) {
        rollback();
        toast.error(result.message ?? "Could not update task.");
        return false;
      }

      if (result.task) {
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  taskTitle: result.task?.taskTitle ?? item.taskTitle,
                  taskDescription:
                    result.task?.taskDescription ?? item.taskDescription,
                  priority: result.task?.priority ?? item.priority,
                }
              : item,
          ),
        );
      }
      toast.success(
        field === "taskTitle" ? "Title updated." : "Description updated.",
      );
      return true;
    } catch {
      rollback();
      toast.error("Could not update task. Check your connection and try again.");
      return false;
    }
  }

  async function saveTaskPriority(
    task: DashboardWorkPlanTask,
    nextPriority: TaskPriority,
  ) {
    const previousPriority = task.priority;
    if (normalizeTaskPriority(previousPriority) === nextPriority) return;

    setSavingPriorityTaskId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, priority: nextPriority } : item,
      ),
    );

    try {
      const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: nextPriority }),
      });
      const result = parseResponse(await response.text());

      if (!response.ok) {
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? { ...item, priority: previousPriority }
              : item,
          ),
        );
        toast.error(result.message ?? "Could not update task priority.");
        return;
      }

      if (result.task) {
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  taskTitle: result.task?.taskTitle ?? item.taskTitle,
                  taskDescription:
                    result.task?.taskDescription ?? item.taskDescription,
                  priority: result.task?.priority ?? item.priority,
                }
              : item,
          ),
        );
      }
      toast.success("Priority updated.");
    } catch {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, priority: previousPriority } : item,
        ),
      );
      toast.error(
        "Could not update task priority. Check your connection and try again.",
      );
    } finally {
      setSavingPriorityTaskId((current) =>
        current === task.id ? null : current,
      );
    }
  }

  async function reopenCompletedTask(
    task: DashboardWorkPlanTask,
    reopenReason: string,
  ) {
    if (reopeningTaskId) return;

    setReopeningTaskId(task.id);
    try {
      const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reopen_task",
          reportDate: toDateOnly(),
          reopenReason,
        }),
      });
      const result = parseResponse(await response.text());

      if (!response.ok) {
        toast.error(result.message ?? "Could not reopen task.");
        return;
      }

      setReopenDialogTaskId(null);
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? upsertTaskDayUpdate(
                {
                  ...item,
                  taskDescription: embedReopenMeta(item.taskDescription),
                },
                toDateOnly(),
                {
                  status: "in_progress",
                  note: `Reopened: ${reopenReason}`,
                  actualEnd: null,
                },
              )
            : item,
        ),
      );
      toast.success(result.message ?? "Task reopened.");
      router.refresh();
    } catch {
      toast.error("Could not reopen task. Check your connection and try again.");
    } finally {
      setReopeningTaskId(null);
    }
  }

  function markTaskCompleted(taskId: string, snapshot?: TaskTimerSnapshot) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        const seed = getTaskDaySeed(task);
        const description = isReopenedTask(task.taskDescription)
          ? stripReopenMeta(task.taskDescription) || null
          : task.taskDescription;

        return upsertTaskDayUpdate(
          { ...task, taskDescription: description },
          toDateOnly(),
          {
            status: "done",
            trackedMinutes: Number(
              snapshot?.trackedMinutes ?? seed.trackedMinutes,
            ),
            actualStart:
              snapshot?.actualStart ||
              (seed.actualStart ? String(seed.actualStart) : null),
            actualEnd:
              snapshot?.actualEnd ||
              (seed.actualEnd ? String(seed.actualEnd) : null),
          },
        );
      }),
    );
    setLiveTaskIds((current) => ({ ...current, [taskId]: false }));
  }

  function dismissAutoStopPrompt(taskId: string, reportDate: string) {
    removePendingTaskAutoStopNote(reportDate, taskId);
    setAutoStopQueue((current) =>
      current.filter(
        (entry) =>
          entry.taskId !== taskId || entry.reportDate !== reportDate,
      ),
    );
  }

  async function handleCompleteSave(payload: TaskCompletionPayload) {
    if (!completingTask) return;

    const snapshot = timerSnapshotsRef.current[completingTask.id];
    const seed = getTaskDaySeed(completingTask);
    setSavingCompletion(true);
    const response = await fetch(
      `/api/dashboard/tasks/${completingTask.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_task",
          reportDate: toDateOnly(),
          completionStatus: payload.completionStatus,
          completionNote: payload.completionNote,
          needFollowUp: payload.needFollowUp,
          followUpDate: payload.followUpDate,
          followUpTime: payload.followUpTime,
          followUpNote: payload.followUpNote,
          trackedMinutes: Number(
            snapshot?.trackedMinutes ?? seed.trackedMinutes,
          ),
          actualStart:
            snapshot?.actualStart ||
            (seed.actualStart ? String(seed.actualStart) : ""),
          actualEnd:
            snapshot?.actualEnd ||
            (seed.actualEnd ? String(seed.actualEnd) : ""),
        }),
      },
    );
    const result = parseResponse(await response.text());
    setSavingCompletion(false);

    if (!response.ok) {
      toast.error(result.message ?? "Could not complete task.");
      return;
    }

    toast.success(result.message ?? "Task completed.");
    setCompleteTaskId(null);
    markTaskCompleted(completingTask.id, snapshot);
    router.refresh();
  }

  async function handleAutoStopNoteSave(note: string) {
    if (!activeAutoStopPrompt) return;

    const currentTask =
      tasks.find((task) => task.id === activeAutoStopPrompt.taskId) ??
      activeAutoStopTask;
    const seed = currentTask
      ? getTaskDaySeed(currentTask, activeAutoStopPrompt.reportDate)
      : null;
    const snapshot = timerSnapshotsRef.current[activeAutoStopPrompt.taskId];
    const nextStatus = snapshot?.status ?? seed?.status ?? "in_progress";
    const nextTrackedMinutes = Math.max(
      0,
      Number(
        snapshot?.trackedMinutes ??
          activeAutoStopPrompt.trackedMinutes ??
          seed?.trackedMinutes ??
          0,
      ),
    );
    const nextActualStart =
      snapshot?.actualStart ||
      activeAutoStopPrompt.actualStart ||
      (seed?.actualStart ? String(seed.actualStart) : "");
    const nextActualEnd =
      snapshot?.actualEnd ||
      activeAutoStopPrompt.actualEnd ||
      (seed?.actualEnd ? String(seed.actualEnd) : "");

    setSavingAutoStopNote(true);
    const response = await fetch("/api/dashboard/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDate: activeAutoStopPrompt.reportDate,
        updates: [
          {
            dailyTaskId: activeAutoStopPrompt.taskId,
            status: nextStatus,
            note,
            completionPercent: nextStatus === "done" ? 100 : 0,
            trackedMinutes: nextTrackedMinutes,
            actualStart: nextActualStart,
            actualEnd: nextActualEnd,
            difficultyLevel: "",
          },
        ],
      }),
    });
    const result = parseResponse(await response.text());
    setSavingAutoStopNote(false);

    if (!response.ok) {
      toast.error(result.message ?? "Could not save auto-stop note.");
      return;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === activeAutoStopPrompt.taskId
          ? upsertTaskDayUpdate(task, activeAutoStopPrompt.reportDate, {
              status: nextStatus,
              trackedMinutes: nextTrackedMinutes,
              actualStart: nextActualStart || null,
              actualEnd: nextActualEnd || null,
              note,
            })
          : task,
      ),
    );
    toast.success("Auto-stop note saved.");
    dismissAutoStopPrompt(
      activeAutoStopPrompt.taskId,
      activeAutoStopPrompt.reportDate,
    );
  }

  return (
    <>
      <Tooltip.Provider delayDuration={350}>
        <section
          className="dashboard-accent accent-indigo flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.15rem] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow)]"
          data-dashboard-panel
        >
          <div className="shrink-0 border-b border-[var(--panel-border)] px-3 py-2">
            <div className="flex min-w-0 flex-col gap-2 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
              <div className="min-w-0 shrink-0">
                <PanelHeader
                  action={
                    <span className="hidden max-w-[12rem] truncate text-[0.66rem] font-medium text-[var(--muted-foreground)] sm:block">
                      {formattedDate}
                    </span>
                  }
                  icon={ListChecks}
                  title="Today's Work Plan"
                />
              </div>
              <div
                aria-label="Filter today's tasks"
                className="dashboard-filter-scroll flex min-w-0 items-center gap-1 overflow-x-auto"
                role="group"
              >
                {FILTER_LABELS.map((filter) => {
                  const selected = selectedFilter === filter.key;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[0.63rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/35 ${getFilterButtonClass(filter.key, selected)}`}
                      key={filter.key}
                      onClick={() => setSelectedFilter(filter.key)}
                      type="button"
                    >
                      {filter.label}
                      <span
                        className={`tabular-nums ${
                          selected
                            ? "!text-white"
                            : "text-[var(--foreground)]"
                        }`}
                      >
                        ({filterCounts[filter.key]})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="dashboard-workplan-table-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]">
            <table className="w-full min-w-[69.3rem] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[3rem]" />
                <col className="w-[11.5rem]" />
                <col className="w-[15rem]" />
                <col className="w-[6rem]" />
                <col className="w-[7.2rem]" />
                <col className="w-[8.3rem]" />
                <col className="w-[5.7rem]" />
                <col className="w-[6.4rem]" />
                <col className="w-[6.2rem]" />
              </colgroup>
              <thead>
                <tr>
                  <th className={TABLE_HEAD_CLASS} scope="col">SL</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Title</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Description</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Priority</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Status</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Start / Pause</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Done</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">Start Time</th>
                  <th className={TABLE_HEAD_CLASS} scope="col">End Time</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task) => {
                  const status = getTaskStatusForDashboard(task) as
                    | "done"
                    | "in_progress"
                    | "pending";
                  const isLive =
                    status === "in_progress" &&
                    Boolean(liveTaskIds[task.id]);
                  const statusMeta = getStatusMeta(status, isLive);
                  const seed = getTaskDaySeed(task);
                  const matches = rowMatchesFilter(task);
                  const assignedToCurrentUser =
                    Boolean(task.assignedBy) && task.userId === currentUserId;
                  const inlineEditable =
                    canEdit && status !== "done" && !assignedToCurrentUser;
                  const openDetails = () =>
                    setDetailsTask(buildTaskDetails(task, currentUserId));

                  return (
                    <tr
                      className="group/row transition-colors"
                      data-live={isLive ? "true" : undefined}
                      data-status={status}
                      hidden={!matches}
                      key={task.id}
                    >
                      <td className={`${TABLE_CELL_CLASS} text-center`}>
                        <button
                          aria-label={`Open details for ${task.taskTitle}`}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)] transition hover:bg-[#4f5ef7]/10 hover:text-[#4f5ef7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f5ef7]/35"
                          onClick={openDetails}
                          title="Open task details"
                          type="button"
                        >
                          {serialByTaskId.get(task.id)}
                        </button>
                      </td>
                      <td className={TABLE_CELL_CLASS}>
                        <div className="flex min-w-0 items-center gap-1">
                          {assignedToCurrentUser ? (
                            <LockKeyhole
                              aria-label="Assigned task title is read-only"
                              className="h-3 w-3 shrink-0 text-slate-400"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <DashboardInlineTaskCell
                              editable={inlineEditable}
                              field="taskTitle"
                              onCommit={(value) =>
                                saveTaskField(task, "taskTitle", value)
                              }
                              onOpenDetails={openDetails}
                              value={task.taskTitle}
                            />
                          </div>
                        </div>
                      </td>
                      <td className={TABLE_CELL_CLASS}>
                        <DashboardInlineTaskCell
                          editable={inlineEditable}
                          field="taskDescription"
                          onCommit={(value) =>
                            saveTaskField(task, "taskDescription", value)
                          }
                          onOpenDetails={openDetails}
                          value={getReadableTaskDescription(
                            task.taskDescription,
                          )}
                        />
                      </td>
                      <td className={`${TABLE_CELL_CLASS} text-center`}>
                        {inlineEditable ? (
                          <Select
                            disabled={savingPriorityTaskId !== null}
                            onValueChange={(value) =>
                              void saveTaskPriority(
                                task,
                                normalizeTaskPriority(value),
                              )
                            }
                            value={normalizeTaskPriority(task.priority)}
                          >
                            <SelectTrigger
                              aria-label={`Change priority for ${task.taskTitle}`}
                              className={`mx-auto h-7 w-auto min-w-[5rem] max-w-full justify-center gap-1 rounded-full border px-2 py-0 text-[0.56rem] font-bold uppercase tracking-[0.06em] shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400/35 disabled:cursor-wait disabled:opacity-60 ${getPriorityClass(
                                task.priority,
                              )}`}
                              title="Click to change priority"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                              align="center"
                              className="min-w-[8rem] rounded-xl"
                              position="popper"
                              sideOffset={5}
                            >
                              {TASK_PRIORITY_OPTIONS.map((option) => (
                                <SelectItem
                                  className="text-[0.72rem] font-semibold"
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.06em] ${getPriorityClass(
                              task.priority,
                            )}`}
                            title={formatTaskPriority(task.priority)}
                          >
                            <span className="truncate">
                              {formatTaskPriority(task.priority)}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className={`${TABLE_CELL_CLASS} text-center`}>
                        <span
                          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[0.58rem] font-semibold ${statusMeta.className}`}
                        >
                          {isLive ? (
                            <span className="task-live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.13)]" />
                          ) : null}
                          <span className="truncate">{statusMeta.label}</span>
                        </span>
                      </td>
                      {status === "done" ? (
                        <>
                          <td className={TABLE_CELL_CLASS}>
                            <span
                              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/80 px-2 py-1 text-[0.62rem] font-semibold tabular-nums text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-200"
                              title="Tracked time"
                            >
                              <Timer className="h-3 w-3 shrink-0" />
                              {formatTrackedMinutes(seed.trackedMinutes)}
                            </span>
                          </td>
                          <td className={`${TABLE_CELL_CLASS} text-center`}>
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2 text-[0.6rem] font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/35 disabled:cursor-wait disabled:opacity-60 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200 dark:hover:bg-indigo-400/15"
                              disabled={Boolean(reopeningTaskId)}
                              onClick={() => setReopenDialogTaskId(task.id)}
                              title="Reopen this completed task"
                              type="button"
                            >
                              <RotateCcw
                                className={`h-3 w-3 ${
                                  reopeningTaskId === task.id
                                    ? "animate-spin"
                                    : ""
                                }`}
                              />
                              Reopen
                            </button>
                          </td>
                          <td
                            className={`${TABLE_CELL_CLASS} text-center text-[0.67rem] font-semibold tabular-nums text-[var(--muted-foreground)]`}
                          >
                            {formatDashboardTime(
                              seed.actualStart
                                ? String(seed.actualStart)
                                : null,
                            )}
                          </td>
                          <td
                            className={`${TABLE_CELL_CLASS} text-center text-[0.67rem] font-semibold tabular-nums text-[var(--muted-foreground)]`}
                          >
                            {formatDashboardTime(
                              seed.actualEnd ? String(seed.actualEnd) : null,
                            )}
                          </td>
                        </>
                      ) : (
                        <TaskTimerActionWrapper
                          attendanceRunning={attendanceRunning}
                          canEdit={canEdit}
                          onDoneClick={setCompleteTaskId}
                          onSnapshotChange={handleSnapshotChange}
                          task={task}
                        />
                      )}
                    </tr>
                  );
                })}
                {!matchingTasks.length ? (
                  <tr>
                    <td
                      className="px-6 py-10 text-center text-[0.78rem] font-medium text-[var(--muted-foreground)]"
                      colSpan={9}
                    >
                      {visibleTasks.length
                        ? `No ${FILTER_LABELS.find(
                            (item) => item.key === selectedFilter,
                          )?.label.toLowerCase()} tasks right now.`
                        : "No tasks added yet. Use Add Task to create today's work plan."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </Tooltip.Provider>

      <TaskDetailsModal
        onOpenChange={(open) => {
          if (!open) setDetailsTask(null);
        }}
        task={detailsTask}
      />
      <TaskCompleteModal
        onOpenChange={(open) => {
          if (!open) setCompleteTaskId(null);
        }}
        onSave={handleCompleteSave}
        open={Boolean(completeTaskId)}
        saving={savingCompletion}
        taskTitle={completingTask?.taskTitle ?? ""}
      />
      <TaskReopenModal
        actualEnd={
          reopenDialogSeed?.actualEnd
            ? String(reopenDialogSeed.actualEnd)
            : null
        }
        completionNote={reopenDialogSeed?.note}
        onOpenChange={(open) => {
          if (!open && !reopeningTaskId) setReopenDialogTaskId(null);
        }}
        onSave={(reason) =>
          reopenDialogTask
            ? reopenCompletedTask(reopenDialogTask, reason)
            : Promise.resolve()
        }
        open={Boolean(reopenDialogTask)}
        saving={Boolean(reopeningTaskId)}
        taskTitle={reopenDialogTask?.taskTitle ?? ""}
        trackedMinutes={reopenDialogSeed?.trackedMinutes ?? 0}
      />
      <TaskAutoStopNoteModal
        initialNote={
          activeAutoStopTask && activeAutoStopPrompt
            ? getTaskDaySeed(
                activeAutoStopTask,
                activeAutoStopPrompt.reportDate,
              ).note ?? ""
            : ""
        }
        onOpenChange={(open) => {
          if (!open && activeAutoStopPrompt) {
            dismissAutoStopPrompt(
              activeAutoStopPrompt.taskId,
              activeAutoStopPrompt.reportDate,
            );
          }
        }}
        onSave={handleAutoStopNoteSave}
        open={Boolean(activeAutoStopPrompt)}
        saving={savingAutoStopNote}
        stoppedAt={activeAutoStopPrompt?.actualEnd ?? ""}
        taskTitle={activeAutoStopTask?.taskTitle ?? "Stopped task"}
      />
    </>
  );
}
