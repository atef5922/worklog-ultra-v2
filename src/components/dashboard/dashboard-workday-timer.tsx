"use client";

import { PlayCircle, Square, Coffee, Pause } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ATTENDANCE_STARTED_EVENT, ATTENDANCE_STOPPED_EVENT } from "@/lib/dashboard-live-events";
import { getDhakaCutoffIso, parseDhakaDateTime, toDateOnly, toDhakaOffsetIso } from "@/lib/utils";

type AttendanceStatusValue = "present" | "late" | "half_day" | "absent" | "remote";

export type WorkdayTimerSnapshot = {
  status: AttendanceStatusValue;
  note: string;
  breakMinutes: number;
  checkInAt: string | null;
  checkOutAt: string | null;
};

type StoredWorkdayTimer = {
  accumulatedSeconds: number;
  lastCheckInAt: string | null;
  lastCheckOutAt: string | null;
};

function buildAttendanceState(initialAttendance: WorkdayTimerSnapshot | null, dayKey: string) {
  const matchesDay =
    initialAttendance?.checkInAt && toDateOnly(new Date(initialAttendance.checkInAt)) === dayKey;

  return {
    status: initialAttendance?.status ?? "present",
    note: initialAttendance?.note ?? "",
    breakMinutes: initialAttendance?.breakMinutes ?? 0,
    checkInAt: matchesDay ? initialAttendance?.checkInAt ?? null : null,
    checkOutAt: matchesDay ? initialAttendance?.checkOutAt ?? null : null,
  };
}

function getStorageKey(dayKey: string, currentUserId: string) {
  return `workday-timer:${currentUserId}:${dayKey}`;
}

export function clearStoredWorkdayTimer(dayKey: string, currentUserId: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getStorageKey(dayKey, currentUserId));
  } catch {
    // ignore storage errors
  }
}

function readStoredTimer(dayKey: string, currentUserId: string): StoredWorkdayTimer | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(dayKey, currentUserId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredWorkdayTimer>;
    return {
      accumulatedSeconds:
        typeof parsed.accumulatedSeconds === "number" && Number.isFinite(parsed.accumulatedSeconds)
          ? Math.max(0, parsed.accumulatedSeconds)
          : 0,
      lastCheckInAt: typeof parsed.lastCheckInAt === "string" ? parsed.lastCheckInAt : null,
      lastCheckOutAt: typeof parsed.lastCheckOutAt === "string" ? parsed.lastCheckOutAt : null,
    };
  } catch {
    return null;
  }
}

