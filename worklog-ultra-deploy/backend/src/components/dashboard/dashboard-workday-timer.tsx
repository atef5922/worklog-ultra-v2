"use client";

import { PauseCircle, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { toDateOnly, toDhakaOffsetIso } from "@/lib/utils";

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

function getStorageKey(dayKey: string) {
  return `workday-timer:${dayKey}`;
}

function readStoredTimer(dayKey: string): StoredWorkdayTimer | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(dayKey));
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

function writeStoredTimer(dayKey: string, value: StoredWorkdayTimer) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getStorageKey(dayKey), JSON.stringify(value));
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

function parseJsonSafely(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function DashboardWorkdayTimer({
  initialAttendance,
  mode = "full",
}: {
  initialAttendance: WorkdayTimerSnapshot | null;
  mode?: "full" | "summary" | "button";
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [dayKey, setDayKey] = useState(() => toDateOnly());
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [attendance, setAttendance] = useState(() => buildAttendanceState(initialAttendance, toDateOnly()));

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
    const stored = readStoredTimer(dayKey);
    const initialAttendanceDayMatches =
      initialAttendance?.checkInAt && toDateOnly(new Date(initialAttendance.checkInAt)) === dayKey;

    if (initialAttendanceDayMatches && initialAttendance?.checkInAt && !initialAttendance?.checkOutAt) {
      setAccumulatedSeconds(stored?.accumulatedSeconds ?? 0);
      setAttendance((current) => ({
        ...current,
        checkInAt: stored?.lastCheckOutAt ? initialAttendance.checkInAt : (stored?.lastCheckInAt ?? initialAttendance.checkInAt),
        checkOutAt: null,
      }));
      return;
    }

    if (stored) {
      setAccumulatedSeconds(stored.accumulatedSeconds);
      setAttendance((current) => ({
        ...current,
        checkInAt: stored.lastCheckOutAt ? null : stored.lastCheckInAt,
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
      writeStoredTimer(dayKey, {
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
      writeStoredTimer(dayKey, {
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
  }, [dayKey, initialAttendance?.checkInAt, initialAttendance?.checkOutAt]);

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

  const totalSeconds = accumulatedSeconds + liveSessionSeconds;
  const elapsedLabel = useMemo(() => {
    return formatElapsed(totalSeconds);
  }, [totalSeconds]);
  const elapsedReadableLabel = useMemo(() => {
    return formatElapsedReadable(totalSeconds);
  }, [totalSeconds]);

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
      return;
    }

    setAttendance(next);
    toast.success(result?.message ?? successMessage);
    router.refresh();
  }

  async function startTimer() {
    if (saving) return;
    const startTime = new Date();
    const nowLabel = toDhakaOffsetIso(startTime);
    await persist(
      {
        ...attendance,
        status: attendance.status || "present",
        checkInAt: nowLabel,
        checkOutAt: null,
      },
      "Work timer started.",
    );
    writeStoredTimer(dayKey, {
      accumulatedSeconds,
      lastCheckInAt: nowLabel,
      lastCheckOutAt: null,
    });
  }

  async function stopTimer() {
    if (saving || !attendance.checkInAt) return;
    const stopTime = new Date();
    const nowLabel = toDhakaOffsetIso(stopTime);
    const sessionSeconds = Math.max(0, Math.floor((stopTime.getTime() - new Date(attendance.checkInAt).getTime()) / 1000));
    const nextAccumulatedSeconds = accumulatedSeconds + sessionSeconds;
    await persist(
      {
        ...attendance,
        checkOutAt: nowLabel,
      },
      "Work timer stopped.",
    );
    setAccumulatedSeconds(nextAccumulatedSeconds);
    writeStoredTimer(dayKey, {
      accumulatedSeconds: nextAccumulatedSeconds,
      lastCheckInAt: attendance.checkInAt,
      lastCheckOutAt: nowLabel,
    });
  }

  if (mode === "summary") {
    return null;
  }

  if (mode === "button") {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <div className="min-w-[118px] rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-center">
          <p className="font-mono text-sm font-extrabold tracking-[0.08em] text-[var(--foreground)] md:text-base">
            {elapsedReadableLabel}
          </p>
        </div>
        <button
          className={`button-force-white inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
            isRunning ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
          } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
          disabled={saving}
          onClick={isRunning ? stopTimer : startTimer}
          type="button"
        >
          {isRunning ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {saving ? "Saving..." : isRunning ? "Pause Work" : "Start Work"}
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
          {isRunning ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {saving ? "Saving..." : isRunning ? "Pause Work" : "Start Work"}
        </button>
      ) : null}
    </div>
  );
}
