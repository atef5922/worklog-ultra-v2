"use client";

import { Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import type { DashboardAttendanceSnapshot } from "@/lib/contracts/user";
import { STANDARD_DAILY_HOURS } from "@/lib/utils";

type TimeSummaryTask = {
  id: string;
  trackedMinutes: number;
};

function formatDurationFromMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}m`;
}

export function DashboardTimeSummary({
  plannedTasks: _plannedTasks,
  tasks: _tasks,
  attendance,
}: {
  plannedTasks: number;
  tasks: TimeSummaryTask[];
  attendance?: DashboardAttendanceSnapshot | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = useMemo(
    () => calculateSegmentedAttendanceMetrics({
      attendanceDate: attendance?.attendanceDate ?? "",
      workSessions: attendance?.workSessions ?? [],
      breakSessions: attendance?.breakSessions ?? [],
      legacyBreakMinutes: attendance?.legacyBreakMinutes ?? 0,
      now: new Date(now),
    }),
    [attendance, now],
  );
  const plannedMinutes = STANDARD_DAILY_HOURS * 60;
  const remainingMinutes = Math.max(0, plannedMinutes - metrics.workingMinutes);
  const breakDisplayValue = metrics.excessBreakMinutes > 0
    ? `${formatDurationFromMinutes(metrics.breakMinutes)} (${metrics.excessBreakMinutes}m deducted)`
    : `${formatDurationFromMinutes(metrics.breakMinutes)} / 0h 45m included`;

  const items = [
    { label: "Planned Work Time", value: formatDurationFromMinutes(plannedMinutes) },
    { label: "Counted Work", value: formatDurationFromMinutes(metrics.workingMinutes) },
    { label: "Active Work", value: formatDurationFromMinutes(metrics.activeMinutes) },
    { label: "Break Time", value: breakDisplayValue },
    { label: "Outside Gap", value: formatDurationFromMinutes(metrics.outsideMinutes) },
    { label: "Remaining Time", value: formatDurationFromMinutes(remainingMinutes) },
  ];
  const completionPercent = plannedMinutes
    ? Math.min(100, Math.round((metrics.workingMinutes / plannedMinutes) * 100))
    : 0;

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
        <span className="shrink-0 font-mono text-[0.6875rem] font-bold tabular-nums text-[var(--muted-foreground)]">
          {completionPercent}%
        </span>
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