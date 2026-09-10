"use client";

import { Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { readTaskTimerSnapshot } from "@/lib/task-timer-storage";
import { parseDhakaDateTime, toDateOnly, STANDARD_DAILY_HOURS } from "@/lib/utils";

type TimeSummaryTask = {
  id: string;
  trackedMinutes: number;
};

type AttendanceSnapshot = {
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakMinutes: number;
};

const DEFAULT_BREAK_MINUTES = 45;

function formatDurationWithSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatDurationFromMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function calculateElapsedSecondsSince(value: string, now: number) {
  if (!value) {
    return null;
  }

  const parsedStart = parseDhakaDateTime(value);
  if (!parsedStart || parsedStart.getTime() > now) {
    return null;
  }

  return Math.floor((now - parsedStart.getTime()) / 1000);
}

export function DashboardTimeSummary({
  plannedTasks,
  tasks,
  attendance,
}: {
  plannedTasks: number;
  tasks: TimeSummaryTask[];
  attendance?: AttendanceSnapshot | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const reportDate = useMemo(() => toDateOnly(), []);

  useEffect(() => {
    setNow(Date.now());
    setHydrated(true);
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 100); // Update every 100ms for smooth seconds counting
    return () => window.clearInterval(interval);
  }, []);

  // Calculate work time and break time with live seconds
  // If attendance is completed (checked out), show reset state for next day
  const { totalWorkSeconds, breakMinutes } = useMemo(() => {
    if (!attendance?.checkInAt || now === null) {
      return { totalWorkSeconds: 0, breakMinutes: 0 };
    }

    // If checked out, reset for next day (don't show old session data)
    if (attendance.checkOutAt) {
      return { totalWorkSeconds: 0, breakMinutes: 0 };
    }

    // Work time: check-in to now (only if still running)
    const checkInParsed = parseDhakaDateTime(attendance.checkInAt);
    if (!checkInParsed || !Number.isFinite(checkInParsed.getTime())) {
      return { totalWorkSeconds: 0, breakMinutes: 0 };
    }

    const checkInTime = checkInParsed.getTime();
    if (!Number.isFinite(checkInTime) || checkInTime > now) {
      return { totalWorkSeconds: 0, breakMinutes: 0 };
    }

    // Calculate elapsed seconds with proper rounding
    const elapsedSeconds = Math.max(0, Math.floor((now - checkInTime) / 1000));
    const breakMins = Math.max(0, attendance.breakMinutes ?? 0);

    return {
      totalWorkSeconds: elapsedSeconds,
      breakMinutes: breakMins,
    };
  }, [now, attendance]);

  // Calculate actual productive time with unlimited break model
  // Standard break: 45 min (always deducted)
  // Extra break: tracked separately, not deducted from work time
  const standardBreakMinutes = 45;
  const breakDeductedMinutes = Math.min(breakMinutes, standardBreakMinutes);
  const overBreakMinutes = Math.max(0, breakMinutes - standardBreakMinutes);

  const breakDeductedSeconds = breakDeductedMinutes * 60;
  const actualProductiveSeconds = Math.max(0, totalWorkSeconds - breakDeductedSeconds);
  const plannedWorkSeconds = STANDARD_DAILY_HOURS * 3600;
  const remainingSeconds = Math.max(0, plannedWorkSeconds - actualProductiveSeconds);

  const breakDisplayValue = overBreakMinutes > 0
    ? `${breakMinutes}m (${standardBreakMinutes}m std + ${overBreakMinutes}m over)`
    : `${breakMinutes}m / ${DEFAULT_BREAK_MINUTES}m`;

  const items = [
    { label: "Planned Work Time", value: formatDurationFromMinutes(Math.floor(plannedWorkSeconds / 60)) },
    { label: "Work Time (Total)", value: formatDurationWithSeconds(totalWorkSeconds) },
    { label: "Break Time", value: breakDisplayValue },
    { label: "Actual Work Time", value: formatDurationWithSeconds(actualProductiveSeconds) },
    { label: "Remaining Time", value: formatDurationWithSeconds(remainingSeconds) },
  ];

  const completionPercent = plannedWorkSeconds ? Math.min(100, Math.round((actualProductiveSeconds / plannedWorkSeconds) * 100)) : 0;

  return (
    <div
      className="dashboard-accent accent-sky shrink-0 rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5"
      data-dashboard-panel
    >
      <PanelHeader icon={Timer} title="Time Summary" tone="bg-sky-500/10 text-sky-500" />
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--panel-muted)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4f5ef7] to-[#22c55e] transition-[width] duration-500 ease-out"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[0.6875rem] font-bold tabular-nums text-[var(--muted-foreground)]">{completionPercent}%</span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] pb-0.5 last:border-b-0 last:pb-0" key={item.label}>
            <span className="min-w-0 truncate text-[0.72rem] font-medium text-[var(--muted-foreground)]">{item.label}</span>
            <span className={`whitespace-nowrap text-[0.72rem] font-bold tabular-nums ${item.label === "Remaining Time" ? "text-rose-500" : "text-[var(--foreground)]"}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
