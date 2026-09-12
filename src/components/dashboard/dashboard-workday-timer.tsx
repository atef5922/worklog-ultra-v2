"use client";

import { Coffee, LogIn, LogOut, PlayCircle, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { DashboardAttendanceSnapshot } from "@/lib/contracts/user";
import { ATTENDANCE_STARTED_EVENT, ATTENDANCE_STOPPED_EVENT } from "@/lib/dashboard-live-events";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import { toDateOnly, toDhakaOffsetIso } from "@/lib/utils";

export type WorkdayTimerSnapshot = DashboardAttendanceSnapshot;

type AttendanceAction = "check_in" | "check_out" | "break_start" | "break_end";

type StoredWorkdayTimer = {
  accumulatedSeconds: number;
  accumulatedBreakSeconds: number;
  activeBreakStartedAt: string | null;
  status: DashboardAttendanceSnapshot["status"];
  note: string;
  breakMinutes: number;
  lastCheckInAt: string | null;
  lastCheckOutAt: string | null;
};

function getStorageKey(dayKey: string, currentUserId: string) {
  return `workday-timer:${currentUserId}:${dayKey}`;
}

export function clearStoredWorkdayTimer(dayKey: string, currentUserId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getStorageKey(dayKey, currentUserId));
  } catch {
    // Storage is only a shutdown safety copy; the server remains authoritative.
  }
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatElapsedReadable(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}m counted`;
}

function formatBreakTime(startedAt: string | null, now: number) {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function makeEventId(action: AttendanceAction) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${action}-${random}`;
}

