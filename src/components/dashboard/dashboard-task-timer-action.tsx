"use client";

import type { ReactNode } from "react";
import { savePersonalTimer } from "@/lib/task-workflow-client";
import { Pause, Play, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ATTENDANCE_STARTED_EVENT, ATTENDANCE_STOPPED_EVENT } from "@/lib/dashboard-live-events";
import {
  readTaskTimerSnapshot,
  TASK_TIMER_ROLLED_OVER_EVENT,
  type SharedTaskTimerSnapshot,
  type TaskTimerRolledOverPayload,
  writeTaskTimerSnapshot,
} from "@/lib/task-timer-storage";
import { bankTaskTimerSegment } from "@/lib/task-timer-math";
import { formatTimeOnlyInDhaka, parseDhakaDateTime, toDateTimeInputValue } from "@/lib/utils";

type DashboardTaskTimerActionProps = {
  taskId: string;
  taskTitle?: string;
  reportDate: string;
  canEdit: boolean;
  initialStatus: "done" | "in_progress" | "pending";
  initialTrackedMinutes: number;
  initialActualStart?: Date | string | null;
  initialActualEnd?: Date | string | null;
  compact?: boolean;
  variant?: "default" | "table";
  /**
   * Whether the workday is currently checked in. Leave undefined on surfaces that
   * should not be gated by attendance at all (the history page edits past days),
   * which is why this is a tri-state rather than a plain boolean.
   */
  initialAttendanceRunning?: boolean;
  onDoneClick?: () => void;
  onSnapshotChange?: (snapshot: TaskTimerSnapshot) => void;
  afterDoneSlot?: ReactNode;
  workflowBusy?: boolean;
  onSavingChange?: (saving: boolean) => void;
};

export type TaskTimerSnapshot = {
  sampledAt?: number;
  status: "done" | "in_progress" | "pending";
  trackedMinutes: string;
  trackedSeconds: string;
  actualStart: string;
  actualEnd: string;
  runningStartedAt: string;
};

/**
 * A stop timestamp that keeps its seconds.
 *
 * `toDhakaOffsetIso` writes ":00" for seconds, which is right for attendance but
 * wrong here: stopTimerAt measures the session as (stop - runningStartedAt), and
 * runningStartedAt is full precision. Truncating the stop to the top of the
 * minute makes that difference negative for any session started and ended inside
 * the same minute, so the elapsed time was floored to zero and silently thrown
 * away — the first pause on a fresh task banked nothing, which is why the button
 * came back as "Start" instead of "Resume".
 */
function nowIsoWithSeconds() {
  return new Date().toISOString();
}

