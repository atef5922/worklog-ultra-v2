"use client";

import { Coffee, LogIn, LogOut, PlayCircle, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DashboardAttendanceSnapshot } from "@/lib/contracts/user";
import { ATTENDANCE_UPDATED_EVENT, attendanceSyncKey, loadAttendance, saveAttendanceAction, publishAttendance, type AttendanceEnvelope } from "@/lib/attendance-client";
import type { AttendanceAction } from "@/lib/attendance-action-validation";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import { toDateOnly } from "@/lib/utils";

export type WorkdayTimerSnapshot = DashboardAttendanceSnapshot;

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
  const savingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [attendance, setAttendance] = useState(initialAttendance);
  const attendanceRef = useRef(initialAttendance);
  const requestEpoch = useRef(0);
  const dayKey = attendance?.attendanceDate ?? toDateOnly(new Date(now + clockOffset));

  const accept = useCallback((envelope: AttendanceEnvelope, announce: boolean) => {
    const previous = attendanceRef.current;
    attendanceRef.current = envelope.snapshot;
    setAttendance(envelope.snapshot);
    const receivedAt = Date.now();
    setNow(receivedAt);
    setClockOffset(new Date(envelope.serverNow).getTime() - receivedAt);
    setReady(true);
    if (announce) {
      publishAttendance(currentUserId, envelope, previous);
      if (previous?.revision !== envelope.snapshot?.revision) router.refresh();
    }
  }, [currentUserId, router]);

  const synchronize = useCallback(async (force = false) => {
    if (savingRef.current && !force) return;
    const epoch = ++requestEpoch.current;
    setSyncing(true);
    try {
      const envelope = await loadAttendance(currentUserId);
      if (epoch === requestEpoch.current) accept(envelope, true);
    } catch {
      // Keep the last confirmed state. An initial failure exposes Retry connection.
    } finally { if (epoch === requestEpoch.current) setSyncing(false); }
  }, [accept, currentUserId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const initialSync = window.setTimeout(() => void synchronize(), 0);
    const epochRef = requestEpoch;
    const interval = window.setInterval(() => { if (!document.hidden) void synchronize(); }, 30_000);
    const refresh = () => { if (!document.hidden) void synchronize(); };
    const storage = (event: StorageEvent) => { if (event.key === attendanceSyncKey(currentUserId)) void synchronize(); };
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; envelope: AttendanceEnvelope }>).detail;
      if (detail?.userId !== currentUserId || savingRef.current) return;
      requestEpoch.current++;
      accept(detail.envelope, false);
      setSyncing(false);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, updated);
    return () => {
      epochRef.current++;
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(ATTENDANCE_UPDATED_EVENT, updated);
    };
  }, [accept, currentUserId, synchronize]);

  useEffect(() => {
    writeShutdownSnapshot(attendance, dayKey, currentUserId);
  }, [attendance, currentUserId, dayKey]);

  const metrics = useMemo(() => calculateSegmentedAttendanceMetrics({
    attendanceDate: dayKey, workSessions: attendance?.workSessions ?? [],
    breakSessions: attendance?.breakSessions ?? [], legacyBreakMinutes: attendance?.legacyBreakMinutes ?? 0,
    now: new Date(now + clockOffset),
  }), [attendance, clockOffset, dayKey, now]);
  const isRunning = Boolean(attendance?.active);
  const isBreakRunning = Boolean(attendance?.onBreak);
  const hasCheckedInToday = Boolean(attendance?.checkInAt && attendance.attendanceDate === toDateOnly(new Date(now + clockOffset)));
  const showSummary = mode === "full" || mode === "summary";
  const showButton = mode === "full" || mode === "button";

  async function persistAction(action: AttendanceAction) {
    if (!ready || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const epoch = ++requestEpoch.current;
    try {
      const envelope = await saveAttendanceAction(currentUserId, action, attendanceRef.current, new Date(Date.now() + clockOffset));
      if (epoch === requestEpoch.current) {
        accept(envelope, true);
        toast.success(envelope.message ?? "Attendance updated.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attendance update failed. Please retry.");
      // A lost response can follow a committed write. Read its actual state; never blindly replay an Out/Break.
      await synchronize(true);
    } finally { savingRef.current = false; setSaving(false); }
  }

  const checkIn = () => persistAction("check_in");
  const checkOut = () => persistAction("check_out");
  const startBreak = () => persistAction("break_start");
  const endBreak = () => persistAction("break_end");

  if (mode === "summary") return null;

  const primaryButton = (
    <button
      className={`button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[0.8rem] font-semibold transition sm:px-3.5 ${
        isRunning ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
      } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
      disabled={saving || (!ready && syncing)}
      onClick={!ready ? () => void synchronize() : isRunning ? checkOut : checkIn}
      type="button"
    >
      {isRunning ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
      {saving ? "Saving..." : !ready ? syncing ? "Syncing..." : "Retry connection" : isRunning ? "Out" : hasCheckedInToday ? "In Again" : "In"}
    </button>
  );

  if (mode === "button") {
    return (
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {isRunning ? (
          isBreakRunning ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-sm font-bold text-amber-600">
                Break: {formatBreakTime(attendance?.currentBreakStartedAt ?? null, now + clockOffset)}
              </div>
              <button
                className="button-force-white inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-[0.8rem] font-semibold transition hover:bg-amber-600"
                disabled={saving || !ready}
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
              disabled={saving || !ready}
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
            {formatElapsed(metrics.workingSeconds)}
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
          disabled={saving || !ready}
          onClick={startBreak}
          type="button"
        >
          <Coffee className="h-4 w-4" /> Take Break
        </button>
      ) : null}
      {isBreakRunning ? (
        <button
          className="button-force-white inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold hover:bg-amber-600"
          disabled={saving || !ready}
          onClick={endBreak}
          type="button"
        >
          <Square className="h-4 w-4" /> End Break
        </button>
      ) : null}
    </div>
  );
}
