"use client";

import { getNextDhakaMidnightTimestamp } from "@/lib/task-timer-math";
import { parseDhakaDateTime } from "@/lib/utils";

export type SharedTaskTimerSnapshot = {
  status: "done" | "in_progress" | "pending";
  trackedMinutes: string;
  trackedSeconds?: string;
  actualStart: string;
  actualEnd: string;
  runningStartedAt: string;
};

export const TASK_TIMER_ROLLED_OVER_EVENT = "worklog:task-timer-rolled-over";

export type TaskTimerRolledOverPayload = {
  taskId: string;
  reportDate: string;
  snapshot: SharedTaskTimerSnapshot;
};

export function getTaskTimerStorageKey(reportDate: string, taskId: string) {
  return `task-timer:${reportDate}:${taskId}`;
}

export function readTaskTimerSnapshot(reportDate: string, taskId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getTaskTimerStorageKey(reportDate, taskId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SharedTaskTimerSnapshot>;
    const status =
      parsed.status === "done" || parsed.status === "in_progress" || parsed.status === "pending"
        ? parsed.status
        : "pending";
    const rawActualStart = typeof parsed.actualStart === "string" ? parsed.actualStart : "";
    const rawActualEnd = typeof parsed.actualEnd === "string" ? parsed.actualEnd : "";
    const rawRunningStartedAt =
      typeof parsed.runningStartedAt === "string" ? parsed.runningStartedAt : "";
    const dayStart = new Date(`${reportDate}T00:00:00+06:00`).getTime();
    const dayEnd = getNextDhakaMidnightTimestamp(reportDate);
    const now = Date.now();
    const startTime = parseDhakaDateTime(rawActualStart)?.getTime() ?? Number.NaN;
    const endTime = parseDhakaDateTime(rawActualEnd)?.getTime() ?? Number.NaN;
    const runningTime = new Date(rawRunningStartedAt).getTime();
    const actualStart =
      Number.isFinite(startTime) && startTime >= dayStart && startTime < dayEnd && startTime <= now
        ? rawActualStart
        : "";
    const actualEnd =
      actualStart && Number.isFinite(endTime) && endTime >= startTime && endTime <= dayEnd && endTime <= now
        ? rawActualEnd
        : "";
    const runningStartedAt =
      actualStart && Number.isFinite(runningTime) && runningTime >= startTime && runningTime < dayEnd && runningTime <= now
        ? rawRunningStartedAt
        : "";

    return {
      status,
      trackedMinutes: typeof parsed.trackedMinutes === "string" ? parsed.trackedMinutes : "0",
      trackedSeconds: typeof parsed.trackedSeconds === "string" ? parsed.trackedSeconds : undefined,
      actualStart,
      actualEnd,
      runningStartedAt,
    } satisfies SharedTaskTimerSnapshot;
  } catch {
    window.localStorage.removeItem(getTaskTimerStorageKey(reportDate, taskId));
    return null;
  }
}

export function writeTaskTimerSnapshot(reportDate: string, taskId: string, snapshot: SharedTaskTimerSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getTaskTimerStorageKey(reportDate, taskId), JSON.stringify(snapshot));
}
