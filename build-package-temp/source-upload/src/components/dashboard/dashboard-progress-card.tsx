"use client";

export function DashboardProgressCard({
  plannedTasks,
  completedTasks,
  inProgressTasks,
  pendingTasks,
}: {
  plannedTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
}) {
  const items = [
    { label: "Completed", value: completedTasks, color: "bg-emerald-500" },
    { label: "In Progress", value: inProgressTasks, color: "bg-blue-500" },
    { label: "Pending", value: pendingTasks, color: "bg-amber-400" },
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
    <div className="rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
      <h3 className="text-[1.05rem] font-bold text-[var(--foreground)]">Today&apos;s Progress</h3>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="dashboard-progress-ring flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
          style={{ background: ringBackground }}
        >
          <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-[var(--panel)]">
            <p className="text-[1.8rem] font-bold leading-none text-[var(--foreground)]">{plannedTasks}</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Total Tasks</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {items.map((item) => (
            <div className="flex items-center justify-between gap-3 text-sm" key={item.label}>
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${item.color}`} />
                <span className="whitespace-nowrap font-medium text-[var(--muted-foreground)]">{item.label}</span>
              </div>
              <span className="shrink-0 whitespace-nowrap font-semibold text-[var(--foreground)]">
                {item.value} ({plannedTasks ? Math.round((item.value / plannedTasks) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
