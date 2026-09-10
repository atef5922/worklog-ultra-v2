"use client";

export const TASK_AUTO_STOP_NOTE_EVENT = "dashboard:auto-stop-note-needed";
export const TASK_AUTO_STOP_NOTE_STORAGE_PREFIX = "task-auto-stop-note:";

export type TaskAutoStopNotePayload = {
  taskId: string;
  reportDate: string;
  actualStart: string;
  actualEnd: string;
  trackedMinutes: number;
  timestamp: number;
};

export function getTaskAutoStopNoteStorageKey(reportDate: string, taskId: string) {
  return `${TASK_AUTO_STOP_NOTE_STORAGE_PREFIX}${reportDate}:${taskId}`;
}

export function writePendingTaskAutoStopNote(payload: TaskAutoStopNotePayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    getTaskAutoStopNoteStorageKey(payload.reportDate, payload.taskId),
    JSON.stringify(payload),
  );
}

export function removePendingTaskAutoStopNote(reportDate: string, taskId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(getTaskAutoStopNoteStorageKey(reportDate, taskId));
}

export function readPendingTaskAutoStopNotes() {
  if (typeof window === "undefined") {
    return [] as TaskAutoStopNotePayload[];
  }

  const pending: TaskAutoStopNotePayload[] = [];

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);

    if (!key || !key.startsWith(TASK_AUTO_STOP_NOTE_STORAGE_PREFIX)) {
      continue;
    }

    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<TaskAutoStopNotePayload>;
      if (!parsed.taskId || !parsed.reportDate) {
        continue;
      }

      pending.push({
        taskId: parsed.taskId,
        reportDate: parsed.reportDate,
        actualStart: typeof parsed.actualStart === "string" ? parsed.actualStart : "",
        actualEnd: typeof parsed.actualEnd === "string" ? parsed.actualEnd : "",
        trackedMinutes: Math.max(0, Number(parsed.trackedMinutes ?? 0)),
        timestamp: Number(parsed.timestamp ?? 0) || Date.now(),
      });
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  return pending.sort((left, right) => left.timestamp - right.timestamp);
}
