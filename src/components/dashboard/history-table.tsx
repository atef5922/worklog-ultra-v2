"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ClipboardList, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardTaskTimerAction } from "@/components/dashboard/dashboard-task-timer-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TaskManageControls } from "@/components/dashboard/task-manage-controls";
import { isMovedToHistory } from "@/lib/task-history-shared";
import { getTaskTimerStorageKey } from "@/lib/task-timer-storage";
import { getReadableTaskDescription } from "@/lib/report-summary";
import { calculateTaskOvertimeMinutes, getTaskAutoStopLabel } from "@/lib/task-session-meta";
import { extractContinuationMeta } from "@/lib/task-continuation";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeInDhaka, formatMinutes, toDateOnly } from "@/lib/utils";

type HistoryItem = {
  id: string;
  planDate: Date;
  taskTitle: string;
  taskDescription?: string | null;
  department: { name: string };
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    trackedMinutes: number;
    actualStart: Date | null;
    actualEnd: Date | null;
    updatedAt?: Date | null;
    note?: string | null;
    completionPercent?: number;
    difficultyLevel?: string | null;
  }>;
  latestRequest: {
    id: string;
    status: "pending" | "approved" | "rejected";
    reason: string;
    reviewNote?: string | null;
  } | null;
  isToday: boolean;
  canEmployeeEdit: boolean;
  canRequestEdit: boolean;
};

type PendingRequest = {
  id: string;
  reason: string;
  reviewNote?: string | null;
  createdAt: Date;
  requestedBy: { name: string; department: { name: string } | null };
  dailyTask: {
    id: string;
    taskTitle: string;
    taskDescription?: string | null;
    planDate: Date;
    department?: { name: string } | null;
  };
};

type RequestDraft = {
  reason: string;
  startedAt: string;
  endedAt: string;
  summary: string;
  desiredStatus: "done" | "in_progress" | "pending";
};

type HistoryTheme = "light" | "dark";

function statusVariant(status?: "done" | "in_progress" | "pending") {
  if (status === "done") return "success";
  if (status === "pending") return "warning";
  return "purple";
}

function requestVariant(status?: "pending" | "approved" | "rejected") {
  if (status === "approved") return "success";
  if (status === "rejected") return "warning";
  return "purple";
}

function formatHistoryDateParts(value: Date | string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      day: "--",
      monthYear: "Unknown date",
      weekday: "",
      compact: "Unknown date",
    };
  }

  return {
    day: new Intl.DateTimeFormat("en-BD", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
    }).format(date),
    monthYear: new Intl.DateTimeFormat("en-BD", {
      timeZone: "Asia/Dhaka",
      month: "short",
      year: "numeric",
    }).format(date),
    weekday: new Intl.DateTimeFormat("en-BD", {
      timeZone: "Asia/Dhaka",
      weekday: "long",
    }).format(date),
    compact: new Intl.DateTimeFormat("en-BD", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date),
  };
}

