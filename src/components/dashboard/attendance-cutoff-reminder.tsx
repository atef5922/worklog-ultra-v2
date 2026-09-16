"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DashboardAttendanceSnapshot } from "@/lib/contracts/user";
import { ATTENDANCE_UPDATED_EVENT, attendanceSyncKey, confirmAttendanceContinuation, loadAttendance, publishAttendance, saveAttendanceAction } from "@/lib/attendance-client";
import { toDateOnly } from "@/lib/utils";

function cutoffFor(snapshot: DashboardAttendanceSnapshot) {
  return snapshot.cutoffExtendedUntil
    ? new Date(snapshot.cutoffExtendedUntil)
    : new Date(`${snapshot.attendanceDate}T19:30:00+06:00`);
}

function wasDismissed(key: string) {
  try { return window.localStorage.getItem(key) === "dismissed"; }
  catch { return false; }
}

export function AttendanceCutoffReminder({ userId, initialAttendance }: {
  userId: string;
  initialAttendance: DashboardAttendanceSnapshot | null;
}) {
  const [snapshot, setSnapshot] = useState(initialAttendance);
  const [now, setNow] = useState(Date.now);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState("");
  const [mounted, setMounted] = useState(false);
  const sync = useCallback(async () => {
    try {
      const envelope = await loadAttendance(userId);
      setSnapshot(envelope.snapshot);
      setOffset(new Date(envelope.serverNow).getTime() - Date.now());
    } catch {
      // The latest confirmed snapshot stays visible; the next poll retries.
    }
  }, [userId]);

  useEffect(() => {
    const initial = window.setTimeout(() => { setMounted(true); void sync(); }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 10_000);
    const poll = window.setInterval(() => { if (!document.hidden) void sync(); }, 30_000);
    const focus = () => { if (!document.hidden) void sync(); };
    const storage = (event: StorageEvent) => {
      if (event.key === attendanceSyncKey(userId)) void sync();
      if (event.key?.startsWith(`attendance-reminder:${userId}:`)) setDismissed(event.key);
    };
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; envelope: { snapshot: DashboardAttendanceSnapshot | null; serverNow: string } }>).detail;
      if (detail?.userId !== userId) return;
      setSnapshot(detail.envelope.snapshot);
      setOffset(new Date(detail.envelope.serverNow).getTime() - Date.now());
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storage);
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, updated);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.clearTimeout(initial); window.clearInterval(clock); window.clearInterval(poll);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
      window.removeEventListener(ATTENDANCE_UPDATED_EVENT, updated);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [sync, userId]);

  if (!mounted || !snapshot?.active || snapshot.attendanceDate !== toDateOnly(new Date(now + offset))) return null;
  const cutoff = cutoffFor(snapshot);
  const key = `attendance-reminder:${userId}:${cutoff.toISOString()}`;
  const current = now + offset;
  if (current < cutoff.getTime() - 15 * 60_000 || current >= cutoff.getTime() || dismissed === key ||
      wasDismissed(key)) return null;
  const extended = new Date(Math.min(cutoff.getTime() + 60 * 60_000,
    new Date(`${snapshot.attendanceDate}T23:30:00+06:00`).getTime()));
  const canContinue = extended > cutoff;
  const extendedLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(extended);

  async function act(action: "out" | "continue") {
    if (!snapshot || busy) return;
    setBusy(true);
    try {
      const result = action === "out"
        ? await saveAttendanceAction(userId, "check_out", snapshot, new Date(Date.now() + offset))
        : await confirmAttendanceContinuation(userId, snapshot);
      publishAttendance(userId, result, snapshot);
      setSnapshot(result.snapshot);
      setOffset(new Date(result.serverNow).getTime() - Date.now());
      toast.success(result.message ?? "Attendance updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attendance could not be updated.");
      await sync();
    } finally { setBusy(false); }
  }

  function dismiss() {
    try { window.localStorage.setItem(key, "dismissed"); }
    catch { /* A browser may block storage; local state still dismisses this reminder. */ }
    setDismissed(key);
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="attendance-reminder-title"
      className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
      <h2 id="attendance-reminder-title" className="text-lg font-semibold">Still working?</h2>
      <p className="mt-2 text-sm text-slate-600">Your attendance will automatically close at {
        new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true }).format(cutoff)
      } if you do not respond. Check Out when you leave.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={dismiss} disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Not now</button>
        <button type="button" onClick={() => void act("out")} disabled={busy}
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Out now</button>
        {canContinue && <button type="button" onClick={() => void act("continue")} disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          Continue until {extendedLabel}
        </button>}
      </div>
    </div>
  </div>;
}
