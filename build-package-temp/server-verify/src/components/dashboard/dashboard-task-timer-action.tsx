"use client";

import { Pause, Play, Square, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readTaskTimerSnapshot, type SharedTaskTimerSnapshot, writeTaskTimerSnapshot } from "@/lib/task-timer-storage";
import { toDateTimeInputValue } from "@/lib/utils";

type DashboardTaskTimerActionProps = {
  taskId: string;
  reportDate: string;
  canEdit: boolean;
  initialStatus: "done" | "in_progress" | "pending";
  initialTrackedMinutes: number;
  initialActualStart?: Date | string | null;
  initialActualEnd?: Date | string | null;
};

function toInputDateTime(value?: Date | string | null) {
  if (!value) return "";
  return toDateTimeInputValue(value);
}

function parseResponsePayload(raw: string) {
  if (!raw) {
    return { message: "Task timer update failed." };
  }

  try {
    return JSON.parse(raw) as { message?: string };
  } catch {
    return { message: "The server returned an unexpected page instead of JSON." };
  }
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function DashboardTaskTimerAction({
  taskId,
  reportDate,
  canEdit,
  initialStatus,
  initialTrackedMinutes,
  initialActualStart,
  initialActualEnd,
}: DashboardTaskTimerActionProps) {
  const router = useRouter();
  const storageKey = useMemo(() => `dashboard-task-timer:${reportDate}:${taskId}`, [reportDate, taskId]);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [now, setNow] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"done" | "in_progress" | "pending">(initialStatus);
  const [trackedMinutes, setTrackedMinutes] = useState(String(initialTrackedMinutes));
  const [trackedSeconds, setTrackedSeconds] = useState(initialTrackedMinutes * 60);
  const [actualStart, setActualStart] = useState(toInputDateTime(initialActualStart));
  const [actualEnd, setActualEnd] = useState(toInputDateTime(initialActualEnd));
  const [runningStartedAt, setRunningStartedAt] = useState("");
  const isCompleted = status === "done";
  const canStart = canEdit && !saving && !runningStartedAt;
  const canPause = canEdit && !saving && Boolean(runningStartedAt) && !isCompleted;
  const canEnd = canEdit && !saving && (Boolean(runningStartedAt) || Boolean(actualStart)) && !isCompleted;

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    const parsed = readTaskTimerSnapshot(reportDate, taskId);
    if (!parsed) {
      return;
    }

    if (initialStatus === "done" && parsed.status !== "done") {
      const completedSnapshot: SharedTaskTimerSnapshot = {
        status: "done",
        trackedMinutes: String(initialTrackedMinutes),
        trackedSeconds: String(initialTrackedMinutes * 60),
        actualStart: toInputDateTime(initialActualStart),
        actualEnd: toInputDateTime(initialActualEnd),
        runningStartedAt: "",
      };

      writeTaskTimerSnapshot(reportDate, taskId, completedSnapshot);
      setStatus("done");
      setTrackedMinutes(String(initialTrackedMinutes));
      setTrackedSeconds(initialTrackedMinutes * 60);
      setActualStart(toInputDateTime(initialActualStart));
      setActualEnd(toInputDateTime(initialActualEnd));
      setRunningStartedAt("");
      return;
    }

    setStatus(parsed.status);
    setTrackedMinutes(parsed.trackedMinutes);
    setTrackedSeconds(Number(parsed.trackedSeconds ?? String(Number(parsed.trackedMinutes || 0) * 60)));
    setActualStart(parsed.actualStart);
    setActualEnd(parsed.actualEnd);
    setRunningStartedAt(parsed.runningStartedAt);
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
  }, [canEdit, isHydrated, reportDate, runningStartedAt, status, taskId]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
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

  const trackedSecondsBase = trackedSeconds;
  const liveTrackedSeconds =
    now !== null && runningStartedAt && !Number.isNaN(new Date(runningStartedAt).getTime())
      ? trackedSecondsBase + Math.max(0, Math.floor((now - new Date(runningStartedAt).getTime()) / 1000))
      : trackedSecondsBase;
  const shouldShowResumeLabel = !runningStartedAt && (trackedSecondsBase > 0 || Boolean(actualStart));

  async function persistUpdate(next: SharedTaskTimerSnapshot, options?: { refresh?: boolean; successMessage?: string }) {
    setSaving(true);

    const response = await fetch("/api/dashboard/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDate,
        updates: [
          {
            dailyTaskId: taskId,
            status: next.status,
            note: "",
            completionPercent: next.status === "done" ? 100 : 0,
            trackedMinutes: Number(next.trackedMinutes || 0),
            actualStart: next.actualStart,
            actualEnd: next.actualEnd,
            difficultyLevel: "",
          },
        ],
      }),
    });

    const raw = await response.text();
    const result = parseResponsePayload(raw);
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message ?? "Task timer update failed.");
      return false;
    }

    if (options?.successMessage) {
      toast.success(options.successMessage);
    }

    if (options?.refresh) {
      router.refresh();
    }

    return true;
  }

  async function syncContinuation(action: "schedule_continuation" | "clear_continuation") {
    const response = await fetch(`/api/dashboard/tasks/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      return false;
    }

    return true;
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
    const timestampIso = timestamp.toISOString();
    const timestampInput = toDateTimeInputValue(timestamp);
    const nextSnapshot: SharedTaskTimerSnapshot = {
      status: "in_progress",
      trackedMinutes: String(Math.floor(resumedTrackedSeconds / 60)),
      trackedSeconds: String(resumedTrackedSeconds),
      actualStart: actualStart || savedSnapshot?.actualStart || timestampInput,
      actualEnd: "",
      runningStartedAt: timestampIso,
    };

    setStatus(nextSnapshot.status);
    setTrackedMinutes(nextSnapshot.trackedMinutes);
    setTrackedSeconds(resumedTrackedSeconds);
    setActualStart(nextSnapshot.actualStart);
    setActualEnd("");
    setRunningStartedAt(timestampIso);

    writeTaskTimerSnapshot(reportDate, taskId, nextSnapshot);
    await persistUpdate(nextSnapshot, { refresh: false, successMessage: "Task timer started." });
  }

  async function stopTimer() {
    if (!canEnd) {
      return;
    }

    const timestamp = new Date();
    const timestampInput = toDateTimeInputValue(timestamp);
    const nextTrackedMinutes = String(Math.floor(liveTrackedSeconds / 60));
    const nextSnapshot: SharedTaskTimerSnapshot = {
      status: "done",
      trackedMinutes: nextTrackedMinutes,
      trackedSeconds: String(liveTrackedSeconds),
      actualStart: actualStart || timestampInput,
      actualEnd: timestampInput,
      runningStartedAt: "",
    };

    setStatus("done");
    setTrackedMinutes(nextTrackedMinutes);
    setTrackedSeconds(liveTrackedSeconds);
    setActualStart(nextSnapshot.actualStart);
    setActualEnd(timestampInput);
    setRunningStartedAt("");

    writeTaskTimerSnapshot(reportDate, taskId, nextSnapshot);
    await syncContinuation("clear_continuation");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        `task-popup-completed-event:${getTodayKey()}`,
        JSON.stringify({
          taskId,
          title: "recently completed",
          timestamp: Date.now(),
        }),
      );
    }
    await persistUpdate(nextSnapshot, { refresh: true, successMessage: "Task completed and saved." });
  }

  async function pauseTimer() {
    if (!canPause) {
      return;
    }

    const nextTrackedMinutes = String(Math.floor(liveTrackedSeconds / 60));
    const nextSnapshot: SharedTaskTimerSnapshot = {
      status: "in_progress",
      trackedMinutes: nextTrackedMinutes,
      trackedSeconds: String(liveTrackedSeconds),
      actualStart,
      actualEnd: "",
      runningStartedAt: "",
    };

    setStatus("in_progress");
    setTrackedMinutes(nextTrackedMinutes);
    setTrackedSeconds(liveTrackedSeconds);
    setRunningStartedAt("");

    writeTaskTimerSnapshot(reportDate, taskId, nextSnapshot);
    await syncContinuation("schedule_continuation");
    await persistUpdate(nextSnapshot, { refresh: false, successMessage: "Task paused." });
  }

  return (
    <div className="flex min-w-[170px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="button-force-white !text-white [&_svg]:!text-white h-8 min-w-[84px] justify-center rounded-full bg-[#19a46b] px-3 text-xs font-semibold hover:bg-[#14885a]"
          disabled={!canStart}
          onClick={startTimer}
          type="button"
          variant="default"
        >
          <Play className="h-3.5 w-3.5" />
          {isCompleted ? "Start Again" : shouldShowResumeLabel ? "Resume" : "Start"}
        </Button>
        {isCompleted ? null : (
          <>
            <Button
              className="button-force-white !text-white [&_svg]:!text-white h-8 min-w-[84px] justify-center rounded-full bg-amber-500 px-3 text-xs font-semibold hover:bg-amber-600 disabled:bg-amber-300 disabled:text-white disabled:opacity-100"
              disabled={!canPause}
              onClick={pauseTimer}
              type="button"
              variant="default"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </Button>
            <Button
              className="button-force-white !text-white [&_svg]:!text-white h-8 min-w-[84px] justify-center rounded-full bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:text-white disabled:opacity-100"
              disabled={!canEnd}
              onClick={stopTimer}
              type="button"
              variant="default"
            >
              <Square className="h-3.5 w-3.5" />
              Complete
            </Button>
          </>
        )}
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
        <Timer className="h-3.5 w-3.5 text-[#4f5ef7]" />
        {formatDuration(liveTrackedSeconds)}
      </div>
      <p className="text-[11px] font-medium text-slate-500">
        {actualStart
          ? `Started ${new Date(actualStart).toLocaleTimeString("en-BD", { hour: "numeric", minute: "2-digit" })}`
          : "Not started yet"}
      </p>
    </div>
  );
}
