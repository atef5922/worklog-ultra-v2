"use client";

import { PieChart } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/dashboard/panel-header";

type DashboardStats = {
  plannedTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
};

export function DashboardProgressCard({
  plannedTasks: initialPlannedTasks,
  completedTasks: initialCompletedTasks,
  inProgressTasks: initialInProgressTasks,
  pendingTasks: initialPendingTasks,
}: {
  plannedTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
}) {
  const [stats, setStats] = useState<DashboardStats>({
    plannedTasks: initialPlannedTasks,
    completedTasks: initialCompletedTasks,
    inProgressTasks: initialInProgressTasks,
    pendingTasks: initialPendingTasks,
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setStats({
        plannedTasks: initialPlannedTasks,
        completedTasks: initialCompletedTasks,
        inProgressTasks: initialInProgressTasks,
        pendingTasks: initialPendingTasks,
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [initialCompletedTasks, initialInProgressTasks, initialPendingTasks, initialPlannedTasks]);

  useEffect(() => {
    function handleStatsUpdated(event: Event) {
      const detail = (event as CustomEvent<DashboardStats>).detail;
      if (!detail) {
        return;
      }

      setStats(detail);
    }

    window.addEventListener("dashboard:stats-updated", handleStatsUpdated);
    return () => window.removeEventListener("dashboard:stats-updated", handleStatsUpdated);
  }, []);

  const { plannedTasks, completedTasks, inProgressTasks, pendingTasks } = stats;
  const items = [
    {
      label: "Completed",
      value: completedTasks,
      color: "bg-emerald-500",
      valueColor: "text-emerald-600",
    },
    {
      label: "In Progress",
      value: inProgressTasks,
      color: "bg-blue-500",
      valueColor: "text-blue-600",
    },
    {
      label: "Pending",
      value: pendingTasks,
      color: "bg-rose-500",
      valueColor: "text-rose-600",
    },
  ];
  const totalTasks = Math.max(plannedTasks, completedTasks + inProgressTasks + pendingTasks);
  const completedDegrees = totalTasks ? (completedTasks / totalTasks) * 360 : 0;
  const inProgressDegrees = totalTasks ? (inProgressTasks / totalTasks) * 360 : 0;
  const pendingDegrees = Math.max(0, 360 - completedDegrees - inProgressDegrees);
  const ringBackground =
    totalTasks > 0
      ? `conic-gradient(#34c38f 0deg ${completedDegrees}deg, #3b82f6 ${completedDegrees}deg ${completedDegrees + inProgressDegrees}deg, #fbbf24 ${completedDegrees + inProgressDegrees}deg ${completedDegrees + inProgressDegrees + pendingDegrees}deg, #e8eef8 ${completedDegrees + inProgressDegrees + pendingDegrees}deg 360deg)`
      : "conic-gradient(#e8eef8 0deg 360deg)";

  return (
    <div
      className="dashboard-accent accent-violet shrink-0 rounded-[1.15rem] border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 shadow-[var(--shadow)]"
      data-dashboard-panel
    >
      <div className="grid grid-cols-[3.75rem_repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-2 sm:grid-cols-[11rem_4rem_repeat(3,minmax(0,1fr))] lg:grid-cols-[13rem_4.25rem_repeat(3,minmax(0,1fr))]">
        <div className="col-span-4 sm:col-span-1">
          <PanelHeader
            icon={PieChart}
            title="Today's Progress"
            tone="bg-violet-500/10 text-violet-500"
          />
        </div>
        <div
          aria-label={`${plannedTasks} tasks total`}
          className="dashboard-progress-ring flex h-[3.65rem] w-[3.65rem] shrink-0 items-center justify-center justify-self-center rounded-full sm:h-[3.8rem] sm:w-[3.8rem]"
          style={{ background: ringBackground }}
        >
          <div className="flex h-[2.65rem] w-[2.65rem] flex-col items-center justify-center rounded-full bg-[var(--panel)]">
            <p
              className="dashboard-value-pop text-[1.05rem] font-bold leading-none text-[var(--foreground)]"
              key={plannedTasks}
            >
              {plannedTasks}
            </p>
            <p className="mt-0.5 text-[0.58rem] leading-none text-[var(--muted-foreground)]">Total</p>
          </div>
        </div>
        {items.map((item) => (
          <div
            className="min-w-0 border-l border-[var(--panel-border)] px-2 sm:px-3 lg:px-5"
            key={item.label}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${item.color}`} />
              <span className="truncate text-[0.66rem] font-semibold text-[var(--muted-foreground)] sm:text-[0.72rem]">
                {item.label}
              </span>
            </div>
            <p
              className={`mt-0.5 truncate text-[0.78rem] font-bold tabular-nums sm:text-[0.88rem] ${item.valueColor}`}
            >
              {item.value} ({totalTasks ? Math.round((item.value / totalTasks) * 100) : 0}%)
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