function writeStoredTimer(dayKey: string, currentUserId: string, value: StoredWorkdayTimer) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getStorageKey(dayKey, currentUserId), JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatElapsedReadable(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatBreakTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseJsonSafely(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getValidActiveCheckInAt(checkInAt: string | null, dayKey: string, nowMs: number) {
  if (!checkInAt) {
    return null;
  }

  const parsed = parseDhakaDateTime(checkInAt);

  if (!parsed) {
    return null;
  }

  if (toDateOnly(parsed) !== dayKey) {
    return null;
  }

  if (parsed.getTime() > nowMs) {
    return null;
  }

  return checkInAt;
}

export function DashboardWorkdayTimer({
  initialAttendance,
  currentUserId,
  mode = "full",
}: {
  initialAttendance: WorkdayTimerSnapshot | null;
  currentUserId: string;
  mode?: "full" | "summary" | "button";
}) {
  const router = useRouter();
  const autoClosingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [dayKey, setDayKey] = useState(() => toDateOnly());
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [attendance, setAttendance] = useState(() => buildAttendanceState(initialAttendance, toDateOnly()));
  const [isBreakRunning, setIsBreakRunning] = useState(false);
  const [breakStartTime, setBreakStartTime] = useState<number | null>(null);

  function resetLocalTimerState() {
    setAccumulatedSeconds(0);
    setAttendance((current) => ({
      ...current,
      checkInAt: null,
      checkOutAt: null,
    }));
    clearStoredWorkdayTimer(dayKey, currentUserId);
  }

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
      const nextDayKey = toDateOnly();
      setDayKey((current) => (current === nextDayKey ? current : nextDayKey));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = readStoredTimer(dayKey, currentUserId);
    const initialAttendanceDayMatches =
      initialAttendance?.checkInAt && toDateOnly(new Date(initialAttendance.checkInAt)) === dayKey;

    if (initialAttendanceDayMatches && initialAttendance?.checkInAt && !initialAttendance?.checkOutAt) {
      const safeCheckInAt = getValidActiveCheckInAt(
        initialAttendance.checkInAt,
        dayKey,
        Date.now(),
      );

      if (!safeCheckInAt) {
        clearStoredWorkdayTimer(dayKey, currentUserId);
        setAccumulatedSeconds(0);
        setAttendance((current) => ({
          ...current,
          checkInAt: null,
          checkOutAt: null,
        }));
        return;
      }

      setAccumulatedSeconds(stored?.accumulatedSeconds ?? 0);
      setAttendance((current) => ({
        ...current,
        checkInAt: stored?.lastCheckOutAt ? safeCheckInAt : (stored?.lastCheckInAt ?? safeCheckInAt),
        checkOutAt: null,
      }));
      return;
    }

    if (stored) {
      const safeStoredCheckInAt = stored.lastCheckOutAt
        ? null
        : getValidActiveCheckInAt(stored.lastCheckInAt, dayKey, Date.now());

      if (!stored.lastCheckOutAt && stored.lastCheckInAt && !safeStoredCheckInAt) {
        clearStoredWorkdayTimer(dayKey, currentUserId);
        setAccumulatedSeconds(0);
        setAttendance((current) => ({
          ...current,
          checkInAt: null,
          checkOutAt: null,
        }));
        return;
      }

      setAccumulatedSeconds(stored.accumulatedSeconds);
      setAttendance((current) => ({
        ...current,
        checkInAt: safeStoredCheckInAt,
        checkOutAt: stored.lastCheckOutAt,
      }));
      return;
    }

    if (initialAttendanceDayMatches && initialAttendance?.checkInAt && initialAttendance?.checkOutAt) {
      const start = new Date(initialAttendance.checkInAt).getTime();
      const end = new Date(initialAttendance.checkOutAt).getTime();
      const initialSeconds = Math.max(0, Math.floor((end - start) / 1000));
      setAccumulatedSeconds(initialSeconds);
      setAttendance((current) => ({
        ...current,
        checkInAt: null,
        checkOutAt: initialAttendance.checkOutAt,
      }));
      writeStoredTimer(dayKey, currentUserId, {
        accumulatedSeconds: initialSeconds,
        lastCheckInAt: initialAttendance.checkInAt,
        lastCheckOutAt: initialAttendance.checkOutAt,
      });
      return;
    }

    if (initialAttendanceDayMatches && initialAttendance?.checkInAt && !initialAttendance?.checkOutAt) {
      setAccumulatedSeconds(0);
      setAttendance((current) => ({
        ...current,
        checkInAt: initialAttendance.checkInAt,
        checkOutAt: null,
      }));
      writeStoredTimer(dayKey, currentUserId, {
        accumulatedSeconds: 0,
        lastCheckInAt: initialAttendance.checkInAt,
        lastCheckOutAt: null,
      });
      return;
    }

    setAccumulatedSeconds(0);
    setAttendance((current) => ({
      ...current,
      checkInAt: null,
      checkOutAt: null,
    }));
  }, [currentUserId, dayKey, initialAttendance?.checkInAt, initialAttendance?.checkOutAt]);

  const isRunning = Boolean(attendance.checkInAt) && !attendance.checkOutAt;
  const showSummary = mode === "full" || mode === "summary";
  const showButton = mode === "full" || mode === "button";

  const liveSessionSeconds = useMemo(() => {
    if (!attendance.checkInAt || attendance.checkOutAt || now === null) {
      return 0;
    }

    const start = new Date(attendance.checkInAt).getTime();
    return Math.max(0, Math.floor((now - start) / 1000));
  }, [attendance.checkInAt, attendance.checkOutAt, now]);

  const currentBreakSeconds = useMemo(() => {
    if (!isBreakRunning || breakStartTime === null || now === null) {
      return 0;
    }
    return Math.max(0, Math.floor((now - breakStartTime) / 1000));
  }, [isBreakRunning, breakStartTime, now]);

  const totalSeconds = accumulatedSeconds + liveSessionSeconds;
  const elapsedLabel = useMemo(() => {
    return formatElapsed(totalSeconds);
  }, [totalSeconds]);
  const elapsedReadableLabel = useMemo(() => {
    return formatElapsedReadable(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    autoClosingRef.current = false;
  }, [dayKey]);

  // Clock-based attendance auto-close removed: attendance now stops only on manual stopTimer()
  // or app close. The 7:30 PM cutoff is handled as crash-recovery fallback in the
  // server-side attendance API (getDhakaCutoffIso clamping), not a live client-side clock.

  async function persist(next: typeof attendance, successMessage: string) {
    setSaving(true);
    const response = await fetch("/api/dashboard/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceDate: dayKey,
        status: next.status,
        note: next.note,
        checkInAt: next.checkInAt ?? "",
        checkOutAt: next.checkOutAt ?? "",
        breakMinutes: next.breakMinutes,
      }),
    });

    const raw = await response.text();
    const result = parseJsonSafely(raw);
    setSaving(false);

    if (!response.ok) {
      toast.error(result?.message ?? "Work timer update failed.");
      return false;
    }

    setAttendance(next);
    toast.success(result?.message ?? successMessage);
    router.refresh();
    return true;
  }

  async function startTimer() {
    if (saving) return;
    const startTime = new Date();
    const nowLabel = toDhakaOffsetIso(startTime);
    const succeeded = await persist(
      {
        ...attendance,
        status: attendance.status || "present",
        checkInAt: nowLabel,
        checkOutAt: null,
      },
      "Work timer started.",
    );

    // Screenshot monitoring must never start on the optimistic click alone —
    // only once the backend has actually confirmed attendance is open, so a
    // failed check-in (network error, validation) can never leave the agent
    // capturing against a work session that does not exist server-side.
    if (!succeeded) return;

    window.dispatchEvent(new CustomEvent("worklog:task-monitor-start", { detail: { source: "attendance", label: "Attendance" } }));
    window.dispatchEvent(new CustomEvent(ATTENDANCE_STARTED_EVENT));
    writeStoredTimer(dayKey, currentUserId, {
      accumulatedSeconds,
      lastCheckInAt: nowLabel,
      lastCheckOutAt: null,
    });
  }

  function startBreak() {
    if (!isRunning) return;
    setIsBreakRunning(true);
    setBreakStartTime(now ?? Date.now());
    // Pause immediately and client-side only: breaks have no backend
    // confirmation step in this app, and failing to pause is the unsafe
    // direction here (a capture during an approved break), so this does not
    // wait for stopBreak()'s eventual persist() call.
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-pause"));
    toast.info("Break started - time is counting.");
  }

  async function stopBreak() {
    if (!isBreakRunning || breakStartTime === null || now === null) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-resume"));

    const breakDurationSeconds = Math.max(0, Math.floor((now - breakStartTime) / 1000));
    const breakDurationMinutes = Math.ceil(breakDurationSeconds / 60);
    const currentBreak = attendance.breakMinutes ?? 0;
    const nextBreakMinutes = currentBreak + breakDurationMinutes;

    const standardBreak = 45;
    const isOverBreak = nextBreakMinutes > standardBreak;
    const overAmount = isOverBreak ? nextBreakMinutes - standardBreak : 0;
    const message = isOverBreak
      ? `Break recorded (${breakDurationMinutes}m, total ${nextBreakMinutes}m - ${overAmount}m over standard).`
      : `Break recorded (${breakDurationMinutes}m, total ${nextBreakMinutes}m).`;

    setIsBreakRunning(false);
    setBreakStartTime(null);

    await persist(
      {
        ...attendance,
        breakMinutes: nextBreakMinutes,
      },
      message,
    );
  }

  async function stopTimer() {
    if (saving || !attendance.checkInAt) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-stop", { detail: { source: "attendance" } }));
    // Fired here rather than after persist so it also covers the early return
    // below, where the stale check-in is discarded without a round trip.
    window.dispatchEvent(new CustomEvent(ATTENDANCE_STOPPED_EVENT));
    const safeCheckInAt = getValidActiveCheckInAt(attendance.checkInAt, dayKey, Date.now());

    if (!safeCheckInAt) {
      resetLocalTimerState();
      router.refresh();
      return;
    }

    const stopTime = new Date();
    const nowLabel = toDhakaOffsetIso(stopTime);
    const sessionSeconds = Math.max(0, Math.floor((stopTime.getTime() - new Date(safeCheckInAt).getTime()) / 1000));
    const nextAccumulatedSeconds = accumulatedSeconds + sessionSeconds;

    // Reset break time for the new day
    setIsBreakRunning(false);
    setBreakStartTime(null);

    await persist(
      {
        ...attendance,
        checkOutAt: nowLabel,
        breakMinutes: 0, // Reset break for next day
      },
      "Work timer stopped. Data saved and reset for tomorrow.",
    );
    setAccumulatedSeconds(nextAccumulatedSeconds);
    writeStoredTimer(dayKey, currentUserId, {
      accumulatedSeconds: nextAccumulatedSeconds,
      lastCheckInAt: safeCheckInAt,
      lastCheckOutAt: nowLabel,
    });
  }

  if (mode === "summary") {
    return null;
  }

  if (mode === "button") {
    return (
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {isRunning && (
          <>
            {isBreakRunning ? (
              <>
                <div className="font-mono text-sm font-bold text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                  Break: {formatBreakTime(currentBreakSeconds)}
                </div>
                <button
                  className="button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[0.8rem] font-semibold transition bg-rose-500 hover:bg-rose-600"
                  disabled={saving}
                  onClick={stopBreak}
                  type="button"
                >
                  <Square className="h-4 w-4" />
                  <span className="hidden sm:inline">Stop Break</span>
                  <span className="sm:hidden">Stop</span>
                </button>
              </>
            ) : (
              <button
                className="button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[0.8rem] font-semibold transition bg-amber-500 hover:bg-amber-600"
                disabled={saving}
                onClick={startBreak}
                type="button"
              >
                <Coffee className="h-4 w-4" />
                <span className="hidden sm:inline">Take Break</span>
                <span className="sm:hidden">Break</span>
              </button>
            )}
          </>
        )}
        <button
          className={`button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[0.8rem] font-semibold transition sm:px-3.5 ${
            isRunning ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
          } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
          disabled={saving}
          onClick={isRunning ? stopTimer : startTimer}
          type="button"
        >
          {isRunning ? <Square className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {saving ? "Saving..." : isRunning ? "Stop" : "Start"}
        </button>
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-3 md:flex">
      {showSummary ? (
        <div className="min-w-[150px] text-right">
          <p className="topbar-text-strong font-mono text-lg font-extrabold tracking-[0.18em]">{elapsedLabel}</p>
          <p className="topbar-text-muted text-[11px] font-medium uppercase tracking-[0.16em]">{elapsedReadableLabel}</p>
        </div>
      ) : null}
      {showButton ? (
        <button
          className={`button-force-white inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
            isRunning ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
          } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
          disabled={saving}
          onClick={isRunning ? stopTimer : startTimer}
          type="button"
        >
          {isRunning ? <Square className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {saving ? "Saving..." : isRunning ? "Stop" : "Start"}
        </button>
      ) : null}
    </div>
  );
}