function toInputDateTime(value?: Date | string | null) {
  if (!value) return "";
  return toDateTimeInputValue(value);
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatCompactDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function toClockValue(value: string) {
  if (!value) {
    return "";
  }

  return toDateTimeInputValue(value).slice(11, 16);
}

export function DashboardTaskTimerAction({
  taskId,
  taskTitle,
  reportDate,
  canEdit,
  initialStatus,
  initialTrackedMinutes,
  initialActualStart,
  initialActualEnd,
  compact = false,
  variant = "default",
  initialAttendanceRunning,
  onDoneClick,
  onSnapshotChange,
  afterDoneSlot,
  workflowBusy = false,
  onSavingChange,
}: DashboardTaskTimerActionProps) {
  const router = useRouter();
  const storageKey = useMemo(() => `dashboard-task-timer:${reportDate}:${taskId}`, [reportDate, taskId]);
  const storageLoadedRef = useRef(false);
  const autoStoppingRef = useRef(false);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);
  const [status, setStatus] = useState<"done" | "in_progress" | "pending">(initialStatus);
  const [trackedMinutes, setTrackedMinutes] = useState(String(initialTrackedMinutes));
  const [trackedSeconds, setTrackedSeconds] = useState(initialTrackedMinutes * 60);
  const [actualStart, setActualStart] = useState(toInputDateTime(initialActualStart));
  const [actualEnd, setActualEnd] = useState(toInputDateTime(initialActualEnd));
  const [runningStartedAt, setRunningStartedAt] = useState("");
  /*
   * Check in/out is echoed straight to the timers so the Start button locks the
   * instant the user checks out, instead of staying live until router.refresh()
   * brings the new server prop back. null means "no event seen yet, trust the
   * prop"; the prop being undefined means this surface is not gated at all.
   */
  const [liveAttendanceRunning, setLiveAttendanceRunning] = useState<boolean | null>(null);
  const attendanceRunning = liveAttendanceRunning ?? initialAttendanceRunning;
  const attendanceBlocksStart = attendanceRunning === false;
  const isCompleted = status === "done";
  // Completed work must go through the reason-required Reopen flow so its
  // completion snapshot and reopen reason are preserved in the audit history.
  // A task cannot be started or resumed once the workday is closed, or its
  // minutes would accrue against a day the user has already checked out of.
  const canStart =
    canEdit &&
    !saving &&
    !workflowBusy &&
    !isCompleted &&
    !runningStartedAt &&
    !attendanceBlocksStart;
  // Deliberately not gated on attendance: stopping the clock must always be
  // possible, even once the workday is closed.
  const canPause = canEdit && !saving && !workflowBusy && Boolean(runningStartedAt);
  const canDone = canEdit && !saving && !workflowBusy && !isCompleted && Boolean(onDoneClick);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    const parsed = readTaskTimerSnapshot(reportDate, taskId);
    if (initialStatus === "done" || parsed?.status === "done") {
      const completedSnapshot: SharedTaskTimerSnapshot = {
        status: initialStatus,
        trackedMinutes: String(initialTrackedMinutes),
        trackedSeconds: String(initialTrackedMinutes * 60),
        actualStart: toInputDateTime(initialActualStart),
        actualEnd: toInputDateTime(initialActualEnd),
        runningStartedAt: "",
      };

      writeTaskTimerSnapshot(reportDate, taskId, completedSnapshot);
      queueMicrotask(() => {
        setStatus(initialStatus);
        setTrackedMinutes(String(initialTrackedMinutes));
        setTrackedSeconds(initialTrackedMinutes * 60);
        setActualStart(toInputDateTime(initialActualStart));
        setActualEnd(toInputDateTime(initialActualEnd));
        setRunningStartedAt("");
        storageLoadedRef.current = true;
      });
      return;
    }

    if (!parsed) { storageLoadedRef.current = true; return; }
    queueMicrotask(() => {
      setStatus(parsed.status);
      setTrackedMinutes(parsed.trackedMinutes);
      setTrackedSeconds(Number(parsed.trackedSeconds ?? String(Number(parsed.trackedMinutes || 0) * 60)));
      setActualStart(parsed.actualStart);
      setActualEnd(parsed.actualEnd);
      setRunningStartedAt(parsed.runningStartedAt);
      storageLoadedRef.current = true;
    });
  }, [initialActualEnd, initialActualStart, initialStatus, initialTrackedMinutes, isHydrated, reportDate, storageKey, taskId]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || !canEdit || runningStartedAt || status === "done") {
      return;
    }

    const raw = window.sessionStorage.getItem("dashboard-task-autostart");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { taskId?: string; reportDate?: string; timestamp?: number };
      const isFresh = typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp < 15000;

      if (parsed.taskId === taskId && parsed.reportDate === reportDate && isFresh) {
        window.sessionStorage.removeItem("dashboard-task-autostart");
        void startTimer();
        return;
      }
    } catch {
      window.sessionStorage.removeItem("dashboard-task-autostart");
      return;
    }
    // startTimer intentionally reads the current timer state. Adding the
    // recreated function here would rerun auto-start on every one-second tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, isHydrated, reportDate, runningStartedAt, status, taskId]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || !storageLoadedRef.current) {
      return;
    }

    const snapshot: SharedTaskTimerSnapshot = {
      status,
      trackedMinutes,
      trackedSeconds: String(trackedSeconds),
      actualStart,
      actualEnd,
      runningStartedAt,
    };

    writeTaskTimerSnapshot(reportDate, taskId, snapshot);
  }, [actualEnd, actualStart, isHydrated, reportDate, runningStartedAt, status, storageKey, taskId, trackedMinutes, trackedSeconds]);


  useEffect(() => {
    autoStoppingRef.current = false;
  }, [reportDate, runningStartedAt]);

  useEffect(() => {
    // Undefined prop = this surface opted out of attendance gating entirely, so
    // don't let the events pull it into a gated state.
    if (initialAttendanceRunning === undefined) {
      return;
    }

    const handleStarted = () => setLiveAttendanceRunning(true);
    const handleStopped = () => setLiveAttendanceRunning(false);

    window.addEventListener(ATTENDANCE_STARTED_EVENT, handleStarted);
    window.addEventListener(ATTENDANCE_STOPPED_EVENT, handleStopped);
    return () => {
      window.removeEventListener(ATTENDANCE_STARTED_EVENT, handleStarted);
      window.removeEventListener(ATTENDANCE_STOPPED_EVENT, handleStopped);
    };
  }, [initialAttendanceRunning]);

  useEffect(() => {
    function handleDayRollover(event: Event) {
      const detail = (event as CustomEvent<TaskTimerRolledOverPayload>).detail;
      if (detail?.taskId !== taskId || detail.reportDate !== reportDate) {
        return;
      }

      setStatus(detail.snapshot.status);
      setTrackedMinutes(detail.snapshot.trackedMinutes);
      setTrackedSeconds(
        Number(
          detail.snapshot.trackedSeconds ??
            String(Number(detail.snapshot.trackedMinutes || 0) * 60),
        ),
      );
      setActualStart(detail.snapshot.actualStart);
      setActualEnd(detail.snapshot.actualEnd);
      setRunningStartedAt("");
    }

    window.addEventListener(TASK_TIMER_ROLLED_OVER_EVENT, handleDayRollover);
    return () =>
      window.removeEventListener(TASK_TIMER_ROLLED_OVER_EVENT, handleDayRollover);
  }, [reportDate, taskId]);

  const trackedSecondsBase = trackedSeconds;
  const liveSessionSeconds =
    now !== null && runningStartedAt && !Number.isNaN(new Date(runningStartedAt).getTime())
      ? bankTaskTimerSegment(trackedSecondsBase, runningStartedAt, now)
      : trackedSecondsBase;
  // The first start timestamp is an audit/display field, not an accumulator.
  // Counting from it on every Resume included every paused gap (and, for a
  // carried task, the overnight gap). Only banked seconds plus the current
  // running segment are billable.
  const liveTrackedSeconds = liveSessionSeconds;
  const liveMinutes = String(Math.floor(liveTrackedSeconds / 60));
  const snapshotSignature = `${status}|${actualStart}|${actualEnd}|${runningStartedAt}|${liveMinutes}|${liveTrackedSeconds}`;
  const lastSentSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!onSnapshotChange) {
      return;
    }

    if (lastSentSignatureRef.current === snapshotSignature) {
      return;
    }

    lastSentSignatureRef.current = snapshotSignature;

    onSnapshotChange({
      sampledAt: now,
      status,
      trackedMinutes: liveMinutes,
      trackedSeconds: String(liveTrackedSeconds),
      actualStart,
      actualEnd,
      runningStartedAt,
    });
  }, [actualEnd, actualStart, liveMinutes, liveTrackedSeconds, now, onSnapshotChange, runningStartedAt, snapshotSignature, status]);
  const shouldShowResumeLabel =
    !runningStartedAt && (status === "in_progress" || trackedSecondsBase > 0);
  const startClockValue = toClockValue(actualStart);
  const endClockValue = toClockValue(actualEnd);

  async function persistUpdate(next: SharedTaskTimerSnapshot, options?: { refresh?: boolean; successMessage?: string }) {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await savePersonalTimer(taskId, reportDate, next);
      if (options?.successMessage) toast.success(options.successMessage);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task timer update failed. Check your connection and try again.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function startTimer() {
    if (!canStart) {
      return;
    }

    const savedSnapshot = readTaskTimerSnapshot(reportDate, taskId);
    const resumedTrackedSeconds = Math.max(
      trackedSeconds,
      Number(savedSnapshot?.trackedSeconds ?? String(Number(savedSnapshot?.trackedMinutes || 0) * 60)),
    );
    const timestamp = new Date();
    const timestampInput = toDateTimeInputValue(timestamp);
    const nextActualStart = actualStart || savedSnapshot?.actualStart || timestampInput;
    const nextTrackedSeconds = resumedTrackedSeconds;
    const timestampIso = timestamp.toISOString();
    const nextSnapshot: SharedTaskTimerSnapshot = {
      status: "in_progress",
      trackedMinutes: String(Math.floor(nextTrackedSeconds / 60)),
      trackedSeconds: String(nextTrackedSeconds),
      actualStart: nextActualStart,
      actualEnd: "",
      runningStartedAt: timestampIso,
    };

    if (!await persistUpdate(nextSnapshot, {successMessage:'Task timer started.'})) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-start", { detail: { source: `task:${taskId}`, label: taskTitle || `Task ${taskId.slice(0, 8)}` } }));
    setStatus(nextSnapshot.status);
    setTrackedMinutes(nextSnapshot.trackedMinutes);
    setTrackedSeconds(nextTrackedSeconds);
    setActualStart(nextSnapshot.actualStart);
    setActualEnd("");
    setRunningStartedAt(timestampIso);

    writeTaskTimerSnapshot(reportDate, taskId, nextSnapshot);
    router.refresh();
  }

  async function stopTimerAt(timestampIso: string, successMessage: string) {
    const timestamp = parseDhakaDateTime(timestampIso);
    const timestampInput = toDateTimeInputValue(timestampIso);
    const runningStart = runningStartedAt ? new Date(runningStartedAt).getTime() : Number.NaN;
    const stopAt = timestamp?.getTime() ?? Number.NaN;
    const liveSecondsAtCutoff =
      Number.isFinite(runningStart) && Number.isFinite(stopAt)
        ? bankTaskTimerSegment(trackedSecondsBase, runningStart, stopAt)
        : liveTrackedSeconds;
    const nextTrackedMinutes = String(Math.floor(liveSecondsAtCutoff / 60));
    const nextSnapshot: SharedTaskTimerSnapshot = {
      status: "in_progress",
      trackedMinutes: nextTrackedMinutes,
      trackedSeconds: String(liveSecondsAtCutoff),
      actualStart: actualStart || timestampInput,
      actualEnd: timestampInput,
      runningStartedAt: "",
    };

    if (!await persistUpdate(nextSnapshot, {successMessage})) return false;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-stop", { detail: { source: `task:${taskId}` } }));
    setStatus("in_progress");
    setTrackedMinutes(nextTrackedMinutes);
    setTrackedSeconds(liveSecondsAtCutoff);
    setActualStart(nextSnapshot.actualStart);
    setActualEnd(timestampInput);
    setRunningStartedAt("");

    writeTaskTimerSnapshot(reportDate, taskId, nextSnapshot);
    router.refresh();
    return true;
  }

  async function pauseTimer() {
    if (!canPause) {
      return;
    }

    // Same path as the day-end auto-stop: the session is banked into
    // trackedSeconds and status stays in_progress, so Start comes back as
    // "Resume" and picks up from the accumulated total.
    await stopTimerAt(nowIsoWithSeconds(), "Task timer paused.");
  }

  function handleDoneClick() {
    // Opening or cancelling the dialog is not a timer transition. Only a
    // successful Done save may mark completed work and stop its local clock.
    if (canDone && !savingRef.current) onDoneClick?.();
  }

  // This component owns manual pause/done and attendance stop. The shared
  // TaskTimerAutoCloser performs the Dhaka-midnight boundary sweep so every
  // mounted timer and crash-recovery snapshot follows the same daily rule.

  useEffect(() => {
    // Nothing to stop, and no listener to leak, when this task is not counting.
    if (!runningStartedAt || saving) {
      return;
    }

    function handleAttendanceStopped() {
      if (autoStoppingRef.current) {
        return;
      }

      autoStoppingRef.current = true;
      void stopTimerAt(nowIsoWithSeconds(), "Task timer stopped with attendance.");
    }

    window.addEventListener(ATTENDANCE_STOPPED_EVENT, handleAttendanceStopped);
    return () => window.removeEventListener(ATTENDANCE_STOPPED_EVENT, handleAttendanceStopped);
    // Deliberately not depending on the per-second timer values: stopTimerAt
    // derives the session from runningStartedAt and the stop timestamp, and the
    // base it adds to (trackedSecondsBase, actualStart) is frozen for as long as
    // the timer runs. Including them would tear this listener down and rebuild it
    // on every tick for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningStartedAt, saving]);

  const buttonClass = compact
    ? "h-6 min-w-[3rem] shrink-0 justify-center rounded-md border px-1.5 text-[0.5rem] font-semibold transition-colors duration-200 min-[420px]:min-w-[3.25rem] min-[420px]:px-2 min-[420px]:text-[0.5625rem] min-[560px]:min-w-[3.5rem] min-[560px]:px-2.5 min-[560px]:text-[0.625rem]"
    : "h-7 min-w-[5rem] justify-center rounded-md border px-2.5 text-xs font-semibold transition-colors duration-200";
  // Soft fills, not solid colour: a light tint plus solid text, the same
  // convention the chips use, so the row reads calmly instead of shouting.
  // Start is green (go), Pause is amber (hold), Done is the app's own brand
  // indigo (the primary action on the row).
  const startButtonClass = `${buttonClass} task-btn-go`;
  const pauseButtonClass = `${buttonClass} task-btn-hold`;
  const doneButtonClass = `${buttonClass} task-btn-primary`;

  if (variant === "table") {
    const tableCellClass =
      "border-b border-r border-[var(--workplan-grid)] px-2 py-1.5 align-middle last:border-r-0";

    return (
      <>
        <td className={tableCellClass}>
          <div className="flex min-w-0 items-center gap-1.5">
            {runningStartedAt ? (
              <Button
                className={pauseButtonClass}
                disabled={!canPause}
                onClick={pauseTimer}
                type="button"
                variant="ghost"
              >
                <Pause className="h-3 w-3" />
                Pause
              </Button>
            ) : (
              <Button
                className={startButtonClass}
                disabled={!canStart}
                onClick={startTimer}
                title={
                  attendanceBlocksStart
                    ? "Check in first — the workday timer is stopped."
                    : undefined
                }
                type="button"
                variant="ghost"
              >
                <Play className="h-3 w-3" />
                {shouldShowResumeLabel ? "Resume" : "Start"}
              </Button>
            )}
            <span
              className="min-w-0 truncate text-[0.58rem] font-semibold tabular-nums text-[var(--muted-foreground)]"
              title={`Tracked: ${formatDuration(liveTrackedSeconds)}`}
            >
              {formatCompactDuration(liveTrackedSeconds)}
            </span>
          </div>
        </td>
        <td className={tableCellClass}>
          <div className="flex items-center justify-center gap-1">
            <Button
              className={doneButtonClass}
              disabled={!canDone}
              onClick={handleDoneClick}
              type="button"
              variant="ghost"
            >
              Done
            </Button>
            {afterDoneSlot ?? null}
          </div>
        </td>
        <td className={tableCellClass}>
          <span className="block text-center text-[0.67rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
            {actualStart ? formatTimeOnlyInDhaka(actualStart) : "--:--"}
          </span>
        </td>
        <td className={tableCellClass}>
          <span className="block text-center text-[0.67rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
            {actualEnd ? formatTimeOnlyInDhaka(actualEnd) : "--:--"}
          </span>
        </td>
      </>
    );
  }

  if (isCompleted) return <div className="flex flex-wrap items-center gap-3 text-sm">
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-700">
      <Timer className="h-4 w-4" /> {formatDuration(trackedSecondsBase)}
    </span>
    {afterDoneSlot}
  </div>;

  return (
    <div className={compact ? "flex w-full min-w-0 max-w-full flex-col gap-1" : "flex min-w-[10.625rem] flex-col gap-2"}>
      <div className={compact ? "flex min-w-0 flex-wrap items-center gap-1" : "flex flex-wrap items-center gap-1.5"}>
        {/* Pause takes Start's place while running rather than sitting beside it:
            the two are never usable at the same time, and the row has no width to
            spare on the single-screen dashboard. */}
        {runningStartedAt ? (
          <Button
            className={pauseButtonClass}
            disabled={!canPause}
            onClick={pauseTimer}
            type="button"
            variant="ghost"
          >
            <Pause className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            Pause
          </Button>
        ) : (
          <Button
            className={startButtonClass}
            disabled={!canStart}
            onClick={startTimer}
            // A disabled button with no reason is a dead end; say why on hover.
            title={attendanceBlocksStart ? "Check in first — the workday timer is stopped." : undefined}
            type="button"
            variant="ghost"
          >
            <Play className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {shouldShowResumeLabel ? "Resume" : "Start"}
          </Button>
        )}
        {isCompleted ? null : (
          <Button
            className={doneButtonClass}
            disabled={!canDone}
            onClick={handleDoneClick}
            type="button"
            variant="ghost"
          >
            Done
          </Button>
        )}
        {afterDoneSlot ? afterDoneSlot : null}
      </div>
      {compact ? (
        /* Elapsed, start and end on one line. The elapsed chip sizes to its own
           text (auto) and the two fields split what is left, so the row holds
           together without the chip stealing a line of its own. */
        <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1">
          <span className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[0.5rem] font-semibold tabular-nums text-slate-600">
            <Timer className="h-3 w-3 text-[#4f5ef7]" />
            {formatDuration(liveTrackedSeconds)}
          </span>
          <Input
            className="h-6 min-w-0 border rounded-md border-slate-200 px-2 text-[0.5625rem] bg-white text-slate-600"
            disabled={!canEdit || saving || Boolean(runningStartedAt)}
            readOnly
            aria-label="Task start time"
            type="time"
            value={startClockValue}
          />
          <Input
            className="h-6 min-w-0 border rounded-md border-slate-200 px-2 text-[0.5625rem] bg-white text-slate-600"
            disabled={!canEdit || saving || Boolean(runningStartedAt) || !actualStart}
            readOnly
            aria-label="Task end time"
            type="time"
            value={endClockValue}
          />
        </div>
      ) : (
        <>
          <span className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[0.625rem] font-semibold tabular-nums text-slate-600">
            <Timer className="h-3.5 w-3.5 text-[#4f5ef7]" />
            {formatDuration(liveTrackedSeconds)}
          </span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Input
              disabled={!canEdit || saving || Boolean(runningStartedAt)}
              readOnly
            aria-label="Task start time"
              type="time"
              value={startClockValue}
            />
            <span className="hidden sm:inline" />
            <Input
              disabled={!canEdit || saving || Boolean(runningStartedAt) || !actualStart}
              readOnly
            aria-label="Task end time"
              type="time"
              value={endClockValue}
            />
          </div>
        </>
      )}
      {!compact ? (
        <p className="text-[0.6875rem] font-medium text-slate-500">
          {runningStartedAt
            ? `Started ${formatTimeOnlyInDhaka(actualStart || runningStartedAt)}`
            : actualStart
              ? actualEnd
                ? `Saved ${formatTimeOnlyInDhaka(actualStart)} - ${formatTimeOnlyInDhaka(actualEnd)}`
                : `Manual time ${formatTimeOnlyInDhaka(actualStart)}`
              : "Not started yet"}
        </p>
      ) : null}
    </div>
  );
}
