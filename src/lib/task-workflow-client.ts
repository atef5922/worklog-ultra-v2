"use client";

import { z } from "zod";
import { bankTaskTimerSegment } from "@/lib/task-timer-math";
import { writeTaskTimerSnapshot, type SharedTaskTimerSnapshot } from "@/lib/task-timer-storage";

const updateSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pending", "in_progress", "done"]),
  trackedMinutes: z.number().int().nonnegative(),
  actualStart: z.string().datetime().nullable(),
  actualEnd: z.string().datetime().nullable(),
  note: z.string().nullable(),
});
export type ConfirmedTaskUpdate = z.infer<typeof updateSchema>;

/** A redirect/login page, empty body or unreadable response is not a successful save. */
export async function requestTaskJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const raw = await response.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Error("The server returned an unexpected response. Refresh and try again."); }
  const result = z.object({ message: z.string().min(1), taskUpdate: z.unknown().optional() }).safeParse(body);
  if (response.redirected || !result.success) throw new Error("The save could not be confirmed. Refresh and try again.");
  if (!response.ok) throw new Error(result.data.message);
  return result.data;
}

export function timerAtSave(snapshot: SharedTaskTimerSnapshot & { sampledAt?: number }, now = Date.now()) {
  const base = Number(snapshot.trackedSeconds ?? Number(snapshot.trackedMinutes) * 60);
  const seconds = snapshot.runningStartedAt
    ? bankTaskTimerSegment(base, snapshot.sampledAt ?? snapshot.runningStartedAt, now)
    : base;
  return { ...snapshot, trackedMinutes: String(Math.floor(seconds / 60)), trackedSeconds: String(seconds) };
}

async function sendPersonalTimer(taskId: string, reportDate: string, snapshot: SharedTaskTimerSnapshot, note?: string) {
  if (snapshot.status === "done") throw new Error("Use Done or reason-required Reopen to change a completed task.");
  return requestTaskJson("/api/dashboard/report", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportDate, updates: [{ dailyTaskId: taskId, status: snapshot.status,
      trackedMinutes: Number(snapshot.trackedMinutes), completionPercent: 0,
      actualStart: snapshot.actualStart, actualEnd: snapshot.actualEnd,
      ...(note === undefined ? {} : { note }) }] }),
  });
}

async function sendLifecycle(taskId: string, body: object) {
  const result = await requestTaskJson(`/api/dashboard/tasks/${taskId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const parsed = updateSchema.safeParse(result.taskUpdate);
  if (!parsed.success) throw new Error("The saved task state could not be confirmed. Refresh before retrying.");
  const update = parsed.data;
  const snapshot: SharedTaskTimerSnapshot = { status: update.status,
    trackedMinutes: String(update.trackedMinutes), trackedSeconds: String(update.trackedMinutes * 60),
    actualStart: update.actualStart ?? "", actualEnd: update.actualEnd ?? "", runningStartedAt: "" };
  writeTaskTimerSnapshot(update.reportDate, taskId, snapshot);
  return { message: result.message, update, snapshot };
}

// Prevent two controls in this page from submitting conflicting writes for one task.
// Durable cross-device concurrency control belongs to the server timer phase.
const pendingWrites = new Set<string>();
async function taskWrite<T>(taskId: string, action: () => Promise<T>): Promise<T> {
  if (pendingWrites.has(taskId)) throw new Error("This task is already being saved. Please wait.");
  pendingWrites.add(taskId);
  try { return await action(); } finally { pendingWrites.delete(taskId); }
}
export function savePersonalTimer(taskId: string, reportDate: string, snapshot: SharedTaskTimerSnapshot, note?: string) {
  return taskWrite(taskId, () => sendPersonalTimer(taskId, reportDate, snapshot, note));
}
function lifecycle(taskId: string, body: object) {
  return taskWrite(taskId, () => sendLifecycle(taskId, body));
}

export function completePersonalTask(taskId: string, completionNote: string, snapshot: SharedTaskTimerSnapshot) {
  const current = timerAtSave(snapshot);
  return lifecycle(taskId, { action: "complete_task", completionStatus: "done", completionNote,
    trackedMinutes: Number(current.trackedMinutes), actualStart: current.actualStart });
}

export function reopenPersonalTask(taskId: string, reopenReason: string) {
  return lifecycle(taskId, { action: "reopen_task", reopenReason });
}
