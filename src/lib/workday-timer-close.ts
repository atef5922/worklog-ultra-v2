"use client";

import { toDhakaOffsetIso } from "@/lib/utils";

const WORKDAY_STORAGE_PREFIX = "workday-timer:";
const PENDING_ATTENDANCE_PREFIX = "workday-timer-pending-sync:";

type StoredWorkdayTimer = {
  lastCheckInAt?: string | null;
  lastCheckOutAt?: string | null;
  activeBreakStartedAt?: string | null;
};

type PendingAttendanceAction = {
  action: "check_out";
  attendanceDate: string;
  occurredAt: string;
  eventId: string;
  endReason: "device_shutdown";
};

export async function retryPendingAttendanceSyncs() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith(PENDING_ATTENDANCE_PREFIX)));

  for (const key of keys) {
    try {
      const payload = JSON.parse(window.localStorage.getItem(key) ?? "") as PendingAttendanceAction;
      const response = await fetch("/api/dashboard/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) window.localStorage.removeItem(key);
    } catch {
      // Keep the idempotent action for the next authenticated dashboard load.
    }
  }
}

/** Close only the currently open work segment; the day remains reusable. */
export function closeRunningAttendanceForShutdown(closedAt = new Date()) {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(WORKDAY_STORAGE_PREFIX)) continue;

    const [, userId, attendanceDate] = key.split(":");
    const raw = window.localStorage.getItem(key);
    if (!userId || !attendanceDate || !raw) continue;

    try {
      const snapshot = JSON.parse(raw) as StoredWorkdayTimer;
      if (!snapshot.lastCheckInAt || snapshot.lastCheckOutAt) continue;

      const occurredAt = toDhakaOffsetIso(closedAt);
      const payload: PendingAttendanceAction = {
        action: "check_out",
        attendanceDate,
        occurredAt,
        eventId: `device-shutdown-${userId}-${attendanceDate}-${closedAt.getTime()}`,
        endReason: "device_shutdown",
      };

      window.localStorage.setItem(key, JSON.stringify({
        ...snapshot,
        activeBreakStartedAt: null,
        lastCheckOutAt: occurredAt,
      }));
      const pendingKey = `${PENDING_ATTENDANCE_PREFIX}${userId}:${attendanceDate}`;
      window.localStorage.setItem(pendingKey, JSON.stringify(payload));
      navigator.sendBeacon("/api/dashboard/attendance", JSON.stringify(payload));
    } catch {
      // A malformed legacy snapshot is ignored; server/device recovery remains.
    }
  }
}