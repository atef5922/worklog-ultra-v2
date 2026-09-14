"use client";

import { z } from "zod";
import type { AttendanceAction } from "@/lib/attendance-action-validation";
import type { DashboardAttendanceSnapshot } from "@/lib/contracts/user";
import { ATTENDANCE_STARTED_EVENT, ATTENDANCE_STOPPED_EVENT } from "@/lib/dashboard-live-events";
import { toDateOnly } from "@/lib/utils";

const time = z.string().datetime({ offset: true });
const session = z.object({ id: z.string().min(1), startedAt: time, endedAt: time.nullable(), endReason: z.string().nullable() });
const snapshotSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/), attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "late", "half_day", "absent", "remote"]), note: z.string().nullable().transform(value => value ?? ""),
  breakMinutes: z.number().int().nonnegative(), legacyBreakMinutes: z.number().int().nonnegative(),
  checkInAt: time.nullable(), checkOutAt: time.nullable(), active: z.boolean(), onBreak: z.boolean(),
  currentSessionStartedAt: time.nullable(), currentBreakStartedAt: time.nullable(),
  workSessions: z.array(session), breakSessions: z.array(session),
}).refine(snapshot => {
  const work = snapshot.workSessions.filter(s => !s.endedAt), breaks = snapshot.breakSessions.filter(s => !s.endedAt);
  return work.length <= 1 && breaks.length <= 1 && snapshot.active === (work.length === 1) &&
    snapshot.onBreak === (breaks.length === 1) && (!snapshot.onBreak || snapshot.active) &&
    snapshot.currentSessionStartedAt === (work[0]?.startedAt ?? null) &&
    snapshot.currentBreakStartedAt === (breaks[0]?.startedAt ?? null);
});
const responseSchema = z.object({ success: z.literal(true), serverNow: time, snapshot: snapshotSchema.nullable(),
  message: z.string().optional(), userId: z.string().min(1) });
export type AttendanceEnvelope = z.infer<typeof responseSchema>;
export const ATTENDANCE_UPDATED_EVENT = "worklog:attendance-updated";
export const attendanceSyncKey = (userId: string) => `attendance-revision:${userId}`;

async function readResponse(response: Response): Promise<AttendanceEnvelope> {
  let body: unknown;
  try { body = JSON.parse(await response.text()); }
  catch { throw new Error("Attendance could not be confirmed. Refresh and try again."); }
  if (!response.ok) {
    const error = z.object({ message: z.string() }).safeParse(body);
    throw new Error(error.success ? error.data.message : "Attendance update failed. Refresh and try again.");
  }
  const parsed = responseSchema.safeParse(body);
  if (response.redirected || !parsed.success) throw new Error("Attendance could not be confirmed. Refresh and try again.");
  return parsed.data;
}

export async function loadAttendance(currentUserId: string) {
  const result = await readResponse(await fetch("/api/dashboard/attendance", { cache: "no-store", signal: AbortSignal.timeout(15_000) }));
  if (result.userId !== currentUserId) throw new Error("Your session changed. Please sign in again.");
  return result;
}

const savingUsers = new Set<string>();
export async function saveAttendanceAction(userId: string, action: AttendanceAction,
  current: DashboardAttendanceSnapshot | null, serverNow: Date) {
  if (savingUsers.has(userId)) throw new Error("Attendance is already being saved. Please wait.");
  savingUsers.add(userId);
  try {
    const day = action === "check_in" ? toDateOnly(serverNow) : current?.attendanceDate ?? toDateOnly(serverNow);
    const random = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const result = await readResponse(await fetch("/api/dashboard/attendance", {
      method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action, expectedUserId: userId, attendanceDate: day, expectedRevision: current?.attendanceDate === day ? current.revision : null,
        eventId: `${action}-${random}`, ...(action === "check_out" ? { endReason: "manual" } : {}),
      }),
    }));
    if (result.userId !== userId) throw new Error("Your session changed. Please sign in again.");
    const saved = result.snapshot;
    const matches = saved && saved.attendanceDate === day && (action === "check_out" ? !saved.active && !saved.onBreak
      : saved.active && saved.onBreak === (action === "break_start"));
    if (!matches) throw new Error("The requested attendance state could not be confirmed. Refresh and try again.");
    return result;
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new Error("Attendance confirmation timed out. Check the current status before trying again.");
    }
    throw error;
  } finally { savingUsers.delete(userId); }
}

export function publishAttendance(userId: string, envelope: AttendanceEnvelope, previous: DashboardAttendanceSnapshot | null) {
  const current = envelope.snapshot;
  if (current?.active && !previous?.active) {
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-start", { detail: { source: "attendance", label: "Attendance" } }));
    window.dispatchEvent(new CustomEvent(ATTENDANCE_STARTED_EVENT));
  } else if (!current?.active && previous?.active) {
    window.dispatchEvent(new CustomEvent("worklog:task-monitor-stop", { detail: { source: "attendance" } }));
    window.dispatchEvent(new CustomEvent(ATTENDANCE_STOPPED_EVENT));
  }
  if (current?.active && current.onBreak !== Boolean(previous?.onBreak)) {
    window.dispatchEvent(new CustomEvent(current.onBreak ? "worklog:task-monitor-pause" : "worklog:task-monitor-resume"));
  }
  window.dispatchEvent(new CustomEvent(ATTENDANCE_UPDATED_EVENT, { detail: { userId, envelope } }));
  try { window.localStorage.setItem(attendanceSyncKey(userId), current?.revision ?? "none"); }
  catch { /* Cross-tab polling remains available when storage is disabled. */ }
}