function formatHistoryTimeParts(value?: Date | string | null) {
  if (!value) {
    return {
      time: "Not set",
      meridiem: "",
      date: "Waiting for update",
      isSet: false,
      isLive: false,
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      time: "Not set",
      meridiem: "",
      date: "Waiting for update",
      isSet: false,
      isLive: false,
    };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
  const meridiem = parts.find((part) => part.type === "dayPeriod")?.value ?? "";

  return {
    time: `${hour}:${minute}`,
    meridiem,
    date: new Intl.DateTimeFormat("en-BD", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date),
    isSet: true,
    isLive: false,
  };
}

function getResolvedEndTimeParts(task: HistoryItem, now: Date) {
  const savedEnd = task.updates[0]?.actualEnd;

  if (savedEnd) {
    return formatHistoryTimeParts(savedEnd);
  }

  const completionFallback = task.updates[0]?.status === "done" ? task.updates[0]?.updatedAt : null;
  if (completionFallback) {
    return {
      ...formatHistoryTimeParts(completionFallback),
      date: "Completed today",
      isLive: false,
    };
  }

  if (task.isToday && task.updates[0]?.status === "in_progress") {
    return {
      ...formatHistoryTimeParts(now),
      date: "Running now",
      isLive: true,
    };
  }

  return formatHistoryTimeParts(null);
}

function formatTrackedMinutes(totalMinutes: number) {
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${totalMinutes} min`;
}

function formatMinutesAsHours(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getHistoryNote(task: HistoryItem) {
  return task.updates[0]?.note?.trim() || getReadableTaskDescription(task.taskDescription) || "";
}

function formatTimeLabel(parts: ReturnType<typeof formatHistoryTimeParts>) {
  return parts.isSet ? `${parts.time}${parts.meridiem ? ` ${parts.meridiem}` : ""}` : parts.time;
}

function getContinuationOverview(task: HistoryItem) {
  const continuationMeta = extractContinuationMeta(task.taskDescription);

  if (!continuationMeta) {
    return null;
  }

  const currentDayEntry = {
    date: toDateOnly(task.planDate),
    progress: task.updates[0]?.completionPercent ?? 0,
    trackedMinutes: task.updates[0]?.trackedMinutes ?? 0,
    note: task.updates[0]?.note?.trim() ?? "",
  };
  const mergedDailyLogs = [...(continuationMeta.dailyLogs ?? [])];
  const existingCurrentDayIndex = mergedDailyLogs.findIndex((entry) => entry.date === currentDayEntry.date);

  if (existingCurrentDayIndex >= 0) {
    mergedDailyLogs[existingCurrentDayIndex] = currentDayEntry;
  } else {
    mergedDailyLogs.push(currentDayEntry);
  }

  mergedDailyLogs.sort((left, right) => left.date.localeCompare(right.date));
  const previousDayLog =
    mergedDailyLogs.length > 1
      ? mergedDailyLogs[mergedDailyLogs.length - 2]
      : null;
  const currentTrackedMinutes = task.updates[0]?.trackedMinutes ?? 0;
  const currentProgress = task.updates[0]?.completionPercent ?? 0;
  const overallTrackedMinutes = mergedDailyLogs.reduce((sum, entry) => sum + entry.trackedMinutes, 0);
  const totalDays = Math.max(continuationMeta.daysActive || 0, mergedDailyLogs.length, 1);

  return {
    sourceDate: continuationMeta.sourceDate,
    previousDayLog,
    currentTrackedMinutes,
    currentProgress,
    totalDays,
    overallTrackedMinutes,
    lastNote: continuationMeta.note,
    dailyLogs: mergedDailyLogs,
  };
}

function getTrackedTone(totalMinutes: number) {
  if (totalMinutes >= 180) return "bg-emerald-500/10 text-emerald-600";
  if (totalMinutes >= 60) return "bg-blue-500/10 text-blue-600";
  if (totalMinutes > 0) return "bg-amber-500/10 text-amber-600";
  return "bg-slate-500/10 text-slate-500";
}

const compactActionButtonClass = "h-8 rounded-full px-3 text-xs font-semibold";

function getRecencyMeta(task: HistoryItem) {
  const referenceDate = task.updates[0]?.actualEnd ?? task.planDate;
  const entryDay = toDateOnly(referenceDate);
  const today = toDateOnly();
  const yesterday = toDateOnly(new Date(Date.now() - 24 * 60 * 60 * 1000));

  if (entryDay === today) {
    return {
      label: "Today",
      chip: "bg-violet-50 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200",
      row: "history-row history-row-recent",
      tone: "recent" as const,
    };
  }

  if (entryDay === yesterday) {
    return {
      label: "Yesterday",
      chip: "bg-sky-50 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200",
      row: "history-row history-row-yesterday",
      tone: "yesterday" as const,
    };
  }

  return {
    label: null,
    chip: "",
    row: "history-row history-row-default",
    tone: "default" as const,
  };
}

function getThemeStyles(theme: HistoryTheme) {
  if (theme === "light") {
    return {
      shell: {
        background: "linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)",
      } satisfies CSSProperties,
      defaultRow: {
        background: "linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(241, 247, 255, 0.98) 100%)",
        borderColor: "rgba(148, 163, 184, 0.24)",
        boxShadow: "0 14px 30px rgba(148, 163, 184, 0.16)",
      } satisfies CSSProperties,
      recentRow: {
        background: "linear-gradient(135deg, rgba(239, 246, 255, 0.99) 0%, rgba(224, 238, 255, 0.99) 100%)",
        borderColor: "rgba(96, 165, 250, 0.32)",
        boxShadow: "0 14px 32px rgba(96, 165, 250, 0.16)",
      } satisfies CSSProperties,
      yesterdayRow: {
        background: "linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(235, 243, 255, 0.96) 100%)",
        borderColor: "rgba(125, 211, 252, 0.28)",
        boxShadow: "0 14px 30px rgba(125, 211, 252, 0.12)",
      } satisfies CSSProperties,
      departmentChip: {
        background: "rgba(255, 255, 255, 0.62)",
        borderColor: "rgba(251, 146, 60, 0.28)",
        color: "var(--foreground)",
      } satisfies CSSProperties,
      dailyLogChip: {
        background: "rgba(255, 255, 255, 0.16)",
      } satisfies CSSProperties,
    };
  }

  return {
    shell: {
      background: "linear-gradient(180deg, rgba(19, 29, 45, 0.96) 0%, rgba(15, 23, 37, 0.98) 100%)",
    } satisfies CSSProperties,
    defaultRow: {
      background: "linear-gradient(135deg, rgba(41, 30, 12, 0.96) 0%, rgba(67, 33, 13, 0.94) 100%)",
      borderColor: "rgba(180, 124, 38, 0.38)",
      boxShadow: "0 14px 34px rgba(0, 0, 0, 0.26)",
    } satisfies CSSProperties,
    recentRow: {
      background: "linear-gradient(135deg, rgba(76, 29, 12, 0.98) 0%, rgba(120, 53, 15, 0.94) 100%)",
      borderColor: "rgba(245, 158, 11, 0.34)",
      boxShadow: "0 16px 36px rgba(0, 0, 0, 0.3)",
    } satisfies CSSProperties,
    yesterdayRow: {
      background: "linear-gradient(135deg, rgba(51, 65, 85, 0.96) 0%, rgba(120, 53, 15, 0.84) 100%)",
      borderColor: "rgba(148, 163, 184, 0.3)",
      boxShadow: "0 14px 34px rgba(0, 0, 0, 0.26)",
    } satisfies CSSProperties,
    departmentChip: {
      background: "rgba(255, 255, 255, 0.1)",
      borderColor: "rgba(255, 255, 255, 0.2)",
      color: "var(--foreground)",
    } satisfies CSSProperties,
    dailyLogChip: {
      background: "rgba(255, 255, 255, 0.1)",
    } satisfies CSSProperties,
  };
}

function getRowStyle(theme: HistoryTheme, tone: "default" | "recent" | "yesterday") {
  const styles = getThemeStyles(theme);

  if (tone === "recent") return styles.recentRow;
  if (tone === "yesterday") return styles.yesterdayRow;
  return styles.defaultRow;
}

function getReasonSections(reason: string) {
  return reason
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return { label: "Details", value: line };
      }

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
}

function parseActionResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : { message: "Action failed." };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

/** Records per page. The panel is sized to hold exactly this many. */
const HISTORY_PAGE_SIZE = 4;

/** The raw enum ("in_progress") was reaching the badge and rendering as
 *  IN_PROGRESS with wide tracking, which read as a database value, not a label. */
function formatStatusLabel(status?: string) {
  if (!status) return "Planned";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
const historyPagerClass =
  "inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 text-[0.7rem] font-semibold text-[var(--foreground)] transition hover:border-[#4f5ef7]/40 hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--panel-border)] disabled:hover:bg-[var(--panel)]";

export function HistoryTable({
  history = [],
  role,
  pendingApprovals = [],
  mode = "history",
  initialTaskId,
  initialRequestId,
}: {
  history: HistoryItem[];
  role: "employee" | "hr" | "manager" | "admin";
  pendingApprovals: PendingRequest[];
  mode?: "history" | "requests";
  initialTaskId?: string;
  initialRequestId?: string;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<HistoryTheme>("dark");
  const [requestDrafts, setRequestDrafts] = useState<Record<string, RequestDraft>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<HistoryItem | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [isClient, setIsClient] = useState(false);
  const [page, setPage] = useState(1);

  const visibleHistory = useMemo(() => {
    if (mode !== "history") {
      return history;
    }

    return history.filter((task) => {
      if (!task.isToday) {
        return true;
      }

      const latestUpdate = task.updates[0];
      const isArchived = isMovedToHistory(task.taskDescription);
      const isCompleted =
        latestUpdate?.status === "done" ||
        (latestUpdate?.completionPercent ?? 0) >= 100 ||
        Boolean(latestUpdate?.actualEnd) ||
        isArchived;

      return isCompleted;
    });
  }, [history, mode, role]);

  /*
   * Paged rather than scrolled: the page is sized to one screen, so a long
   * history moves onto the next page instead of growing a scrollbar.
   */
  const totalPages = Math.max(1, Math.ceil(visibleHistory.length / HISTORY_PAGE_SIZE));
  // Clamped, so deleting rows or switching filters can never strand the view on
  // a page that no longer exists.
  const currentPage = Math.min(page, totalPages);
  const firstIndex = (currentPage - 1) * HISTORY_PAGE_SIZE;
  const pagedHistory = visibleHistory.slice(firstIndex, firstIndex + HISTORY_PAGE_SIZE);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!selectedTask && !selectedRequest) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTask(null);
        setSelectedRequest(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRequest, selectedTask]);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (initialRequestId) {
      const matchingRequest = pendingApprovals.find((request) => request.id === initialRequestId);
      if (matchingRequest) {
        setSelectedRequest(matchingRequest);
        return;
      }
    }

    if (initialTaskId) {
      const matchingTask = history.find((task) => task.id === initialTaskId);
      if (matchingTask) {
        setSelectedTask(matchingTask);
      }
    }
  }, [history, initialRequestId, initialTaskId, pendingApprovals]);

  function getDraft(taskId: string): RequestDraft {
    return (
      requestDrafts[taskId] ?? {
        reason: "",
        startedAt: "",
        endedAt: "",
        summary: "",
        desiredStatus: "done",
      }
    );
  }

  function patchDraft(taskId: string, key: keyof RequestDraft, value: string) {
    setRequestDrafts((current) => ({
      ...current,
      [taskId]: {
        ...getDraft(taskId),
        [key]: value as RequestDraft[keyof RequestDraft],
      },
    }));
  }

  async function submitRequest(taskId: string) {
    const draft = getDraft(taskId);
    const reason = draft.reason.trim();

    if (!reason) {
      toast.error("Explain clearly why you missed the report and what you need to edit.");
      return;
    }

    const formattedReason = [
      `Reason: ${reason}`,
      `Requested Status Change: ${draft.desiredStatus}`,
      draft.startedAt ? `Remembered Start Time: ${draft.startedAt}` : null,
      draft.endedAt ? `Remembered End Time: ${draft.endedAt}` : null,
      draft.summary.trim() ? `Work Summary: ${draft.summary.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    setLoadingId(taskId);
    const response = await fetch("/api/dashboard/report-edit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyTaskId: taskId, reason: formattedReason }),
    });
    const result = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setRequestDrafts((current) => ({
      ...current,
      [taskId]: {
        reason: "",
        startedAt: "",
        endedAt: "",
        summary: "",
        desiredStatus: "done",
      },
    }));
    setSelectedTask(null);
    router.refresh();
  }

  async function reviewRequest(requestId: string, decision: "approved" | "rejected") {
    setLoadingId(requestId);
    const response = await fetch(`/api/dashboard/report-edit-requests/${requestId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reviewNote: reviewNotes[requestId] ?? "",
      }),
    });
    const result = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setReviewNotes((current) => ({ ...current, [requestId]: "" }));
    setSelectedRequest(null);
    router.refresh();
  }

  async function restoreTaskToDashboard(task: HistoryItem, options?: { autoStart?: boolean }) {
    setLoadingId(task.id);
    const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore_to_dashboard" }),
    });
    const raw = await response.text();
    const result = parseActionResponse(raw) as { message?: string; taskId?: string; reportDate?: string };
    setLoadingId(null);

    if (!response.ok) {
      toast.error(result.message ?? "Task could not be restored.");
      return;
    }

    if (typeof window !== "undefined" && result.taskId && result.reportDate) {
      window.localStorage.removeItem(getTaskTimerStorageKey(result.reportDate, result.taskId));
      if (options?.autoStart) {
        window.sessionStorage.setItem(
          "dashboard-task-autostart",
          JSON.stringify({
            taskId: result.taskId,
            reportDate: result.reportDate,
            timestamp: Date.now(),
          }),
        );
      }
    }

    toast.success(options?.autoStart ? "Task moved to dashboard and ready to resume." : result.message ?? "Task returned to dashboard.");
    setSelectedTask(null);
    router.push("/dashboard");
    router.refresh();
  }

  function renderAction(task: HistoryItem) {
    const reportDate = toDateOnly(task.planDate);

    return (
      /* Six columns so the five actions land on exactly two rows (3 + 2) at the
         same positions in every record. Wrapping sized each button to its own
         text, which is why nothing lined up before. Full width of its column, so
         no empty band is left beside the buttons. */
      <div className="grid w-full grid-cols-6 gap-1 [&_button]:w-full">
        <Button className={`${compactActionButtonClass} col-span-2`} onClick={() => setSelectedTask(task)} size="sm" variant="secondary">
          Details
        </Button>
        <Link className="col-span-2 w-full" href={`/dashboard/report?date=${reportDate}&taskId=${task.id}`}>
          <Button className={compactActionButtonClass} size="sm" variant="outline">
            Editor
          </Button>
        </Link>
        <Button
          className={`${compactActionButtonClass} col-span-2`}
          disabled={loadingId === task.id}
          onClick={() => restoreTaskToDashboard(task, { autoStart: true })}
          size="sm"
          title="Return To Dashboard"
          variant="outline"
        >
          Return
        </Button>
        <div className="col-span-6 [&>*]:flex [&>*]:gap-1 [&_button]:flex-1">
        <TaskManageControls
          compact
          hideDoneAction
          showInlineDelete
          task={{
            id: task.id,
            taskTitle: task.taskTitle,
            taskDescription: task.taskDescription,
            priority: (task as { priority?: "low" | "normal" | "high" | "critical" }).priority ?? "normal",
          }}
          timerPanel={
            task.isToday && task.canEmployeeEdit && task.updates[0]?.status === "in_progress" ? (
              <DashboardTaskTimerAction
                canEdit
                initialActualEnd={task.updates[0]?.actualEnd ?? null}
                initialActualStart={task.updates[0]?.actualStart ?? null}
                initialStatus={task.updates[0]?.status ?? "pending"}
                initialTrackedMinutes={task.updates[0]?.trackedMinutes ?? 0}
                reportDate={reportDate}
                taskId={task.id}
                taskTitle={task.taskTitle}
              />
            ) : null
          }
        />
        </div>
      </div>
    );
  }

  const selectedTaskDraft = selectedTask ? getDraft(selectedTask.id) : null;
  const selectedTaskReasonSections = selectedTask?.latestRequest ? getReasonSections(selectedTask.latestRequest.reason) : [];
  const selectedRequestReasonSections = selectedRequest ? getReasonSections(selectedRequest.reason) : [];
  const themeStyles = getThemeStyles(theme);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {!(mode === "requests" && role === "manager") ? (
        /* Both axes declared: `overflow-x-auto` alone makes the browser compute
           overflow-y to auto too, which is where the vertical scrollbar down the
           right of the table came from. Paging handles length now. */
        <div className="history-table-shell min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-[20px] border border-[var(--panel-border)] p-1.5" style={themeStyles.shell}>
          {/* table-fixed is what makes the column widths below binding. Without
              it the browser sizes columns to their content, so one long task
              title widened the whole table, pushed Action off the edge and left
              a horizontal scrollbar — and `truncate` never fired, because the
              cell simply grew to fit the text. */}
          <Table className="table-fixed border-separate border-spacing-y-1.5">
            <THead>
              {/* TH defaults to px-4 py-3; this header only labels three columns
                  and does not need that much of the panel's height. */}
              {/* Date and Action are pinned to what their content actually needs,
                  so Task Details absorbs the rest instead of Action keeping a
                  band of empty space to the right of its buttons. */}
              <TR>
                <TH className="w-[8.5rem] px-3 py-1.5">Date</TH>
                <TH className="px-3 py-1.5">Task Details</TH>
                <TH className="w-[17rem] px-3 py-1.5">Action</TH>
              </TR>
            </THead>
            <TBody>
              {(pagedHistory ?? []).map((task) => {
                const latestStatus = task.updates[0]?.status;
                const recency = getRecencyMeta(task);
                const rowStyle = getRowStyle(theme, recency.tone ?? "default");
                const dateParts = formatHistoryDateParts(task.planDate);
                const startedParts = formatHistoryTimeParts(task.updates[0]?.actualStart);
                const endedParts = getResolvedEndTimeParts(task, liveNow);
                const continuationOverview = getContinuationOverview(task);
                const visibleNote = getHistoryNote(task);
                const overtimeMinutes = calculateTaskOvertimeMinutes({
                  planDate: task.planDate,
                  actualStart: task.updates[0]?.actualStart,
                  actualEnd: task.updates[0]?.actualEnd,
                });
                const autoStopLabel = getTaskAutoStopLabel({
                  planDate: task.planDate,
                  status: latestStatus,
                  actualEnd: task.updates[0]?.actualEnd,
                });

                return (
                  <TR
                    key={task.id}
                    className="align-top border-0"
                  >
                    <TD
                      className={`${recency.row} w-[8.5rem] cursor-pointer border border-r-0 px-3 py-2 text-[var(--foreground)]`}
                      onClick={() => setSelectedTask(task)}
                      style={rowStyle}
                    >
                      {/* Day, month and weekday on two tight lines instead of a
                          28px numeral stacked over its own rows. */}
                      <div className="flex flex-col gap-1">
                        {/* nowrap: "16 Aug 2026" was breaking after the month in
                            the narrower rows, so the column looked ragged. */}
                        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                          <span className="font-mono text-[1.05rem] font-black leading-none tabular-nums text-[var(--foreground)]">
                            {dateParts.day}
                          </span>
                          <span className="text-[0.72rem] font-semibold text-[var(--muted-foreground)]">{dateParts.monthYear}</span>
                        </div>
                        {/* Weekday and the TODAY chip on one line: three stacked
                            lines in a narrow cell read as clutter. */}
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                            {dateParts.weekday}
                          </span>
                          {recency.label ? (
                            <span className={`inline-flex rounded-full px-1.5 py-px text-[0.55rem] font-bold uppercase tracking-[0.1em] ${recency.chip}`}>
                              {recency.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TD>
                    <TD
                      className={`${recency.row} cursor-pointer border-y px-3 py-2 text-[var(--foreground)]`}
                      onClick={() => setSelectedTask(task)}
                      style={rowStyle}
                    >
                      <div className="flex flex-col gap-1.5 xl:flex-row xl:items-start xl:justify-between xl:gap-3">
                        <div className="min-w-0 flex-1">
                          {/* "Created for <date>" dropped: the date column beside
                              this already carries it, on every single row. */}
                          <p className="truncate text-[0.88rem] font-bold leading-tight text-[var(--foreground)]">{task.taskTitle}</p>
                          {visibleNote ? (
                            <p className="mt-0.5 line-clamp-1 text-[0.72rem] leading-4 text-[var(--muted-foreground)]">
                              {visibleNote}
                            </p>
                          ) : null}
                        </div>
                        {/* Start and end side by side, times only — the day is in
                            the date column, so repeating it here cost two lines. */}
                        {/* Label above value and a fixed width: side by side the
                            time wrapped onto a second line in one box but not the
                            other, so the two never lined up. */}
                        <div className="flex shrink-0 items-stretch gap-1.5 xl:w-[12.5rem]">
                          <div className="flex-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]/70 px-2 py-1 text-center">
                            <p className="text-[0.5rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Start</p>
                            <p className={`mt-0.5 whitespace-nowrap font-mono text-[0.72rem] font-bold leading-none tabular-nums ${startedParts.isSet ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                              {formatTimeLabel(startedParts)}
                            </p>
                          </div>
                          <div className="flex-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]/70 px-2 py-1 text-center">
                            <p className="text-[0.5rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">End</p>
                            <p className={`mt-0.5 whitespace-nowrap font-mono text-[0.72rem] font-bold leading-none tabular-nums ${endedParts.isLive ? "text-emerald-600" : endedParts.isSet ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                              {formatTimeLabel(endedParts)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold text-[var(--foreground)]" style={themeStyles.departmentChip}>
                          {task.department.name}
                        </span>
                        {/* Badge ships with tracking-[0.24em], which stretched
                            "In Progress" wider than the task title beside it. */}
                        <Badge className="px-2 py-0.5 text-[0.6rem] tracking-[0.06em]" variant={statusVariant(latestStatus)}>
                          {formatStatusLabel(latestStatus)}
                        </Badge>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${getTrackedTone(task.updates[0]?.trackedMinutes ?? 0)}`}>
                          {formatTrackedMinutes(task.updates[0]?.trackedMinutes ?? 0)}
                        </span>
                        {continuationOverview ? (
                          <span className="inline-flex rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-violet-600">
                            {continuationOverview.totalDays} work day{continuationOverview.totalDays > 1 ? "s" : ""}
                          </span>
                        ) : null}
                        {continuationOverview ? (
                          <span className="inline-flex rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-sky-600">
                            Total {formatMinutesAsHours(continuationOverview.overallTrackedMinutes)}
                          </span>
                        ) : null}
                        {overtimeMinutes > 0 ? (
                          <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-emerald-600">
                            Overtime {formatMinutes(overtimeMinutes)}
                          </span>
                        ) : null}
                        {autoStopLabel ? (
                          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-amber-600">
                            {autoStopLabel}
                          </span>
                        ) : null}
                      </div>
                    </TD>
                    {/* Buttons shrunk here rather than in renderAction, which is
                        shared with the request-review mode. */}
                    <TD
                      className={`${recency.row} w-[17rem] border border-l-0 px-2 py-2 align-top text-[var(--foreground)] [&_button]:h-7 [&_button]:px-2 [&_button]:text-[0.68rem] [&_svg]:h-3 [&_svg]:w-3`}
                      style={rowStyle}
                    >
                      {renderAction(task)}
                    </TD>
                  </TR>
                );
              })}
              {(visibleHistory ?? []).length ? null : (
                <TR className="border-0">
                  <TD className="border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-6" colSpan={3}>
                    <div className="flex flex-col items-center justify-center gap-1.5 text-center">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-violet-500">
                        <ClipboardList className="h-4 w-4" />
                      </span>
                      <p className="text-[0.85rem] font-semibold text-[var(--foreground)]">Nothing logged here yet</p>
                      <p className="max-w-[42ch] text-[0.78rem] text-[var(--muted-foreground)]">
                        Saved tasks appear here once a day is planned or reported.
                      </p>
                    </div>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      ) : null}

      {!(mode === "requests" && role === "manager") && totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
            {firstIndex + 1}-{firstIndex + pagedHistory.length} of {visibleHistory.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              className={historyPagerClass}
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              type="button"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="px-1 font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
              {currentPage} / {totalPages}
            </span>
            <button
              className={historyPagerClass}
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              type="button"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {selectedTask && isClient
        ? createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
          <div
            className="fixed left-1/2 top-1/2 z-[90] max-h-[90vh] w-[min(960px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#4f5ef7]">
                  {mode === "requests" ? "Request Details" : "Report Preview"}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{selectedTask.taskTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selectedTask.department.name} - {toDateOnly(selectedTask.planDate)}
                </p>
              </div>
              <Button onClick={() => setSelectedTask(null)} size="icon" type="button" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              {(() => {
                const selectedOvertimeMinutes = calculateTaskOvertimeMinutes({
                  planDate: selectedTask.planDate,
                  actualStart: selectedTask.updates[0]?.actualStart,
                  actualEnd: selectedTask.updates[0]?.actualEnd,
                });
                const selectedEndedParts = getResolvedEndTimeParts(selectedTask, liveNow);
                const selectedAutoStopLabel = getTaskAutoStopLabel({
                  planDate: selectedTask.planDate,
                  status: selectedTask.updates[0]?.status,
                  actualEnd: selectedTask.updates[0]?.actualEnd,
                });

                return (
                  <>
                    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(selectedTask.updates[0]?.status)}>
                          {selectedTask.updates[0]?.status ?? "planned"}
                        </Badge>
                        <span className="rounded-full bg-[var(--panel-muted)] px-3 py-1 text-sm font-semibold text-[var(--foreground)]">
                          {formatMinutes(selectedTask.updates[0]?.trackedMinutes ?? 0)}
                        </span>
                        {selectedOvertimeMinutes > 0 ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                            Overtime {formatMinutes(selectedOvertimeMinutes)}
                          </span>
                        ) : null}
                        {selectedAutoStopLabel ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                            {selectedAutoStopLabel}
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Started</dt>
                          <dd className="mt-1 text-base font-semibold text-[var(--foreground)]">{formatTimeLabel(formatHistoryTimeParts(selectedTask.updates[0]?.actualStart))}</dd>
                          <dd className="text-sm text-[var(--muted-foreground)]">{formatHistoryTimeParts(selectedTask.updates[0]?.actualStart).date}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Ended</dt>
                          <dd className={`mt-1 text-base font-semibold ${selectedEndedParts.isLive ? "text-emerald-600" : "text-[var(--foreground)]"}`}>
                            {formatTimeLabel(selectedEndedParts)}
                          </dd>
                          <dd className={`text-sm ${selectedEndedParts.isLive ? "text-emerald-600" : "text-[var(--muted-foreground)]"}`}>
                            {selectedEndedParts.date}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Completion</dt>
                          <dd className="mt-1 text-base font-semibold text-[var(--foreground)]">{selectedTask.updates[0]?.completionPercent ?? 0}%</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Difficulty</dt>
                          <dd className="mt-1 text-base font-semibold text-[var(--foreground)]">{selectedTask.updates[0]?.difficultyLevel || "Not set"}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Reminder / Note</p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--foreground)] dark:text-white/90">
                        {getHistoryNote(selectedTask) || "No extra note added for this task."}
                      </p>
                    </div>
                  </>
                );
              })()}

              {!extractContinuationMeta(selectedTask.taskDescription) ? (
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Work Activity</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">Single-day work summary</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-[var(--panel-muted)] px-3 py-1 text-[var(--foreground)]">1 day</span>
                      <span className="rounded-full bg-[var(--panel-muted)] px-3 py-1 text-[var(--foreground)]">
                        Total {formatMinutes(selectedTask.updates[0]?.trackedMinutes ?? 0)}
                      </span>
                      <span className="rounded-full bg-[var(--panel-muted)] px-3 py-1 text-[var(--foreground)]">
                        {toDateOnly(selectedTask.planDate)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/60 bg-white/75 p-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/20 dark:text-white/85">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800 dark:bg-white/10 dark:text-white/85">
                        {toDateOnly(selectedTask.planDate)}
                      </span>
                      <span className="text-xs font-semibold">{selectedTask.updates[0]?.completionPercent ?? 0}% complete</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-white/65">
                      Worked {formatMinutes(selectedTask.updates[0]?.trackedMinutes ?? 0)}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm">
                      {selectedTask.updates[0]?.note?.trim() || "No note added for this work day."}
                    </p>
                  </div>
                </div>
              ) : null}

              {extractContinuationMeta(selectedTask.taskDescription) ? (
                <div className="rounded-2xl border border-violet-300/40 bg-violet-50 p-4 dark:border-violet-400/30 dark:bg-violet-500/10">
                  <p className="text-xs uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">Work Activity</p>
                  {(() => {
                    const continuationOverview = getContinuationOverview(selectedTask);

                    if (!continuationOverview) {
                      return null;
                    }

                    return (
                      <div className="mt-3 space-y-4 text-sm text-slate-700 dark:text-white/90">
                        <dl className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">Started From</dt>
                            <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{continuationOverview.sourceDate || "Previous day"}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">Work Days</dt>
                            <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                              {continuationOverview.totalDays} day{continuationOverview.totalDays > 1 ? "s" : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">Current Day</dt>
                            <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                              {formatMinutesAsHours(continuationOverview.currentTrackedMinutes)} • {continuationOverview.currentProgress}%
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">Overall Work</dt>
                            <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                              {formatMinutesAsHours(continuationOverview.overallTrackedMinutes)}
                            </dd>
                          </div>
                        </dl>
                        {continuationOverview.lastNote ? (
                          <div className="rounded-2xl border border-violet-200 bg-white/70 px-3 py-3 text-sm text-slate-700 dark:border-violet-300/20 dark:bg-slate-950/20 dark:text-white/85">
                            <span className="font-semibold text-violet-700 dark:text-violet-200">Last Note:</span>{" "}
                            {continuationOverview.lastNote}
                          </div>
                        ) : null}
                        {continuationOverview.dailyLogs.length ? (
                      <div className="rounded-2xl border border-violet-200 bg-white/75 p-3 dark:border-violet-300/20 dark:bg-slate-950/20">
                        <p className="text-xs uppercase tracking-[0.18em] text-violet-700 dark:text-violet-100">Daily Work Log</p>
                        <div className="mt-2 space-y-2">
                          {(continuationOverview.dailyLogs ?? []).map((entry) => (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-white/85" key={`${selectedTask.id}-${entry.date}`}>
                              <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800 dark:bg-white/10 dark:text-white/85">{entry.date}</span>
                              <span>{entry.progress}% done</span>
                              <span>{entry.trackedMinutes} min</span>
                              {entry.note ? <span className="text-slate-500 dark:text-white/70">Note: {entry.note}</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button disabled={loadingId === selectedTask.id} onClick={() => restoreTaskToDashboard(selectedTask, { autoStart: true })} size="sm" variant="outline">
                  Resume On Dashboard
                </Button>
                <Link href={`/dashboard/report?date=${toDateOnly(selectedTask.planDate)}&taskId=${selectedTask.id}`}>
                  <Button size="sm" variant="secondary">
                    Open Editor
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}

      {selectedRequest && isClient
        ? createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-sm" onClick={() => setSelectedRequest(null)}>
          <div
            className="fixed left-1/2 top-1/2 z-[90] max-h-[90vh] w-[min(960px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#4f5ef7]">Pending Approval</p>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{selectedRequest.dailyTask.taskTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selectedRequest.requestedBy.name} - {selectedRequest.requestedBy.department?.name ?? "No department"} - {toDateOnly(selectedRequest.dailyTask.planDate)}
                </p>
              </div>
              <Button onClick={() => setSelectedRequest(null)} size="icon" type="button" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Employee Request</p>
                <div className="mt-3 space-y-3">
                  {(selectedRequestReasonSections ?? []).map((section, index) => (
                    <div key={`${section.label}-${index}`}>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{section.label}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-[var(--foreground)] dark:text-white/90">{section.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Textarea
                placeholder="Optional note for the employee. Example: approved, update final time carefully."
                value={reviewNotes[selectedRequest.id] ?? ""}
                onChange={(event) => setReviewNotes((current) => ({ ...current, [selectedRequest.id]: event.target.value }))}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={loadingId === selectedRequest.id}
                  onClick={() => reviewRequest(selectedRequest.id, "approved")}
                  size="sm"
                  type="button"
                >
                  Approve
                </Button>
                <Button
                  disabled={loadingId === selectedRequest.id}
                  onClick={() => reviewRequest(selectedRequest.id, "rejected")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