function writeShutdownSnapshot(
  snapshot: DashboardAttendanceSnapshot | null,
  dayKey: string,
  currentUserId: string,
) {
  if (typeof window === "undefined") return;
  if (!snapshot) {
    clearStoredWorkdayTimer(dayKey, currentUserId);
    return;
  }

  const metrics = calculateSegmentedAttendanceMetrics({
    attendanceDate: dayKey,
    workSessions: snapshot.workSessions,
    breakSessions: snapshot.breakSessions,
    legacyBreakMinutes: snapshot.legacyBreakMinutes,
  });
  const value: StoredWorkdayTimer = {
    accumulatedSeconds: metrics.sessionMinutes * 60,
    accumulatedBreakSeconds: metrics.breakMinutes * 60,
    activeBreakStartedAt: snapshot.currentBreakStartedAt,
    status: snapshot.status,
    note: snapshot.note,
    breakMinutes: metrics.breakMinutes,
    lastCheckInAt: snapshot.active ? snapshot.currentSessionStartedAt : snapshot.checkInAt,
    lastCheckOutAt: snapshot.active ? null : snapshot.checkOutAt,
  };

  try {
    window.localStorage.setItem(getStorageKey(dayKey, currentUserId), JSON.stringify(value));
  } catch {
    // The database state is already safe even when localStorage is unavailable.
  }
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
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [attendance, setAttendance] = useState(initialAttendance);
  const dayKey = attendance?.attendanceDate ?? toDateOnly();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setAttendance(initialAttendance);
  }, [initialAttendance]);

  useEffect(() => {
    writeShutdownSnapshot(attendance, dayKey, currentUserId);
  }, [attendance, currentUserId, dayKey]);

  const metrics = useMemo(
    () => calculateSegmentedAttendanceMetrics({
      attendanceDate: dayKey,
      workSessions: attendance?.workSessions ?? [],
      breakSessions: attendance?.breakSessions ?? [],
      legacyBreakMinutes: attendance?.legacyBreakMinutes ?? 0,
      now: new Date(now),
    }),
    [attendance, dayKey, now],
  );
  const isRunning = Boolean(attendance?.active);
  const isBreakRunning = Boolean(attendance?.onBreak);
  const hasCheckedInToday = Boolean(attendance?.checkInAt);
  const showSummary = mode === "full" || mode === "summary";
  const showButton = mode === "full" || mode === "button";

  async function persistAction(action: AttendanceAction, endReason?: "manual" | "device_shutdown") {
    if (saving) return null;
    setSaving(true);
    try {
      const response = await fetch("/api/dashboard/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          attendanceDate: dayKey,
          occurredAt: toDhakaOffsetIso(new Date()),
          eventId: makeEventId(action),
          status: attendance?.status ?? "present",
          note: attendance?.note ?? "",
          endReason,
        }),
      });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : null;
      if (!response.ok || !result?.snapshot) {
        toast.error(result?.message ?? "Attendance update failed.");
        return null;
      }
      const snapshot = result.snapshot as DashboardAttendanceSnapshot;
      setAttendance(snapshot);
      toast.success(result.message);
      router.refresh();
      return snapshot;
    } catch {
      toast.error("Attendance could not reach the server. Your current state was not changed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function checkIn() {
    const snapshot = await persistAction("check_in");
    if (!snapshot) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-start", {
      detail: { source: "attendance", label: "Attendance" },
    }));
    window.dispatchEvent(new CustomEvent(ATTENDANCE_STARTED_EVENT));
  }

  async function checkOut() {
    const snapshot = await persistAction("check_out", "manual");
    if (!snapshot) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-stop", {
      detail: { source: "attendance" },
    }));
    window.dispatchEvent(new CustomEvent(ATTENDANCE_STOPPED_EVENT));
  }

  async function startBreak() {
    const snapshot = await persistAction("break_start");
    if (!snapshot) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-pause"));
  }

  async function endBreak() {
    const snapshot = await persistAction("break_end");
    if (!snapshot) return;
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-resume"));
  }

  if (mode === "summary") return null;

  const primaryButton = (
    <button
      className={`button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[0.8rem] font-semibold transition sm:px-3.5 ${
        isRunning ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
      } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
      disabled={saving}
      onClick={isRunning ? checkOut : checkIn}
      type="button"
    >
      {isRunning ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
      {saving ? "Saving..." : isRunning ? "Out" : hasCheckedInToday ? "In Again" : "In"}
    </button>
  );

  if (mode === "button") {
    return (
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {isRunning ? (
          isBreakRunning ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-sm font-bold text-amber-600">
                Break: {formatBreakTime(attendance?.currentBreakStartedAt ?? null, now)}
              </div>
              <button
                className="button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-[0.8rem] font-semibold transition hover:bg-amber-600"
                disabled={saving}
                onClick={endBreak}
                type="button"
              >
                <PlayCircle className="h-4 w-4" />
                <span className="hidden sm:inline">End Break</span>
                <span className="sm:hidden">Resume</span>
              </button>
            </>
          ) : (
            <button
              className="button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-[0.8rem] font-semibold transition hover:bg-amber-600"
              disabled={saving}
              onClick={startBreak}
              type="button"
            >
              <Coffee className="h-4 w-4" />
              <span className="hidden sm:inline">Take Break</span>
              <span className="sm:hidden">Break</span>
            </button>
          )
        ) : null}
        {primaryButton}
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-3 md:flex">
      {showSummary ? (
        <div className="min-w-[150px] text-right">
          <p className="topbar-text-strong font-mono text-lg font-extrabold tracking-[0.18em]">
            {formatElapsed(metrics.workingMinutes * 60)}
          </p>
          <p className="topbar-text-muted text-[11px] font-medium uppercase tracking-[0.16em]">
            {formatElapsedReadable(metrics.workingMinutes)}
          </p>
        </div>
      ) : null}
      {showButton ? primaryButton : null}
      {isRunning && !isBreakRunning ? (
        <button
          className="button-force-white inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold hover:bg-amber-600"
          disabled={saving}
          onClick={startBreak}
          type="button"
        >
          <Coffee className="h-4 w-4" /> Take Break
        </button>
      ) : null}
      {isBreakRunning ? (
        <button
          className="button-force-white inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold hover:bg-amber-600"
          disabled={saving}
          onClick={endBreak}
          type="button"
        >
          <Square className="h-4 w-4" /> End Break
        </button>
      ) : null}
    </div>
  );
}