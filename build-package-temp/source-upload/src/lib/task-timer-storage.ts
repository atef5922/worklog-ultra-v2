"use client";

export type SharedTaskTimerSnapshot = {
  status: "done" | "in_progress" | "pending";
  trackedMinutes: string;
  trackedSeconds?: string;
  actualStart: string;
  actualEnd: string;
  runningStartedAt: string;
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
    const actualStart = typeof parsed.actualStart === "string" ? parsed.actualStart : "";
    const actualEnd = typeof parsed.actualEnd === "string" ? parsed.actualEnd : "";
    const runningStartedAt =
      typeof parsed.runningStartedAt === "string" ? parsed.runningStartedAt : "";

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
