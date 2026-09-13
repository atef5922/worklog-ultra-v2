"use client";

const PENDING_ATTENDANCE_PREFIX = "workday-timer-pending-sync:";

export function clearPendingAttendanceSyncs() {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(PENDING_ATTENDANCE_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
}
