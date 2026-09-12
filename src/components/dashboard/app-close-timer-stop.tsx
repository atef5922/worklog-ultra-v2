"use client";

import { useEffect } from "react";
import {
  getTaskTimerStorageKey,
  type SharedTaskTimerSnapshot,
} from "@/lib/task-timer-storage";
import {
  bankTaskTimerSegment,
  getNextDhakaMidnightTimestamp,
} from "@/lib/task-timer-math";
import { toDateTimeInputValue } from "@/lib/utils";
import {
  closeRunningAttendanceForShutdown,
  retryPendingAttendanceSyncs,
} from "@/lib/workday-timer-close";

const TIMER_STORAGE_PREFIX = "task-timer:";
const PENDING_SYNC_PREFIX = "task-timer-pending-sync:";

type PendingTimerSync = {
  reportDate: string;
  updates: Array<Record<string, unknown>>;
};

async function retryPendingTimerSyncs() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith(PENDING_SYNC_PREFIX)));

  for (const key of keys) {
    try {
      const payload = JSON.parse(window.localStorage.getItem(key) ?? "") as PendingTimerSync;
      const response = await fetch("/api/dashboard/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) window.localStorage.removeItem(key);
    } catch {
      // Keep the payload for the next authenticated dashboard load.
    }
  }
}

/**
 * Banks every locally running timer before the browser/Electron surface exits.
 * The report API cannot infer a running task because runningStartedAt lives in
 * localStorage, so the beacon must contain real task updates (never an empty
 * placeholder payload).
 */
function stopRunningTimersForClose() {
  const groupedUpdates = new Map<string, Array<Record<string, unknown>>>();
  const closedAt = new Date();

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(TIMER_STORAGE_PREFIX)) continue;

    const [, reportDate, ...taskIdParts] = key.split(":");
    const taskId = taskIdParts.join(":");
    const raw = window.localStorage.getItem(key);
    if (!reportDate || !taskId || !raw) continue;

    try {
      const snapshot = JSON.parse(raw) as SharedTaskTimerSnapshot;
      const runningAt = snapshot.runningStartedAt
        ? new Date(snapshot.runningStartedAt).getTime()
        : Number.NaN;
      if (!Number.isFinite(runningAt)) continue;

      const baseSeconds = Number(
        snapshot.trackedSeconds ??
          String(Number(snapshot.trackedMinutes || 0) * 60),
      );
      const dayEnd = getNextDhakaMidnightTimestamp(reportDate);
      const effectiveStopAt = Number.isFinite(dayEnd)
        ? Math.max(runningAt, Math.min(closedAt.getTime(), dayEnd))
        : closedAt.getTime();
      const trackedSeconds = bankTaskTimerSegment(
        baseSeconds,
        runningAt,
        effectiveStopAt,
      );
      const nextSnapshot: SharedTaskTimerSnapshot = {
        ...snapshot,
        status: "in_progress",
        trackedMinutes: String(Math.floor(trackedSeconds / 60)),
        trackedSeconds: String(trackedSeconds),
        actualStart:
          snapshot.actualStart || toDateTimeInputValue(new Date(runningAt)),
        actualEnd: toDateTimeInputValue(new Date(effectiveStopAt)),
        runningStartedAt: "",
      };

      window.localStorage.setItem(
        getTaskTimerStorageKey(reportDate, taskId),
        JSON.stringify(nextSnapshot),
      );

      const updates = groupedUpdates.get(reportDate) ?? [];
      updates.push({
        dailyTaskId: taskId,
        status: "in_progress",
        completionPercent: 0,
        trackedMinutes: Number(nextSnapshot.trackedMinutes),
        actualStart: nextSnapshot.actualStart,
        actualEnd: nextSnapshot.actualEnd,
      });
      groupedUpdates.set(reportDate, updates);
    } catch {
      // The normal timer reader removes malformed snapshots after next launch.
    }
  }

  for (const [reportDate, updates] of groupedUpdates) {
    const pendingKey = `${PENDING_SYNC_PREFIX}${reportDate}`;
    const existing = (() => {
      try {
        return JSON.parse(window.localStorage.getItem(pendingKey) ?? "") as PendingTimerSync;
      } catch {
        return null;
      }
    })();
    const merged = new Map<string, Record<string, unknown>>();
    for (const update of [...(existing?.updates ?? []), ...updates]) {
      merged.set(String(update.dailyTaskId ?? ""), update);
    }
    const payload: PendingTimerSync = {
      reportDate,
      updates: [...merged.values()],
    };
    window.localStorage.setItem(pendingKey, JSON.stringify(payload));

    navigator.sendBeacon(
      "/api/dashboard/report",
      JSON.stringify(payload),
    );
  }
}

export function AppCloseTimerStop() {
  useEffect(() => {
    void retryPendingTimerSyncs();
    void retryPendingAttendanceSyncs();

    function handleBeforeUnload() {
      stopRunningTimersForClose();
      closeRunningAttendanceForShutdown();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    let unsubscribeElectronQuit: (() => void) | null = null;
    const bridge = window.worklogDesktop;
    if (bridge?.isDesktop && bridge.onAppQuit) {
      unsubscribeElectronQuit = bridge.onAppQuit(() => {
        stopRunningTimersForClose();
        closeRunningAttendanceForShutdown();
      });
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unsubscribeElectronQuit?.();
    };
  }, []);

  return null;
}
