"use client";

import Link from "next/link";
import { CheckCircle2, ListChecks, RotateCcw, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AssignmentReviewControls } from "@/components/dashboard/assignment-review-controls";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { DashboardTaskTimerAction, type TaskTimerSnapshot } from "@/components/dashboard/dashboard-task-timer-action";
import { TaskAutoStopNoteModal } from "@/components/dashboard/task-auto-stop-note-modal";
import { TaskCompleteModal, type TaskCompletionPayload } from "@/components/dashboard/task-complete-modal";
import { TaskDetailsModal, type TaskDetails } from "@/components/dashboard/task-details-modal";
import { TaskManageControls } from "@/components/dashboard/task-manage-controls";
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
  getTaskStatusForDashboard,
  getTaskStatusLabel,
  isCarriedOverTask,
  sortTasksByRecency,
} from "@/lib/dashboard-work-plan-filter";
import { buildContinuationOverview, extractContinuationMeta } from "@/lib/task-continuation";
import { extractFollowUpMeta } from "@/lib/task-follow-up";
import { getReadableTaskDescription } from "@/lib/report-summary";
import { formatTaskPriority, normalizeTaskPriority } from "@/lib/task-priority";
import { embedReopenMeta, isReopenedTask, stripReopenMeta } from "@/lib/task-reopen";
import { formatTimeOnlyInDhaka, toDateOnly } from "@/lib/utils";

export type DashboardWorkPlanTask = {
  id: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  planDate: string;
  assignedBy?: string | null;
  userId: string;
  departmentName: string;
  /** Ordering falls back to this for a task that has not been worked on yet. */
  createdAt?: string | null;
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    note?: string | null;
    trackedMinutes: number;
    actualStart?: string | null;
    actualEnd?: string | null;
    reportDate?: string | null;
    updatedAt?: string | null;
  }>;
  latestReview?: {
    id: string;
    status: "pending" | "approved" | "rejected";
    submitNote: string;
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    requestedById: string;
    reviewerId: string | null;
  } | null;
};

