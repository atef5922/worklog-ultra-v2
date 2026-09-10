import { stripHistoryMeta } from "@/lib/task-history-shared";
import { buildContinuationOverview, extractContinuationMeta, stripContinuationMeta, type ContinuationOverview } from "@/lib/task-continuation";
import { extractFollowUpMeta, stripFollowUpMeta } from "@/lib/task-follow-up";
import { stripRecurringTaskMeta } from "@/lib/recurring-task-templates";
import { stripReopenMeta } from "@/lib/task-reopen";
import { formatMinutes, toDateOnly } from "@/lib/utils";

const AUTO_PREDICTION_TEXT = /^Predicted from your work pattern and completion history\.?\s*/i;

type TaskUpdateLike = {
  status?: string | null;
  note?: string | null;
  trackedMinutes?: number | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  reportDate?: Date | string | null;
  updatedAt?: Date | string | null;
  completionPercent?: number | null;
};

export type TaskReportLike = {
  id: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority?: string | null;
  assignedBy?: string | null;
  planDate: Date | string;
  department?: {
    name?: string | null;
  } | null;
  updates?: TaskUpdateLike[];
};

export type ReportSummaryItem = {
  id: string;
  date: string;
  title: string;
  description: string;
  departmentName: string;
  status: "done" | "in_progress" | "pending";
  trackedMinutes: number;
  completionPercent: number;
  note: string;
  actualStart: string | null;
  actualEnd: string | null;
  priority: string;
  isFollowUp: boolean;
  isContinued: boolean;
  isAssigned: boolean;
  /** Present only when this task has been carried forward across multiple days. */
  continuation: ContinuationOverview | null;
};

function getSortableTimestamp(value?: Date | string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getReadableTaskDescription(description?: string | null) {
  return stripReopenMeta(
    stripHistoryMeta(
      stripRecurringTaskMeta(
        stripFollowUpMeta(
          stripContinuationMeta(description),
        ),
      ),
    ),
  )
    .replace(AUTO_PREDICTION_TEXT, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoOrNull(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * One report row per update, not per task.
 *
 * A task the dashboard carried forward while it was still open (see
 * isVisibleInTodaysWorkPlan) keeps the same task row across every day it was
 * worked on, picking up a new dailyTaskUpdate row each day rather than a new
 * task. Reading only getLatestTaskUpdate() therefore quietly dropped every
 * earlier day's tracked time and note the moment a later day's update
 * existed — the same task looked like it had only ever been worked on once,
 * on its most recent day. A task with a single update (still the normal
 * case) still produces exactly one row, unchanged; a task with none yet
 * produces one placeholder row so a freshly planned, untouched task still
 * appears.
 */
export function buildReportSummary(tasks: TaskReportLike[]) {
  const items: ReportSummaryItem[] = tasks.flatMap((task) => {
    const updates = [...(task.updates ?? [])].sort(
      (left, right) =>
        getSortableTimestamp(right.reportDate ?? right.updatedAt) -
        getSortableTimestamp(left.reportDate ?? left.updatedAt),
    );
    const rows = updates.length ? updates : [null];
    const planDate = toDateOnly(task.planDate);

    return rows.map((update, index) => {
      const status = update?.status;
      const entryDate = update?.reportDate ? toDateOnly(update.reportDate) : planDate;
      const completionPercent = Math.max(0, Number(update?.completionPercent ?? 0));
      const trackedMinutes = Math.max(0, Number(update?.trackedMinutes ?? 0));
      const note = update?.note?.trim() ?? "";

      return {
        // Only the multi-day case needs a composite key; a single-update task
        // keeps its plain task id so nothing downstream that assumed a 1:1
        // mapping (there is none left, but better safe) notices a change.
        id: rows.length > 1 ? `${task.id}:${entryDate}:${index}` : task.id,
        date: entryDate,
        title: task.taskTitle,
        description: getReadableTaskDescription(task.taskDescription),
        departmentName: task.department?.name ?? "General",
        status:
          status === "done" || status === "in_progress" || status === "pending"
            ? status
            : "pending",
        trackedMinutes,
        completionPercent,
        note,
        actualStart: toIsoOrNull(update?.actualStart),
        actualEnd: toIsoOrNull(update?.actualEnd),
        priority: task.priority ?? "normal",
        isFollowUp: Boolean(extractFollowUpMeta(task.taskDescription)),
        isContinued: Boolean(extractContinuationMeta(task.taskDescription)),
        isAssigned: Boolean(task.assignedBy),
        continuation: buildContinuationOverview({
          taskDescription: task.taskDescription,
          currentDate: entryDate,
          currentProgress: completionPercent,
          currentTrackedMinutes: trackedMinutes,
          currentNote: note,
        }),
      };
    });
  });

  const totalTrackedMinutes = items.reduce((sum, item) => sum + item.trackedMinutes, 0);
  const completedTasks = items.filter((item) => item.status === "done").length;
  const inProgressTasks = items.filter((item) => item.status === "in_progress").length;
  const pendingTasks = items.filter((item) => item.status === "pending").length;

  return {
    items,
    totals: {
      totalTasks: items.length,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      totalTrackedMinutes,
      totalTrackedLabel: formatMinutes(totalTrackedMinutes),
    },
  };
}