type DashboardWorkPlanSectionProps = {
  tasks: DashboardWorkPlanTask[];
  canEdit: boolean;
  /** Checked in right now; a closed workday blocks starting or resuming a task. */
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

/**
 * Uppercase micro-chip: priority, and the markers that say where a task came
 * from. The hue rides a data-chip attribute, so the class list is shared.
 */
const MARKER_CHIP_CLASS =
  "task-chip inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.1em]";

/** A size up and in sentence case: status and department read as words, not tags. */
const STATUS_CHIP_CLASS = "task-chip inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.5625rem] font-semibold";

function formatTrackedMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}m`;
}

/**
 * isLive is the timer actually counting right now, which is not the same thing
 * as the stored in_progress status a task paused over lunch is still in
 * progress. Only the running one reads "Live"; the dot is drawn for both and
 * only pulses on the live card.
 */
function getStatusMeta(status: "done" | "in_progress" | "pending", isLive = false) {
  if (status === "done") {
    return { label: "Completed", tone: "done" as const };
  }

  if (status === "in_progress") {
    return { label: isLive ? "Live" : "Active", tone: "active" as const };
  }

  return { label: "Pending", tone: "pending" as const };
}

type TaskAccentTone = "critical" | "high" | "normal" | "low" | "done";

/**
 * Which accent the card's border (and, while the timer is running, its
 * pulsing ring) carries.
 *
 * Provenance — reopened, follow-up, continued, carried over — already has its
 * own badge on the card, so the border doesn't need to repeat it; encoding
 * both there and here is what made a reopened Critical task show a pink
 * border for a red problem. The border now answers one question only, the
 * one it's actually useful for at a glance: how urgent is this. Done is the
 * one status that still overrides priority, because a finished task isn't
 * urgent regardless of what it was planned as.
 */
function getTaskAccentTone(task: DashboardWorkPlanTask, status: "done" | "in_progress" | "pending"): TaskAccentTone {
  if (status === "done") {
    return "done";
  }

  return normalizeTaskPriority(task.priority);
}

function parseResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : { message: "Task update failed." };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

type TaskTimerActionWrapperProps = {
  task: DashboardWorkPlanTask;
  canEdit: boolean;
  attendanceRunning: boolean;
  onDoneClick: (taskId: string) => void;
  onSnapshotChange: (taskId: string, snapshot: TaskTimerSnapshot) => void;
  afterDoneSlot?: ReactNode;
};

const TaskTimerActionWrapper = ({
  task,
  canEdit,
  attendanceRunning,
  onDoneClick,
  onSnapshotChange,
  afterDoneSlot,
}: TaskTimerActionWrapperProps) => {
  const handleDone = useCallback(() => {
    onDoneClick(task.id);
  }, [task.id, onDoneClick]);

  const handleSnapshot = useCallback(
    (snapshot: TaskTimerSnapshot) => {
      onSnapshotChange(task.id, snapshot);
    },
    [task.id, onSnapshotChange]
  );

  const status = task.updates[0]?.status ?? "pending";

  return (
    <DashboardTaskTimerAction
      canEdit={canEdit}
      compact
      initialAttendanceRunning={attendanceRunning}
      initialActualEnd={task.updates[0]?.actualEnd ?? null}
      initialActualStart={task.updates[0]?.actualStart ?? null}
      initialStatus={status}
      initialTrackedMinutes={task.updates[0]?.trackedMinutes ?? 0}
      afterDoneSlot={afterDoneSlot}
      onDoneClick={handleDone}
      onSnapshotChange={handleSnapshot}
      reportDate={toDateOnly()}
      taskId={task.id}
      taskTitle={task.taskTitle}
    />
  );
};

function emitDashboardStats(
  allTasks: DashboardWorkPlanTask[],
  onStatsChange?: DashboardWorkPlanSectionProps["onStatsChange"],
) {
  const stats = countDashboardTaskStats(allTasks);
  onStatsChange?.({
    plannedTasks: stats.plannedTasks,
    completedTasks: stats.completedTasks,
    inProgressTasks: stats.inProgressTasks,
    pendingTasks: stats.pendingTasks,
    visibleTaskIds: stats.visibleTasks.map((task) => task.id),
  });

  if (typeof window !== "undefined") {
    // Defer event dispatch to after render completes to avoid "Cannot update a component while rendering" error
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent("dashboard:stats-updated", {
          detail: {
            plannedTasks: stats.plannedTasks,
            completedTasks: stats.completedTasks,
            inProgressTasks: stats.inProgressTasks,
            pendingTasks: stats.pendingTasks,
            visibleTaskIds: stats.visibleTasks.map((task) => task.id),
          },
        }),
      );
    });
  }
}

/**
 * Swallows clicks and key presses so the controls inside it never also open the
 * card's details dialog. Without this, Start, Edit, Delete and even a space bar
 * pressed inside a time field would open it.
 */
function CardActionArea({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {children}
    </div>
  );
}

/** Shared with DashboardKpiCards, so a task opened from a KPI card's list matches the one opened from its own column. */
export function buildTaskDetails(task: DashboardWorkPlanTask, currentUserId: string): TaskDetails {
  const status = getTaskStatusForDashboard(task) as "done" | "in_progress" | "pending";
  const update = task.updates[0];

  return {
    id: task.id,
    taskTitle: task.taskTitle,
    description: getReadableTaskDescription(task.taskDescription),
    priority: task.priority,
    status,
    statusLabel: getTaskStatusLabel(status),
    departmentName: task.departmentName,
    planDate: task.planDate,
    trackedMinutes: update?.trackedMinutes ?? 0,
    actualStart: update?.actualStart ?? null,
    actualEnd: update?.actualEnd ?? null,
    note: update?.note ?? null,
    isFollowUp: Boolean(extractFollowUpMeta(task.taskDescription)),
    isContinued: Boolean(extractContinuationMeta(task.taskDescription)),
    isReopened: isReopenedTask(task.taskDescription),
    isCarriedOver: isCarriedOverTask(task),
    isAssigned: Boolean(task.assignedBy) && task.userId === currentUserId,
    continuation: buildContinuationOverview({
      taskDescription: task.taskDescription,
      currentDate: task.planDate,
      currentProgress: status === "done" ? 100 : 0,
      currentTrackedMinutes: update?.trackedMinutes ?? 0,
      currentNote: update?.note,
    }),
  };
}

/**
 * The shared shell for both halves of the work plan: one-line title with the
 * badges flush right, one-line note, then whatever actions the half provides.
 *
 * The whole card opens the details dialog. It holds buttons and time inputs so
 * it cannot be a <button> itself; role and tabIndex give it the same affordance
 * and CardActionArea keeps the controls from triggering it.
 */
function WorkPlanTaskCard({
  children,
  className,
  isLive = false,
  onOpenDetails,
  status,
  task,
  tone,
}: {
  children: ReactNode;
  className?: string;
  /** The task's timer is counting right now, which is what the pulse means. */
  isLive?: boolean;
  onOpenDetails: () => void;
  status: "done" | "in_progress" | "pending";
  task: DashboardWorkPlanTask;
  tone: TaskAccentTone;
}) {
  const statusMeta = getStatusMeta(status, isLive);
  const followUpMeta = extractFollowUpMeta(task.taskDescription);
  const continuationMeta = extractContinuationMeta(task.taskDescription);
  const reopened = isReopenedTask(task.taskDescription);
  // Still open past its own day, so it followed the user into today's plan
  // instead of silently disappearing — see isVisibleInTodaysWorkPlan.
  const carriedOver = isCarriedOverTask(task);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onOpenDetails();
  }

  return (
    <article
      className={`task-card group cursor-pointer overflow-hidden rounded-[0.875rem] p-2.5 pl-3 transition ${className || ""}`}
      data-dashboard-row
      data-live={isLive ? "true" : undefined}
      data-tone={tone}
      onClick={onOpenDetails}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title="Open task details"
    >
      <div className="flex flex-col gap-1.5">
        {/* Title and badges share one row, badges flush right. The title takes
            the slack and truncates; the full string is a click away. */}
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold leading-5 text-[var(--foreground)]">
            {task.taskTitle}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            {/* The only badge about where the task came from rather than what it
                is: this one was finished and pulled back out of Complete Task. */}
            {reopened ? (
              <span
                className={MARKER_CHIP_CLASS + " gap-0.5"}
                data-chip="reopened"
                title="Brought back from Complete Task"
              >
                <RotateCcw className="h-2 w-2" />
                Reopened
              </span>
            ) : null}
            {carriedOver ? (
              <span className={MARKER_CHIP_CLASS} data-chip="pending" title={`Still open from ${task.planDate}`}>
                Carried Over
              </span>
            ) : null}
            {followUpMeta ? (
              <span className={MARKER_CHIP_CLASS} data-chip="followup">
                Follow-up
              </span>
            ) : null}
            {continuationMeta ? (
              <span className={MARKER_CHIP_CLASS} data-chip="continued">
                Cont.
              </span>
            ) : null}
            <span className={MARKER_CHIP_CLASS} data-chip={normalizeTaskPriority(task.priority)}>
              {formatTaskPriority(task.priority)}
            </span>
            <span className={STATUS_CHIP_CLASS + " gap-1"} data-chip={statusMeta.tone}>
              {/* Gated on isLive, not just the in_progress status: a task that is
                  in progress but paused is not what "live" promises. */}
              {isLive ? <span className="task-live-dot" /> : null}
              {statusMeta.label}
            </span>
            <span className={STATUS_CHIP_CLASS + " max-w-[5.5rem]"} title={task.departmentName}>
              <span className="truncate">{task.departmentName}</span>
            </span>
          </div>
        </div>

        {children}
      </div>
    </article>
  );
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
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [detailsTask, setDetailsTask] = useState<TaskDetails | null>(null);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [autoStopQueue, setAutoStopQueue] = useState<TaskAutoStopNotePayload[]>(() =>
    typeof window === "undefined" ? [] : readPendingTaskAutoStopNotes(),
  );
  const [savingAutoStopNote, setSavingAutoStopNote] = useState(false);
  const timerSnapshotsRef = useRef<Record<string, TaskTimerSnapshot>>({});
  // Snapshots live in a ref because most readers (save handlers) just need the
  // latest value at click time. The live dot is the one reader that has to
  // re-render when a timer starts or stops, so it gets this tiny state mirror
  // instead of the whole snapshot map re-rendering the list on every tick.
  const [liveTaskIds, setLiveTaskIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const syncHandle = window.setTimeout(() => {
      setTasks(initialTasks);
    }, 0);

    return () => window.clearTimeout(syncHandle);
  }, [initialTasks]);

  useEffect(() => {
    emitDashboardStats(tasks, onStatsChange);
  }, [onStatsChange, tasks]);

  useEffect(() => {
    function handleTasksCreated(event: Event) {
      const detail = (event as CustomEvent<{ tasks?: DashboardLiveTask[] }>).detail;
      const createdTasks = detail?.tasks ?? [];

      if (!createdTasks.length) {
        return;
      }

      setTasks((current) => {
        const currentIds = new Set(current.map((task) => task.id));
        const nextTasks = [
          ...createdTasks
            .filter((task) => !currentIds.has(task.id))
            .map((task) => ({
              ...task,
              updates: [],
              latestReview: null,
            })),
          ...current,
        ];

        return nextTasks;
      });
    }

    window.addEventListener(DASHBOARD_TASKS_CREATED_EVENT, handleTasksCreated);
    return () => window.removeEventListener(DASHBOARD_TASKS_CREATED_EVENT, handleTasksCreated);
  }, []);

  useEffect(() => {
    function handleAutoStopNoteNeeded(event: Event) {
      const detail = (event as CustomEvent<TaskAutoStopNotePayload>).detail;
      if (!detail?.taskId || !detail?.reportDate) {
        return;
      }

      setAutoStopQueue((current) => {
        const withoutDuplicate = current.filter(
          (entry) => !(entry.taskId === detail.taskId && entry.reportDate === detail.reportDate),
        );

        return [...withoutDuplicate, detail].sort((left, right) => left.timestamp - right.timestamp);
      });
    }

    window.addEventListener(TASK_AUTO_STOP_NOTE_EVENT, handleAutoStopNoteNeeded);
    return () => window.removeEventListener(TASK_AUTO_STOP_NOTE_EVENT, handleAutoStopNoteNeeded);
  }, []);

  const handleSnapshotChange = useCallback((taskId: string, snapshot: TaskTimerSnapshot) => {
    timerSnapshotsRef.current = {
      ...timerSnapshotsRef.current,
      [taskId]: snapshot,
    };

    const isRunning = Boolean(snapshot.runningStartedAt);
    setLiveTaskIds((current) => (Boolean(current[taskId]) === isRunning ? current : { ...current, [taskId]: isRunning }));
  }, []);

  const handleDoneClick = useCallback((taskId: string) => {
    setCompleteTaskId(taskId);
  }, []);

  const handleModalOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCompleteTaskId(null);
    }
  }, []);

  // Recency, not priority: which task moved most recently is what the two
  // columns are meant to answer, and priority still shows on the card itself.
  const visibleTasks = useMemo(() => sortTasksByRecency(filterTodaysWorkPlanTasks(tasks)), [tasks]);

  // No slice on either half any more: each panel is its own scroller, so a long
  // day scrolls instead of silently dropping tasks off the end of the list.
  const openTasks = useMemo(
    () => visibleTasks.filter((task) => getTaskStatusForDashboard(task) !== "done"),
    [visibleTasks],
  );

  const doneTasks = useMemo(
    () => visibleTasks.filter((task) => getTaskStatusForDashboard(task) === "done"),
    [visibleTasks],
  );

  const completingTask = tasks.find((task) => task.id === completeTaskId) ?? null;
  const activeAutoStopPrompt = autoStopQueue[0] ?? null;
  const activeAutoStopTask = activeAutoStopPrompt
    ? tasks.find((task) => task.id === activeAutoStopPrompt.taskId) ?? null
    : null;

  function markTaskCompleted(taskId: string, snapshot?: TaskTimerSnapshot) {
    setTasks((current) => {
      return current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        return {
          ...task,
          // Finishing ends the reopened state, mirroring the server's own
          // stripReopenMeta call for the same complete_task action.
          taskDescription: isReopenedTask(task.taskDescription)
            ? stripReopenMeta(task.taskDescription) || null
            : task.taskDescription,
          updates: [
            {
              ...(task.updates[0] ?? {
                trackedMinutes: Number(snapshot?.trackedMinutes ?? 0),
                actualStart: null,
                actualEnd: null,
                note: null,
                reportDate: toDateOnly(),
              }),
              status: "done" as const,
              // The server upserts today's row, so the local copy must carry
              // today's date too — otherwise the dashboard reads a stale day.
              reportDate: toDateOnly(),
              trackedMinutes: Number(snapshot?.trackedMinutes ?? task.updates[0]?.trackedMinutes ?? 0),
              actualStart: snapshot?.actualStart ?? task.updates[0]?.actualStart ?? null,
              actualEnd: snapshot?.actualEnd ?? task.updates[0]?.actualEnd ?? null,
            },
          ],
        };
      });
    });
  }

  const handleMovedToHistory = useCallback((taskId: string) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        return {
          ...task,
          updates: [
            {
              ...(task.updates[0] ?? {
                trackedMinutes: 0,
                actualStart: null,
                actualEnd: null,
                note: null,
              }),
              status: "done" as const,
              reportDate: toDateOnly(),
            },
          ],
        };
      }),
    );
  }, []);

  /**
   * Mirrors the server's own resumedStatus rule (in the restore_to_dashboard
   * action): a task with tracked time or a start already logged resumes as
   * in_progress, a fresh one goes back to pending. Keeping this in sync means
   * the card flips columns immediately instead of waiting on router.refresh().
   */
  const handleRestoredToWorkPlan = useCallback((taskId: string) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const latestUpdate = task.updates[0];
        const resumedStatus: "in_progress" | "pending" =
          latestUpdate && (latestUpdate.trackedMinutes > 0 || latestUpdate.actualStart) ? "in_progress" : "pending";

        return {
          ...task,
          // Matches the server's own embedReopenMeta call in the same action, so
          // the "Reopened" chip shows immediately instead of after router.refresh().
          taskDescription: embedReopenMeta(task.taskDescription),
          updates: [
            {
              ...(latestUpdate ?? {
                trackedMinutes: 0,
                actualStart: null,
                actualEnd: null,
                note: null,
                reportDate: toDateOnly(),
              }),
              status: resumedStatus,
              actualEnd: null,
            },
          ],
        };
      }),
    );
  }, []);

  function dismissAutoStopPrompt(taskId: string, reportDate: string) {
    removePendingTaskAutoStopNote(reportDate, taskId);
    setAutoStopQueue((current) =>
      current.filter((entry) => !(entry.taskId === taskId && entry.reportDate === reportDate)),
    );
  }

  async function handleCompleteSave(payload: TaskCompletionPayload) {
    if (!completingTask) {
      return;
    }

    const snapshot = timerSnapshotsRef.current[completingTask.id];
    setSavingCompletion(true);

    const response = await fetch(`/api/dashboard/tasks/${completingTask.id}`, {
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
        trackedMinutes: Number(snapshot?.trackedMinutes ?? completingTask.updates[0]?.trackedMinutes ?? 0),
        actualStart: snapshot?.actualStart || completingTask.updates[0]?.actualStart || "",
        actualEnd: snapshot?.actualEnd || completingTask.updates[0]?.actualEnd || "",
      }),
    });

    const result = parseResponse(await response.text());
    setSavingCompletion(false);

    if (!response.ok) {
      toast.error(result.message ?? "Could not complete task.");
      return;
    }

    toast.success(result.message ?? "Task completed.");
    setCompleteTaskId(null);
    markTaskCompleted(completingTask.id, snapshot);
    // The stat cards and the work-time KPI are server-rendered, and a follow-up
    // task may have just been created server-side, so pull fresh server state.
    router.refresh();

  }

  async function handleAutoStopNoteSave(note: string) {
    if (!activeAutoStopPrompt) {
      return;
    }

    const currentTask = tasks.find((task) => task.id === activeAutoStopPrompt.taskId) ?? activeAutoStopTask;
    const snapshot = timerSnapshotsRef.current[activeAutoStopPrompt.taskId];
    const nextStatus = snapshot?.status || currentTask?.updates[0]?.status || "in_progress";
    const nextTrackedMinutes = Math.max(
      0,
      Number(
        snapshot?.trackedMinutes ??
          activeAutoStopPrompt.trackedMinutes ??
          currentTask?.updates[0]?.trackedMinutes ??
          0,
      ),
    );
    const nextActualStart =
      snapshot?.actualStart || activeAutoStopPrompt.actualStart || currentTask?.updates[0]?.actualStart || "";
    const nextActualEnd =
      snapshot?.actualEnd || activeAutoStopPrompt.actualEnd || currentTask?.updates[0]?.actualEnd || "";

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
          ? {
              ...task,
              updates: [
                {
                  ...(task.updates[0] ?? {
                    status: nextStatus,
                    trackedMinutes: nextTrackedMinutes,
                    actualStart: nextActualStart || null,
                    actualEnd: nextActualEnd || null,
                    reportDate: activeAutoStopPrompt.reportDate,
                  }),
                  status: nextStatus,
                  trackedMinutes: nextTrackedMinutes,
                  actualStart: nextActualStart || null,
                  actualEnd: nextActualEnd || null,
                  note,
                },
              ],
            }
          : task,
      ),
    );

    toast.success("Auto-stop note saved.");
    dismissAutoStopPrompt(activeAutoStopPrompt.taskId, activeAutoStopPrompt.reportDate);
  }

  function renderOpenTask(task: DashboardWorkPlanTask) {
    const status = getTaskStatusForDashboard(task) as "done" | "in_progress" | "pending";
    const tone = getTaskAccentTone(task, status);

    return (
      <WorkPlanTaskCard
        isLive={status === "in_progress" && Boolean(liveTaskIds[task.id])}
        key={task.id}
        onOpenDetails={() => setDetailsTask(buildTaskDetails(task, currentUserId))}
        status={status}
        task={task}
        tone={tone}
      >
        <CardActionArea className="w-full min-w-0">
          <TaskTimerActionWrapper
            task={task}
            canEdit={canEdit}
            attendanceRunning={attendanceRunning}
            afterDoneSlot={
              <TaskManageControls
                compact
                hideDoneAction
                showInlineDelete
                onMovedToHistory={handleMovedToHistory}
                task={{
                  id: task.id,
                  taskTitle: task.taskTitle,
                  taskDescription: task.taskDescription,
                  priority: task.priority as "low" | "normal" | "high" | "critical",
                }}
              />
            }
            onDoneClick={handleDoneClick}
            onSnapshotChange={handleSnapshotChange}
          />
          {task.assignedBy && task.userId === currentUserId ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <AssignmentReviewControls
                latestReview={task.latestReview ?? null}
                mode="assignee"
                taskId={task.id}
                taskTitle={task.taskTitle}
              />
            </div>
          ) : null}
        </CardActionArea>
      </WorkPlanTaskCard>
    );
  }

  function renderDoneTask(task: DashboardWorkPlanTask) {
    const update = task.updates[0];
    const startLabel = update?.actualStart ? formatTimeOnlyInDhaka(update.actualStart) : "--:--";
    const endLabel = update?.actualEnd ? formatTimeOnlyInDhaka(update.actualEnd) : "--:--";

    return (
      // Read-only on purpose: a finished task needs its numbers and its manage
      // actions, not a Start button that would reopen the timer by accident.
      <WorkPlanTaskCard
        key={task.id}
        onOpenDetails={() => setDetailsTask(buildTaskDetails(task, currentUserId))}
        status="done"
        task={task}
        tone="done"
        className="border-slate-100"
      >
        {/* Only the controls swallow the click here: the two chips are plain text
            and the card stays openable from anywhere around them. */}
        <div className="flex min-w-0 items-center gap-1">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[0.5rem] font-semibold tabular-nums text-slate-600 bg-white">
            <Timer className="h-3 w-3 text-[#4f5ef7]" />
            {formatTrackedMinutes(update?.trackedMinutes ?? 0)}
          </span>
          <span
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 px-1.5 py-1 text-[0.5rem] font-semibold tabular-nums text-slate-600 bg-white"
            title="Started and finished"
          >
            {startLabel} - {endLabel}
          </span>
          <CardActionArea className="ml-auto shrink-0">
            <TaskManageControls
              compact
              hideDoneAction
              showArchiveAction
              showInlineDelete
              showRestoreAction
              onMovedToHistory={handleMovedToHistory}
              onRestoredToWorkPlan={handleRestoredToWorkPlan}
              task={{
                id: task.id,
                taskTitle: task.taskTitle,
                taskDescription: task.taskDescription,
                priority: task.priority as "low" | "normal" | "high" | "critical",
              }}
            />
          </CardActionArea>
        </div>
      </WorkPlanTaskCard>
    );
  }

  return (
    <>
      {/* One day, two halves: what is still open on the left, what is already
          finished on the right. Each half owns the column height and scrolls
          inside itself, so the page still ends at the bottom of one screen. */}
      <div className="grid min-h-0 min-w-0 gap-2 min-[900px]:flex-1 min-[900px]:grid-cols-2">
        <div
          className="dashboard-accent accent-indigo flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)]"
          data-dashboard-panel
        >
          {/* The date is the first thing to drop: between 900px and 1150px the
              split leaves this header too narrow to hold it and the title. */}
          <div className="shrink-0 border-b border-[var(--panel-border)] px-2.5 py-1.5">
            <PanelHeader
              action={
                <p className="truncate text-[0.6875rem] font-medium text-[var(--muted-foreground)] min-[900px]:max-[1150px]:hidden sm:text-xs">
                  {formattedDate}
                </p>
              }
              icon={ListChecks}
              title="Today's Work Plan"
            />
          </div>

          <div className="dashboard-scroll-area min-h-0 flex-1 space-y-1.5 p-2">
            {openTasks.length ? (
              openTasks.map((task) => renderOpenTask(task))
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-6 text-center text-[0.85rem] text-[var(--muted-foreground)]">
                {visibleTasks.length
                  ? "Everything planned for today is finished."
                  : "No tasks added yet for today. Start by creating today's work plan."}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--panel-border)] px-3 py-1 text-center">
            <Link className="text-xs font-semibold text-[#4f5ef7] hover:text-[#3f4ede]" href="/dashboard/plan">
              View All Tasks
            </Link>
          </div>
        </div>

        <div
          className="dashboard-accent accent-emerald flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)]"
          data-dashboard-panel
        >
          <div className="shrink-0 border-b border-[var(--panel-border)] px-2.5 py-1.5">
            <PanelHeader
              action={
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] tabular-nums text-emerald-600">
                  {doneTasks.length} done
                </span>
              }
              icon={CheckCircle2}
              title="Complete Task"
              tone="bg-emerald-500/10 text-emerald-500"
            />
          </div>

          <div className="dashboard-scroll-area min-h-0 flex-1 space-y-1.5 p-2">
            {doneTasks.length ? (
              doneTasks.map((task) => renderDoneTask(task))
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-6 text-center">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <p className="text-[0.85rem] text-[var(--muted-foreground)]">Nothing finished yet. Completed tasks land here.</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--panel-border)] px-3 py-1 text-center">
            <Link className="text-xs font-semibold text-[#4f5ef7] hover:text-[#3f4ede]" href="/dashboard/report">
              View Full Report
            </Link>
          </div>
        </div>
      </div>

      <TaskDetailsModal onOpenChange={(open) => (open ? undefined : setDetailsTask(null))} task={detailsTask} />

      <TaskCompleteModal
        onOpenChange={handleModalOpenChange}
        onSave={handleCompleteSave}
        open={Boolean(completeTaskId)}
        saving={savingCompletion}
        taskTitle={completingTask?.taskTitle ?? ""}
      />

      <TaskAutoStopNoteModal
        initialNote={activeAutoStopTask?.updates[0]?.note ?? ""}
        onOpenChange={(open) => {
          if (!open && activeAutoStopPrompt) {
            dismissAutoStopPrompt(activeAutoStopPrompt.taskId, activeAutoStopPrompt.reportDate);
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
